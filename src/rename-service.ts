/**
 * rename-service.ts — Serialised rename orchestrator.
 *
 * Phase 1 MVP design (per 技術設計草案 + PPLX Q2 & Q5):
 *   - Serial chain Promise. Each renameFromH1() enqueues; chain.catch() ensures
 *     one failed task doesn't poison the queue.
 *   - `processingFiles: Set<string>` belt-and-suspenders re-entrancy guard.
 *   - Uses `app.fileManager.renameFile` — updates all backlinks atomically
 *     (per PPLX Q2 best practice; vault.rename does NOT update links).
 *
 * Four protection layers (per 既有設計):
 *   L1 no-h1               → no rename
 *   L2 empty-after-sanitize → no rename
 *   L3 same-name            → no rename (idempotent)
 *   L4 collision            → no rename (sibling with same name exists)
 *
 * Per-file debounce lives in main.ts (file-open burst coalescing); this module
 * is debounce-agnostic — it just serialises whatever lands in its queue.
 */
import type { App, TFile } from 'obsidian';
import { extractFirstH1 } from './heading';
import { sanitizeFileName } from './filename';
import type { H1AlignerSettings } from './settings';

export type RenameSkipReason =
    | 'none'
    | 'no-h1'
    | 'empty-after-sanitize'
    | 'same-name'
    | 'collision'
    | 'in-progress';

export interface RenameOutcome {
    skipped: RenameSkipReason;
    newName: string | null;
    error?: Error;
}

/** Case-fold + NFC-normalize a file name for collision comparison. */
function foldName(name: string): string {
    try { name = name.normalize('NFC'); } catch { /* no Intl normalize */ }
    return name.toLowerCase();
}

export class RenameService {
    private readonly processingFiles: Set<string> = new Set();
    private chain: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly app: App,
        private readonly getSettings: () => H1AlignerSettings,
    ) {}

    /**
     * Public entry: enqueue a rename attempt. Returns the outcome.
     * Errors are captured in the outcome (do not throw to the caller).
     */
    async renameFromH1(file: TFile): Promise<RenameOutcome> {
        const task = this.chain.then(() => this.runRename(file));
        // Don't let one failure break the chain for subsequent tasks.
        this.chain = task.catch(() => undefined);
        return task;
    }

    private async runRename(file: TFile): Promise<RenameOutcome> {
        const path = file.path;

        if (this.processingFiles.has(path)) {
            return { skipped: 'in-progress', newName: null };
        }
        this.processingFiles.add(path);

        try {
            const settings = this.getSettings();

            // Extract H1 — cache first, fall back to file read.
            // "Usable" mirrors extractFirstH1's Strategy A: a level-1 heading
            // whose text is non-empty after trim. Anything less and the scan
            // fallback needs real content to work with.
            const cache = this.app.metadataCache.getFileCache(file);
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
            }
            const { h1 } = extractFirstH1(cache, content);

            // L1: No H1
            if (!h1) {
                return { skipped: 'no-h1', newName: null };
            }

            // Sanitize — byte budget keeps base + '.' + ext within the
            // 255-byte NAME_MAX shared by APFS, ext4/f2fs and NTFS.
            const ext = file.extension || 'md';
            const newBase = sanitizeFileName(h1, {
                trimWhitespace: settings.trimWhitespace,
                replaceIllegalCharacters: settings.replaceIllegalCharacters,
                illegalReplacementChar: settings.illegalReplacementChar,
                maxLength: settings.maxFilenameLength,
                maxBytes: 255 - (ext.length + 1),
            });

            // L2: Empty after sanitize
            if (!newBase) {
                return { skipped: 'empty-after-sanitize', newName: null };
            }

            // L3: Same name (idempotent)
            if (newBase === file.basename) {
                return { skipped: 'same-name', newName: null };
            }

            // Build new path
            const parentPath = file.parent ? file.parent.path : '';
            const newPath = (parentPath && parentPath !== '/' ? parentPath + '/' : '') +
                newBase + '.' + ext;

            // L4: Collision. Exact-path index lookup first; then a case- and
            // NFC-insensitive sibling scan, because NTFS and APFS resolve
            // names case-insensitively (APFS also normalization-insensitively)
            // while getAbstractFileByPath is case-sensitive — an index miss
            // does not mean the destination is free. The file itself is
            // exempt: case-only self-renames are a documented feature.
            const existing = this.app.vault.getAbstractFileByPath(newPath);
            if (existing && existing.path !== file.path) {
                return { skipped: 'collision', newName: newBase };
            }
            const targetKey = foldName(newBase + '.' + ext);
            const siblings: unknown = file.parent
                ? (file.parent as { children?: unknown }).children
                : undefined;
            if (Array.isArray(siblings)) {
                for (const sib of siblings as Array<{ name?: unknown }>) {
                    if ((sib as unknown) === (file as unknown)) continue;
                    if (typeof sib.name === 'string' && foldName(sib.name) === targetKey) {
                        return { skipped: 'collision', newName: newBase };
                    }
                }
            }

            // Execute — fileManager.renameFile updates backlinks atomically
            await this.app.fileManager.renameFile(file, newPath);
            return { skipped: 'none', newName: newBase };
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
}