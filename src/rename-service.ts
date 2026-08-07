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
import { applyBodyTagRemoval, foldName, mergeTagsIntoList, movableTags } from './tag-mover';

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
    /** Experimental tag move: tags this run would/did process (honest count). */
    movedTags?: number;
    /** Experimental tag move: candidates skipped because their cached offsets went stale. */
    staleTags?: number;
}

export interface RenameOptions {
    /** Compute the outcome without renaming (batch preview). */
    dryRun?: boolean;
    /**
     * Experimental tag move opt-out for this call. Defaults to true; main.ts
     * passes false for 'edit'-sourced renames (the single automatic-trigger
     * entry point) so a half-typed tag is never collected mid-writing.
     */
    allowTagMove?: boolean;
}

/** Case-fold + NFC-normalize a file name for collision comparison. */
export { foldName };

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
        const dryRun = options?.dryRun === true;
        const allowTagMove = options?.allowTagMove !== false;
        const task = this.chain.then(async () => {
            // Captured before runRename so the alias write (deferred below)
            // still knows the pre-rename name.
            const oldBasename = file.basename;
            const outcome = await this.runRename(file, dryRun);
            if (RenameService.tagMoveEligible(outcome)) {
                const res = await this.maybeMoveTagsToFrontmatter(file, dryRun, allowTagMove);
                if (res.moved > 0) outcome.movedTags = res.moved;
                if (res.stale > 0) outcome.staleTags = res.stale;
            }
            // Alias write runs AFTER the tag move on purpose: it rewrites the
            // frontmatter, which shifts every body offset and would turn all
            // tag-move candidates stale (silent keep-mode degradation).
            if (!dryRun && !outcome.error && outcome.skipped === 'none' && outcome.newName) {
                await this.writeOldNameAlias(file, oldBasename, outcome.newName);
            }
            return outcome;
        });
        // Don't let one failure break the chain for subsequent tasks.
        this.chain = task.catch(() => undefined);
        return task;
    }

    /**
     * Spec table (design doc §5): the tag move runs whenever the rename flow
     * ran — including alignment skips — but never for locked or already-busy
     * files, and never when the rename itself errored.
     */
    private static tagMoveEligible(this: void, outcome: RenameOutcome): boolean {
        if (outcome.error) return false;
        return outcome.skipped !== 'locked' && outcome.skipped !== 'in-progress';
    }

    /**
     * Optional: keep the pre-rename name findable via frontmatter aliases.
     * Best-effort — an alias failure never fails the rename.
     */
    private async writeOldNameAlias(
        file: TFile,
        oldBasename: string,
        finalBase: string,
    ): Promise<void> {
        const settings = this.getSettings();
        if (!settings.preserveOldNameAsAlias) return;
        if (foldName(oldBasename) === foldName(finalBase)) return;
        try {
            await this.app.fileManager.processFrontMatter(
                file,
                (fm: Record<string, unknown>) => {
                    const existing = fm.aliases;
                    const list = Array.isArray(existing)
                        ? existing
                        : existing == null
                            ? []
                            : [existing];
                    // String(a): YAML may parse an alias like 2025 as a
                    // number — it must still dedup.
                    const already = list.some(
                        (a) => foldName(String(a)) === foldName(oldBasename),
                    );
                    if (!already) list.push(oldBasename);
                    fm.aliases = list;
                },
            );
        } catch (err) {
            console.error('[H1Aligner] alias write failed:', err);
        }
    }

    /**
     * Experimental: collect inline tags into frontmatter (design doc §5).
     * Returns honest counts: `moved` is what this run actually processed
     * (candidates on dry run, applied removals / new frontmatter entries
     * live) and `stale` the candidates skipped by the staleness guard.
     * Never throws; failures never affect the rename outcome.
     */
    private async maybeMoveTagsToFrontmatter(
        file: TFile,
        dryRun: boolean,
        allow: boolean,
    ): Promise<{ moved: number; stale: number }> {
        const none = { moved: 0, stale: 0 };
        const settings = this.getSettings();
        if (!settings.moveTagsToFrontmatter || !allow) return none;
        try {
            const cache = this.app.metadataCache.getFileCache(file);
            if (!cache) {
                // Not indexed yet; skip rather than fall back to regex (spec).
                console.warn('[H1Aligner] tag move skipped, no metadata cache yet:', file.path);
                return none;
            }
            if (!cache.tags || cache.tags.length === 0) return none;
            let body: string;
            try {
                body = await this.app.vault.cachedRead(file);
            } catch {
                return none;
            }
            // Raw-content lock fallback: the frontmatter lock must hold even
            // when the cache runRename's L0 consulted lags behind the file.
            if (settings.skipIfFrontmatterLock && hasFrontmatterLock(body)) return none;
            const candidates = movableTags(cache, body, settings.tagsToIgnoreForMove);
            if (candidates.length === 0) return none;

            // Resolved once so TS narrows the union for applyBodyTagRemoval.
            const mode = settings.bodyTagHandling === 'keep' ? null : settings.bodyTagHandling;
            const removing = mode !== null;
            // Keep-mode no-op check against the cached frontmatter: when every
            // candidate is already listed there is nothing to write. Stale-safe
            // (worst case: skip now, catch up next run). Remove modes must
            // never take this shortcut — a stale "already there" verdict would
            // delete body tags without their frontmatter counterpart.
            const fmCache: Record<string, unknown> | undefined = cache.frontmatter;
            const existingRaw = fmCache?.tags !== undefined ? fmCache.tags : fmCache?.tag;
            const existingCount = mergeTagsIntoList(existingRaw, []).length;
            const newCount =
                mergeTagsIntoList(existingRaw, candidates.map((c) => c.tag)).length -
                existingCount;
            if (!removing && newCount === 0) return none;
            if (dryRun) return { moved: removing ? candidates.length : newCount, stale: 0 };

            // Step 1 (remove modes only) — body rewrite. Must run BEFORE the
            // frontmatter write: rewriting frontmatter shifts every body
            // offset, which would fail all staleness checks.
            let bodyBefore: string | null = null;
            let bodyAfter: string | null = null;
            let applied = 0;
            let skippedStale = 0;
            if (mode !== null) {
                await this.app.vault.process(file, (data: string) => {
                    bodyBefore = data;
                    const res = applyBodyTagRemoval(data, candidates, mode);
                    applied = res.applied;
                    skippedStale = res.skippedStale;
                    bodyAfter = res.text;
                    return res.text;
                });
                if (skippedStale > 0) {
                    console.warn(
                        `[H1Aligner] tag move: ${skippedStale} tag(s) skipped (stale cache): ${file.path}`,
                    );
                }
            }

            // Step 2 — merge into frontmatter. Uses tag NAMES only (no
            // positions), atomically against the file's current state, so the
            // gap between the two writes is provably safe (design §5).
            try {
                await this.app.fileManager.processFrontMatter(
                    file,
                    (fm: Record<string, unknown>) => {
                        // 'tags' wins when both keys exist; singular 'tag' is
                        // read-only input and stays untouched in the file.
                        const existing = fm.tags !== undefined ? fm.tags : fm.tag;
                        fm.tags = mergeTagsIntoList(existing, candidates.map((c) => c.tag));
                    },
                );
            } catch (err) {
                console.error('[H1Aligner] tag move frontmatter write failed:', err);
                // Best-effort rollback: without it the removed body tags would
                // exist nowhere. Only restores when the file still matches our
                // own rewrite; a user edit in between aborts the restore.
                if (bodyBefore !== null && bodyAfter !== null) {
                    try {
                        await this.app.vault.process(file, (data: string) => {
                            if (data === bodyAfter) return bodyBefore as string;
                            console.warn(
                                '[H1Aligner] tag move rollback abandoned (file changed since):',
                                file.path,
                            );
                            return data;
                        });
                    } catch (rollbackErr) {
                        console.error('[H1Aligner] tag move rollback failed:', rollbackErr);
                    }
                }
                return { moved: 0, stale: skippedStale };
            }
            return { moved: removing ? applied : newCount, stale: skippedStale };
        } catch (err) {
            console.error('[H1Aligner] tag move failed:', err);
            return none;
        }
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
                const fm: Record<string, unknown> | undefined = cache?.frontmatter;
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
            // NOTE: the optional old-name alias write happens in renameFromH1,
            // after the tag move, so it cannot shift the tag offsets first.
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
