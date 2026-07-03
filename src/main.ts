import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { RenameService, foldName } from './rename-service';
import { DEFAULT_SETTINGS, H1AlignerSettings, normalizeSettings } from './settings';
import { H1AlignerSettingTab } from './settings-tab';
import { isInScope } from './scope';
import { isIgnoredPath } from './ignore';
import { KeyedDebouncer } from './debounce';
import { noticeFor } from './notice';
import { RenameHistory } from './history';
import { BatchPreviewModal, BatchItem } from './batch-modal';

/**
 * H1Aligner — Obsidian plugin entry point.
 *
 * Responsibilities:
 *   1. Load/save settings (validated by normalizeSettings, v1 data migrated).
 *   2. Register SettingTab.
 *   3. Trigger wiring: 'file-open' (debounced burst coalescing), 'edit'
 *      (vault modify, long debounce, ACTIVE FILE ONLY — programmatic writes
 *      such as backlink updates after our own renames also emit modify, and
 *      reacting to those would cascade renames through the vault), or
 *      'manual' (command only). Debounce callbacks re-validate the trigger
 *      mode and scope at fire time, so changing settings cancels stale work.
 *   4. Scope filter: .md + ignore/include folders + basename exclude patterns.
 *      The MANUAL command deliberately bypasses include/exclude scope —
 *      an explicit user action is consent — but still honours ignoreFolders
 *      (and the frontmatter lock, enforced in the service).
 *   5. Delegate to RenameService (serial mutex + guard layers).
 *   6. Notice policy lives in noticeFor(); manual actions always report.
 *   7. Commands: manual rename, batch dry-run preview, undo last rename.
 */
export default class H1AlignerPlugin extends Plugin {
    settings: H1AlignerSettings = { ...DEFAULT_SETTINGS };
    private renameService!: RenameService;
    private readonly history = new RenameHistory(20);
    private readonly debouncer = new KeyedDebouncer(DEFAULT_SETTINGS.fileOpenDebounceMs);

