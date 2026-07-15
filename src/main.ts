import { Notice, Plugin, TFile, getLanguage, normalizePath } from 'obsidian';
import { RenameService, foldName } from './rename-service';
import {
    DEFAULT_SETTINGS,
    getExcludePatternsDraft,
    H1AlignerSettings,
    normalizeSettings,
    validateExcludePatterns,
} from './settings';
import { H1AlignerSettingTab } from './settings-tab';
import { isInScope } from './scope';
import { isIgnoredPath } from './ignore';
import { KeyedDebouncer } from './debounce';
import { noticeFor } from './notice';
import { RenameHistory } from './history';
import { ActivityLog, ActivitySource } from './activity-log';
import { ActivityModal } from './activity-modal';
import { OnboardingModal } from './onboarding-modal';
import { BatchPreviewModal, BatchItem } from './batch-modal';
import { classifyBatchItem } from './batch-triage';
import { t, setLocaleFromLanguage } from './i18n';

/**
 * H1Aligner — Obsidian plugin entry point.
 *
 * Responsibilities:
 *   1. Load/save settings (validated by normalizeSettings, v1 data migrated).
 *   2. Register SettingTab; show the one-time onboarding modal on first run.
 *   3. Trigger wiring: 'file-open' (debounced burst coalescing), 'edit'
 *      (editor-change — local typing only, never Sync/programmatic writes),
 *      or 'manual' (command only). Debounce callbacks re-validate the
 *      trigger mode and scope at fire time.
 *   4. Scope filter: .md + ignore/include folders + basename exclude patterns.
 *      The MANUAL command bypasses include/exclude scope (explicit action is
 *      consent) but still honours ignoreFolders (and the frontmatter lock).
 *   5. Delegate to RenameService (serial mutex + guard layers); every
 *      decision is recorded in the session ActivityLog.
 *   6. Notice policy lives in noticeFor(); manual actions always report.
 *   7. Commands: manual rename, batch dry-run preview, undo, show activity.
 */
export default class H1AlignerPlugin extends Plugin {
    settings: H1AlignerSettings = { ...DEFAULT_SETTINGS };
    private renameService!: RenameService;
    private readonly history = new RenameHistory(20);
    private readonly activity = new ActivityLog(200);
    private readonly debouncer = new KeyedDebouncer(DEFAULT_SETTINGS.fileOpenDebounceMs);
    private saveQueue: Promise<void> = Promise.resolve();
    /** Previous active file — the 'leave' trigger renames this one. */
    private lastActiveFile: TFile | null = null;

    onload(): void {
        setLocaleFromLanguage(getLanguage());
        void this.initialize();
    }

