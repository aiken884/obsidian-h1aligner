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

            // Extract H1 — cache first, fall back to file read
            const cache = this.app.metadataCache.getFileCache(file);
            let content: string | undefined;
            const cacheHasH1 = Boolean(
                cache && cache.headings && cache.headings.some((h) => h.level === 1),
            );
            if (!cacheHasH1) {
                try {
                    content = await this.app.vault.read(file);
                } catch {
                    content = undefined;
                }
            }
            const { h1 } = extractFirstH1(cache, content);

            // L1: No H1
            if (!h1) {
                return { skipped: 'no-h1', newName: null };
            }

            // Sanitize
            const newBase = sanitizeFileName(h1, {
                trimWhitespace: settings.trimWhitespace,
                replaceIllegalCharacters: settings.replaceIllegalCharacters,
                illegalReplacementChar: settings.illegalReplacementChar,
                maxLength: settings.maxFilenameLength,
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
            const ext = file.extension || 'md';
            const newPath = (parentPath && parentPath !== '/' ? parentPath + '/' : '') +
                newBase + '.' + ext;

            // L4: Collision (sibling with same path that isn't us)
            const existing = this.app.vault.getAbstractFileByPath(newPath);
            if (existing && existing.path !== file.path) {
                return { skipped: 'collision', newName: newBase };
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