    async onload(): Promise<void> {
        await this.loadSettings();
        this.renameService = new RenameService(this.app, () => this.settings, this.history);

        this.addSettingTab(new H1AlignerSettingTab(this.app, this));

        // file-open trigger — registerEvent required to avoid leaks
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (this.settings.renameTrigger !== 'file-open') return;
                this.scheduleRename(file, this.settings.fileOpenDebounceMs, 'file-open');
            }),
        );

        // edit trigger — long debounce; reschedules on every keystroke so the
        // rename only happens after a typing pause. editor-change fires ONLY
        // for local editor input — unlike vault 'modify', it is never emitted
        // for programmatic writes (backlink updates after our own renames) or
        // for Obsidian Sync applying a remote change to the open note, both of
        // which would otherwise cascade or rename from half-typed remote H1s.
        this.registerEvent(
            this.app.workspace.on('editor-change', (_editor, info) => {
                if (this.settings.renameTrigger !== 'edit') return;
                const file = (info as { file?: TFile | null } | null)?.file ?? null;
                if (!(file instanceof TFile)) return;
                this.scheduleRename(file, this.settings.editDebounceMs, 'edit');
            }),
        );

        // Manual command — bypasses debounce, trigger mode, and include/
        // exclude scope (explicit user action); still honours ignoreFolders.
        this.addCommand({
            id: 'rename-active-file-from-h1',
            name: 'Rename active file from first H1',
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile();
                if (!file || !this.manualEligible(file)) return false;
                if (!checking) {
                    void this.triggerRename(file, /* manual */ true);
                }
                return true;
            },
        });

        this.addCommand({
            id: 'batch-preview-renames',
            name: 'Preview all renames (dry run)',
            callback: () => void this.openBatchPreview(),
        });

        this.addCommand({
            id: 'undo-last-rename',
            name: 'Undo last rename',
            callback: () => void this.undoLastRename(),
        });
    }

    onunload(): void {
        this.debouncer.cancelAll();
    }

    /** Called by the settings tab when the trigger mode changes. */
    cancelPendingRenames(): void {
        this.debouncer.cancelAll();
    }

    private scheduleRename(
        file: TFile | null,
        delayMs: number,
        expectedTrigger: H1AlignerSettings['renameTrigger'],
    ): void {
        if (!file || !this.shouldProcess(file)) return;
        this.debouncer.schedule(
            file.path,
            () => {
                // Re-validate at fire time: the user may have switched the
                // trigger mode or moved the file out of scope meanwhile.
                if (this.settings.renameTrigger !== expectedTrigger) return;
                if (!this.shouldProcess(file)) return;
                void this.triggerRename(file, /* manual */ false);
            },
            delayMs,
        );
    }

    /** Full scope filter (automatic triggers + batch). */
    private shouldProcess(file: TFile): boolean {
        if (file.extension !== 'md') return false;
        return isInScope(file.path, file.basename, {
            ignoreFolders: this.settings.ignoreFolders.map((f) => normalizePath(f)),
            includeFolders: this.settings.includeFolders.map((f) => normalizePath(f)),
            excludePatterns: this.settings.excludePatterns,
        });
    }

    /** Manual command: only ignoreFolders applies (explicit action = consent). */
    private manualEligible(file: TFile): boolean {
        if (file.extension !== 'md') return false;
        return !isIgnoredPath(
            file.path,
            this.settings.ignoreFolders.map((f) => normalizePath(f)),
        );
    }

    private async triggerRename(file: TFile, manual: boolean): Promise<void> {
        const outcome = await this.renameService.renameFromH1(file);
        if (outcome.error) {
            console.error('[H1Aligner] rename failed:', outcome.error);
        }
        const message = noticeFor(outcome, manual, this.settings.noticeLevel);
        if (message) new Notice(message);
    }

    private batchInFlight = false;

    private async openBatchPreview(): Promise<void> {
        if (this.batchInFlight) {
            new Notice('H1Aligner: a batch scan is already running');
            return;
        }
        this.batchInFlight = true;
        try {
            await this.runBatchPreview();
        } finally {
            this.batchInFlight = false;
        }
    }

    private async runBatchPreview(): Promise<void> {
        const files = this.app.vault.getMarkdownFiles().filter((f) => this.shouldProcess(f));
        if (files.length > 200) {
            new Notice(`H1Aligner: scanning ${files.length} notes…`);
        }
        const items: BatchItem[] = [];
        // Duplicate H1s would all "claim" the same target; only the first
        // one can actually get it, so later ones are shown as collisions.
        const claimedTargets = new Set<string>();
        let scanned = 0;
        for (const file of files) {
            // Cache-hit dry runs resolve on the microtask queue; yield a
            // macrotask periodically so the UI never freezes on big vaults.
            if (++scanned % 200 === 0) {
                await new Promise((r) => setTimeout(r, 0));
            }
            const outcome = await this.renameService.renameFromH1(file, { dryRun: true });
            let to = outcome.skipped === 'none' && outcome.newName ? outcome.newName : null;
            let reason = outcome.error ? `error: ${outcome.error.message}` : outcome.skipped;
            if (to !== null) {
                const dir = file.parent ? file.parent.path : '';
                const key = dir + '|' + foldName(to + '.' + (file.extension || 'md'));
                if (claimedTargets.has(key)) {
                    to = null;
                    reason = 'collision (duplicate target in this batch)';
                } else {
                    claimedTargets.add(key);
                }
            }
            items.push({ file, from: file.path, to, reason });
        }
        new BatchPreviewModal(this.app, items, async (renamable) => {
            let done = 0;
            let changed = 0;
            let failed = 0;
            for (const item of renamable) {
                // Guard against H1s edited between preview and apply: only
                // execute when a fresh dry run still matches what was shown.
                const check = await this.renameService.renameFromH1(item.file, { dryRun: true });
                if (check.skipped !== 'none' || check.newName !== item.to) {
                    changed++;
                    continue;
                }
                const outcome = await this.renameService.renameFromH1(item.file);
                if (outcome.skipped === 'none' && !outcome.error) done++;
                else failed++;
            }
            const parts = [`H1Aligner: batch renamed ${done} file(s)`];
            if (changed) parts.push(`${changed} skipped (changed since preview)`);
            if (failed) parts.push(`${failed} skipped/failed`);
            new Notice(parts.join(', '));
        }).open();
    }

    private async undoLastRename(): Promise<void> {
        const record = this.history.peek();
        if (!record) {
            new Notice('H1Aligner: nothing to undo');
            return;
        }
        const file = this.app.vault.getAbstractFileByPath(record.to);
        // Identity check, not just path resolution: if the renamed file was
        // moved away and an unrelated note now sits at record.to, undoing
        // would rename the stranger.
        if (!(file instanceof TFile) || (record.file !== undefined && record.file !== file)) {
            new Notice('H1Aligner: cannot undo — file was moved or deleted');
            return;
        }
        // Occupancy check must be case- and NFC-insensitive (NTFS/APFS
        // resolve names that way; an index miss ≠ a free name).
        const fromName = record.from.split('/').pop() ?? record.from;
        let occupied = this.app.vault.getAbstractFileByPath(record.from) !== null;
        if (!occupied && file.parent && Array.isArray(file.parent.children)) {
            const key = foldName(fromName);
            occupied = file.parent.children.some(
                (sib) => sib !== file && foldName(sib.name) === key,
            );
        }
        if (occupied) {
            new Notice('H1Aligner: cannot undo — original name is occupied');
            return;
        }
        try {
            await this.app.fileManager.renameFile(file, record.from);
            // Pop only after success so a failed undo can be retried and
            // never silently discards (or misdirects) the history.
            this.history.pop();
            new Notice(`H1Aligner: undone → ${record.from}`);
        } catch (err) {
            console.error('[H1Aligner] undo failed:', err);
            new Notice('H1Aligner: undo failed');
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = normalizeSettings(await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