    private async initialize(): Promise<void> {
        const raw: unknown = await this.loadData();
        this.settings = normalizeSettings(raw);
        this.renameService = new RenameService(this.app, () => this.settings, this.history);

        this.addSettingTab(new H1AlignerSettingTab(this.app, this));

        if (!this.settings.onboardingShown) {
            if (raw == null) {
                // Fresh install: ask before the first automatic rename.
                // Automatic triggers stay gated until onboardingShown is set.
                new OnboardingModal(this.app, async (trigger) => {
                    if (trigger !== null) this.settings.renameTrigger = trigger;
                    this.settings.onboardingShown = true;
                    await this.saveSettings();
                }).open();
            } else {
                // Upgrade from ≤0.4: the user already runs the plugin with
                // their chosen settings — never re-ask or rewrite them.
                this.settings.onboardingShown = true;
                await this.saveSettings();
            }
        }

        // file-open trigger — registerEvent required to avoid leaks.
        // Also drives 'leave' mode: switching to a note means leaving the
        // previous one, which is the moment that mode renames it (it never
        // touches the note the user is currently looking at).
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => {
                if (!this.settings.onboardingShown) return; // consent pending
                const previous = this.lastActiveFile;
                this.lastActiveFile = file instanceof TFile ? file : null;
                const trigger = this.settings.renameTrigger;
                if (trigger === 'file-open' || trigger === 'both') {
                    this.scheduleRename(file, this.settings.fileOpenDebounceMs, trigger, 'file-open');
                } else if (trigger === 'leave' && previous && previous !== file) {
                    this.scheduleRename(previous, this.settings.fileOpenDebounceMs, trigger, 'leave');
                }
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
                if (!this.settings.onboardingShown) return; // consent pending
                const trigger = this.settings.renameTrigger;
                if (trigger !== 'edit' && trigger !== 'both') return;
                const file = (info as { file?: TFile | null } | null)?.file ?? null;
                if (!(file instanceof TFile)) return;
                this.scheduleRename(file, this.settings.editDebounceMs, trigger, 'edit');
            }),
        );

        // Manual command — bypasses debounce, trigger mode, and include/
        // exclude scope (explicit user action); still honours ignoreFolders.
        this.addCommand({
            id: 'rename-active-file-from-h1',
            name: t('cmd.renameActive'),
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile();
                if (!file || !this.manualEligible(file)) return false;
                if (!checking) {
                    void this.triggerRename(file, /* manual */ true, 'manual');
                }
                return true;
            },
        });

        this.addCommand({
            id: 'batch-preview-renames',
            name: t('cmd.batchPreview'),
            callback: () => void this.openBatchPreview(),
        });

        this.addCommand({
            id: 'undo-last-rename',
            name: t('cmd.undo'),
            callback: () => void this.undoLastRename(),
        });

        this.addCommand({
            id: 'show-activity',
            name: t('cmd.showActivity'),
            callback: () => new ActivityModal(this.app, this.activity).open(),
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
        source: ActivitySource,
    ): void {
        if (!file || !this.shouldProcess(file)) return;
        this.debouncer.schedule(
            file.path,
            () => {
                // Re-validate at fire time: the user may have switched the
                // trigger mode or moved the file out of scope meanwhile.
                if (this.settings.renameTrigger !== expectedTrigger) return;
                if (!this.shouldProcess(file)) return;
                void this.triggerRename(file, /* manual */ false, source);
            },
            delayMs,
        );
    }

    /** normalizePath, but preserving the '/'-means-vault-root convention. */
    private static normalizeFolderEntry(this: void, f: string): string {
        return f === '/' || f === '\\' ? '/' : normalizePath(f);
    }

    /** Full scope filter (automatic triggers + batch). */
    private shouldProcess(file: TFile): boolean {
        if (file.extension !== 'md') return false;
        return isInScope(file.path, file.basename, {
            // The config folder (user-configurable; Vault#configDir) is
            // always ignored regardless of settings.
            ignoreFolders: [
                this.app.vault.configDir,
                ...this.settings.ignoreFolders.map(H1AlignerPlugin.normalizeFolderEntry),
            ],
            includeFolders: this.settings.includeFolders.map(H1AlignerPlugin.normalizeFolderEntry),
            excludePatterns: this.settings.excludePatterns,
        });
    }

    /** Manual command: only ignoreFolders applies (explicit action = consent). */
    private manualEligible(file: TFile): boolean {
        if (file.extension !== 'md') return false;
        return !isIgnoredPath(file.path, [
            this.app.vault.configDir,
            ...this.settings.ignoreFolders.map(H1AlignerPlugin.normalizeFolderEntry),
        ]);
    }

    private async triggerRename(
        file: TFile,
        manual: boolean,
        source: ActivitySource,
    ): Promise<void> {
        if (this.hasInvalidExcludePatterns()) {
            if (manual) new Notice(t('notice.invalidPatternsBlocked'));
            return;
        }
        const path = file.path;
        const outcome = await this.renameService.renameFromH1(file);
        if (outcome.error) {
            console.error('[H1Aligner] rename failed:', outcome.error);
        }
        this.activity.record({
            ts: Date.now(),
            path,
            source,
            outcome: outcome.error
                ? 'error'
                : outcome.skipped === 'none'
                    ? 'renamed'
                    : outcome.skipped,
            newName: outcome.newName ?? undefined,
            detail: outcome.error?.message,
        });
        const message = noticeFor(outcome, manual, this.settings.noticeLevel);
        if (message) new Notice(message);
    }

    private batchInFlight = false;

    private async openBatchPreview(): Promise<void> {
        if (this.batchInFlight) {
            new Notice(t('notice.batchRunning'));
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
        const previewFingerprint = this.batchSettingsFingerprint();
        const files = this.app.vault.getMarkdownFiles().filter((f) => this.shouldProcess(f));
        if (files.length > 200) {
            new Notice(t('notice.scanning', { count: files.length }));
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
                await new Promise((r) => window.setTimeout(r, 0));
            }
            const outcome = await this.renameService.renameFromH1(file, { dryRun: true });
            let to = outcome.newName;
            let reason = outcome.error ? 'error' : outcome.skipped;
            let status = classifyBatchItem(outcome, false);
            if (status === 'rename' && to !== null) {
                const dir = file.parent ? file.parent.path : '';
                const key = dir + '|' + foldName(to + '.' + (file.extension || 'md'));
                if (claimedTargets.has(key)) {
                    status = 'conflict';
                    reason = 'duplicate-target';
                } else {
                    claimedTargets.add(key);
                }
            }
            items.push({
                file,
                from: file.path,
                to,
                status,
                reason,
                detail: outcome.error?.message,
            });
        }
        if (!this.isBatchPreviewCurrent(previewFingerprint)) {
            new Notice(t('notice.batchSettingsChanged'));
            return;
        }
        new BatchPreviewModal(
            this.app,
            items,
            this.canApplyBatchPreview(previewFingerprint),
            async (renamable) => {
                if (!this.canApplyBatchPreview(previewFingerprint)) {
                    new Notice(this.batchPreviewBlockMessage(previewFingerprint));
                    return;
                }
                let done = 0;
                let changed = 0;
                let failed = 0;
                for (const item of renamable) {
                    if (!this.canApplyBatchPreview(previewFingerprint)) {
                        new Notice(this.batchPreviewBlockMessage(previewFingerprint));
                        return;
                    }
                    // Guard against H1s edited between preview and apply: only
                    // execute when a fresh dry run still matches what was shown.
                    const check = await this.renameService.renameFromH1(item.file, { dryRun: true });
                    if (!this.canApplyBatchPreview(previewFingerprint)) {
                        new Notice(this.batchPreviewBlockMessage(previewFingerprint));
                        return;
                    }
                    if (check.skipped !== 'none' || check.newName !== item.to) {
                        changed++;
                        continue;
                    }
                    const outcome = await this.renameService.renameFromH1(item.file);
                    this.activity.record({
                        ts: Date.now(),
                        path: item.from,
                        source: 'batch',
                        outcome: outcome.error
                            ? 'error'
                            : outcome.skipped === 'none'
                                ? 'renamed'
                                : outcome.skipped,
                        newName: outcome.newName ?? undefined,
                        detail: outcome.error?.message,
                    });
                    if (outcome.skipped === 'none' && !outcome.error) done++;
                    else failed++;
                }
                const parts = [t('notice.batchDone', { done })];
                if (changed) parts.push(t('notice.batchChanged', { count: changed }));
                if (failed) parts.push(t('notice.batchFailed', { count: failed }));
                new Notice(parts.join(', '));
            },
        ).open();
    }

    private async undoLastRename(): Promise<void> {
        const record = this.history.peek();
        if (!record) {
            new Notice(t('notice.nothingToUndo'));
            return;
        }
        const file = this.app.vault.getAbstractFileByPath(record.to);
        // Identity check, not just path resolution: if the renamed file was
        // moved away and an unrelated note now sits at record.to, undoing
        // would rename the stranger.
        if (!(file instanceof TFile) || (record.file !== undefined && record.file !== file)) {
            new Notice(t('notice.undoMoved'));
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
            new Notice(t('notice.undoOccupied'));
            return;
        }
        try {
            await this.app.fileManager.renameFile(file, record.from);
            // Pop only after success so a failed undo can be retried and
            // never silently discards (or misdirects) the history.
            this.history.pop();
            this.activity.record({
                ts: Date.now(),
                path: record.to,
                source: 'undo',
                outcome: 'renamed',
                newName: fromName.replace(/\.[^.]+$/, ''),
            });
            new Notice(t('notice.undone', { path: record.from }));
        } catch (err) {
            console.error('[H1Aligner] undo failed:', err);
            new Notice(t('notice.undoFailed'));
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = normalizeSettings(await this.loadData());
    }

    async saveSettings(): Promise<void> {
        const snapshot: H1AlignerSettings = {
            ...this.settings,
            ignoreFolders: [...this.settings.ignoreFolders],
            includeFolders: [...this.settings.includeFolders],
            excludePatterns: [...this.settings.excludePatterns],
        };
        const write = this.saveQueue
            .catch(() => undefined)
            .then(() => this.saveData(snapshot));
        this.saveQueue = write;
        await write;
    }

    private hasInvalidExcludePatterns(): boolean {
        return validateExcludePatterns(getExcludePatternsDraft(this.settings)).invalidPatterns.length > 0;
    }

    /** Settings that determine a batch preview's candidate set or side effects. */
    private batchSettingsFingerprint(): string {
        const settings = this.settings;
        return JSON.stringify({
            ignoreFolders: settings.ignoreFolders,
            includeFolders: settings.includeFolders,
            excludePatterns: settings.excludePatterns,
            skipIfFrontmatterLock: settings.skipIfFrontmatterLock,
            nameTemplate: settings.nameTemplate,
            collisionStrategy: settings.collisionStrategy,
            allowCaseOnlyRename: settings.allowCaseOnlyRename,
            trimWhitespace: settings.trimWhitespace,
            replaceIllegalCharacters: settings.replaceIllegalCharacters,
            illegalReplacementChar: settings.illegalReplacementChar,
            maxFilenameLength: settings.maxFilenameLength,
            preserveOldNameAsAlias: settings.preserveOldNameAsAlias,
        });
    }

    private isBatchPreviewCurrent(previewFingerprint: string): boolean {
        return this.batchSettingsFingerprint() === previewFingerprint;
    }

    private canApplyBatchPreview(previewFingerprint: string): boolean {
        return !this.hasInvalidExcludePatterns() && this.isBatchPreviewCurrent(previewFingerprint);
    }

    private batchPreviewBlockMessage(previewFingerprint: string): string {
        return this.hasInvalidExcludePatterns()
            ? t('notice.invalidPatternsBlocked')
            : t('notice.batchSettingsChanged');
    }
}
