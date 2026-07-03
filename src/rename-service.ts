/**
 * rename-service.ts — Serialised rename orchestrator.
 *
 * Design:
 *   - Serial chain Promise. Each renameFromH1() enqueues; chain.catch() ensures
 *     one failed task doesn't poison the queue.
 *   - `processingFiles: Set<string>` belt-and-suspenders re-entrancy guard.
 *   - Uses `app.fileManager.renameFile` — updates all backlinks atomically
 *     (vault.rename does NOT update links).
 *
 * Guard layers:
 *   L0 locked               → frontmatter `h1aligner-lock: true` (opt-out per file)
 *   L1 no-h1                → no rename
 *   L2 empty-after-sanitize → no rename
 *   L3 same-name            → no rename (idempotent); 'case-only' when the
 *                             names differ only by case/NFC and the
 *                             allowCaseOnlyRename setting is off
 *   L4 collision            → 'skip' strategy: no rename;
 *                             'number' strategy: first free "Name N"
 *
 * Collision checks are case- and NFC-insensitive (sibling scan), matching
 * NTFS/APFS semantics; the file itself is exempt so case-only self-renames
 * stay possible.
 *
 * Per-file debounce lives in main.ts; this module is debounce-agnostic.
 * `renameFromH1(file, { dryRun: true })` computes the outcome without
 * touching the vault (used by the batch preview).
 */
import type { App, TFile } from 'obsidian';
import { extractFirstH1, hasFrontmatterLock } from './heading';
import { sanitizeFileName } from './filename';
import { renderNameTemplate } from './template';
import type { H1AlignerSettings } from './settings';
import type { RenameHistory } from './history';

export type RenameSkipReason =
    | 'none'
    | 'locked'
    | 'no-h1'
    | 'empty-after-sanitize'
    | 'same-name'
    | 'case-only'
    | 'collision'
    | 'in-progress';

export interface RenameOutcome {
    skipped: RenameSkipReason;
    newName: string | null;
    error?: Error;
}

export interface RenameOptions {
    /** Compute the outcome without renaming (batch preview). */
    dryRun?: boolean;
}

/** Case-fold + NFC-normalize a file name for collision comparison. */
export function foldName(name: string): string {
    try { name = name.normalize('NFC'); } catch { /* no Intl normalize */ }
    return name.toLowerCase();
}

export class RenameService {
    private readonly processingFiles: Set<string> = new Set();
    private chain: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly app: App,
        private readonly getSettings: () => H1AlignerSettings,
        private readonly history?: RenameHistory,
    ) {}

    /**
     * Public entry: enqueue a rename attempt. Returns the outcome.
     * Errors are captured in the outcome (do not throw to the caller).
     */
    async renameFromH1(file: TFile, options?: RenameOptions): Promise<RenameOutcome> {
        const task = this.chain.then(() => this.runRename(file, options?.dryRun === true));
        // Don't let one failure break the chain for subsequent tasks.
        this.chain = task.catch(() => undefined);
        return task;
    }

    private async runRename(file: TFile, dryRun: boolean): Promise<RenameOutcome> {
        const path = file.path;

        if (this.processingFiles.has(path)) {
            return { skipped: 'in-progress', newName: null };
        }
        this.processingFiles.add(path);

        try {
            const settings = this.getSettings();
            const cache = this.app.metadataCache.getFileCache(file);

            // L0: frontmatter lock (per-file opt-out)
            if (settings.skipIfFrontmatterLock) {
                const fm = cache?.frontmatter as Record<string, unknown> | undefined;
                const lock = fm ? fm['h1aligner-lock'] : undefined;
                // Case-insensitive on strings so quoted YAML ("True") agrees
                // with the raw-content fallback scan.
                if (
                    lock === true ||
                    (typeof lock === 'string' && lock.toLowerCase() === 'true')
                ) {
                    return { skipped: 'locked', newName: null };
                }
            }

            // Extract H1 — cache first, fall back to file read.
            // "Usable" mirrors extractFirstH1's Strategy A: a level-1 heading
            // whose text is non-empty after trim.
            let content: string | undefined;
            const cacheHasUsableH1 = Boolean(
                cache && cache.headings && cache.headings.some(
                    (h) =>
                        h.level === 1 &&
                        typeof h.heading === 'string' &&
                        h.heading.trim().length > 0,
                ),
            );
            if (!cacheHasUsableH1) {
                try {
                    content = await this.app.vault.cachedRead(file);
                } catch {
                    content = undefined;
                }
                // L0 again on raw content: with an unpopulated cache the
                // frontmatter lock must still hold (sync/new-file window).
                if (
                    settings.skipIfFrontmatterLock &&
                    typeof content === 'string' &&
                    hasFrontmatterLock(content)
                ) {
                    return { skipped: 'locked', newName: null };
                }
            }
            const { h1 } = extractFirstH1(cache, content);

            // L1: No H1
            if (!h1) {
                return { skipped: 'no-h1', newName: null };
            }

            // Template + sanitize — byte budget keeps base + '.' + ext within
            // the 255-byte NAME_MAX shared by APFS, ext4/f2fs and NTFS.
            const ext = file.extension || 'md';
            const maxBytes = 255 - (ext.length + 1);
            const ctime = file.stat?.ctime ?? Date.now();
            const rendered = renderNameTemplate(settings.nameTemplate, { h1, ctime });
            const newBase = sanitizeFileName(rendered, {
                trimWhitespace: settings.trimWhitespace,
                replaceIllegalCharacters: settings.replaceIllegalCharacters,
                illegalReplacementChar: settings.illegalReplacementChar,
                maxLength: settings.maxFilenameLength,
                maxBytes,
            });

            // L2: Empty after sanitize
            if (!newBase) {
                return { skipped: 'empty-after-sanitize', newName: null };
            }

            // L3: Same name (idempotent) / case-only policy
            if (newBase === file.basename) {
                return { skipped: 'same-name', newName: null };
            }
            if (!settings.allowCaseOnlyRename && foldName(newBase) === foldName(file.basename)) {
                return { skipped: 'case-only', newName: null };
            }

            const parentPath = file.parent ? file.parent.path : '';
            const dir = parentPath && parentPath !== '/' ? parentPath + '/' : '';

            // L4: Collision — with optional "Name N" numbering
            let finalBase = newBase;
            if (this.hasCollision(file, dir, finalBase, ext)) {
                if (settings.collisionStrategy !== 'number') {
                    return { skipped: 'collision', newName: newBase };
                }
                const numbered = this.firstFreeNumbered(file, dir, newBase, ext, maxBytes);
                if (numbered === null) {
                    return { skipped: 'collision', newName: newBase };
                }
                // Numbering can land on the file's OWN current name (e.g.
                // "Note 1.md" whose H1 is "Note" while "Note.md" exists) —
                // re-apply the L3 checks so the outcome stays idempotent.
                if (numbered === file.basename) {
                    return { skipped: 'same-name', newName: null };
                }
                if (
                    !settings.allowCaseOnlyRename &&
                    foldName(numbered) === foldName(file.basename)
                ) {
                    return { skipped: 'case-only', newName: null };
                }
                finalBase = numbered;
            }

            const newPath = dir + finalBase + '.' + ext;
            if (dryRun) {
                return { skipped: 'none', newName: finalBase };
            }

            // Execute — fileManager.renameFile updates backlinks atomically
            await this.app.fileManager.renameFile(file, newPath);
            // The live TFile goes into the record so undo can verify identity
            // (a path alone could later resolve to an unrelated new file).
            this.history?.push({ from: path, to: newPath, file });
            return { skipped: 'none', newName: finalBase };
        } catch (err) {
            return {
                skipped: 'none',
                newName: null,
                error: err instanceof Error ? err : new Error(String(err)),
            };
        } finally {
            this.processingFiles.delete(path);
        }
    }

    /**
     * Exact-path index lookup first; then a case- and NFC-insensitive sibling
     * scan, because NTFS and APFS resolve names case-insensitively (APFS also
     * normalization-insensitively) while getAbstractFileByPath is
     * case-sensitive — an index miss does not mean the destination is free.
     * The file itself is exempt: case-only self-renames are a feature.
     */
    private hasCollision(file: TFile, dir: string, base: string, ext: string): boolean {
        const newPath = dir + base + '.' + ext;
        const existing = this.app.vault.getAbstractFileByPath(newPath);
        if (existing && existing.path !== file.path) return true;

        const targetKey = foldName(base + '.' + ext);
        const siblings: unknown = file.parent
            ? (file.parent as { children?: unknown }).children
            : undefined;
        if (Array.isArray(siblings)) {
            for (const sib of siblings as Array<{ name?: unknown }>) {
                if ((sib as unknown) === (file as unknown)) continue;
                if (typeof sib.name === 'string' && foldName(sib.name) === targetKey) {
                    return true;
                }
            }
        }
        return false;
    }

    /** First free "base N" (N = 1..999), trimmed to the byte budget. */
    private firstFreeNumbered(
        file: TFile,
        dir: string,
        base: string,
        ext: string,
        maxBytes: number,
    ): string | null {
        const enc = new TextEncoder();
        for (let n = 1; n <= 999; n++) {
            const suffix = ' ' + n;
            let stem = base;
            // Shrink the stem so stem + suffix stays within the byte budget.
            if (maxBytes > 0) {
                const cps = Array.from(stem);
                while (
                    cps.length > 0 &&
                    enc.encode(cps.join('') + suffix).length > maxBytes
                ) {
                    cps.pop();
                }
                stem = cps.join('').replace(/[.\s]+$/, '');
                if (!stem) return null;
            }
            const candidate = stem + suffix;
            if (!this.hasCollision(file, dir, candidate, ext)) {
                return candidate;
            }
        }
        return null;
    }
}
