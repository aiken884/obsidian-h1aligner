import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { RenameService } from './rename-service';
import { DEFAULT_SETTINGS, H1AlignerSettings, normalizeSettings } from './settings';
import { H1AlignerSettingTab } from './settings-tab';
import { isIgnoredPath } from './ignore';
import { KeyedDebouncer } from './debounce';
import { noticeFor } from './notice';

/**
 * H1Aligner — Obsidian plugin entry point.
 *
 * Responsibilities:
 *   1. Load/save settings (Plugin.loadData/saveData, validated by
 *      normalizeSettings against corrupt data.json).
 *   2. Register SettingTab.
 *   3. Subscribe to workspace `file-open` via `registerEvent`
 *      (per PPLX Q2 — registerEvent prevents memory leaks on unload).
 *   4. Filter eligible files (`.md` + not in ignoreFolders prefix per Q4).
 *   5. Per-file debounce 100ms (PPLX Q5: 50-150ms burst coalescing).
 *   6. Delegate to RenameService (serial mutex + 4-layer guard).
 *   7. Quiet by default (Q2); notice policy lives in noticeFor().
 *   8. Manual command "Rename active file from first H1" (bypasses debounce
 *      and the renameOnFileOpen switch — but still honours ignoreFolders).
 */
export default class H1AlignerPlugin extends Plugin {
    private static readonly DEBOUNCE_MS = 100;

    settings: H1AlignerSettings = { ...DEFAULT_SETTINGS };
    private renameService!: RenameService;
    private readonly debouncer = new KeyedDebouncer(H1AlignerPlugin.DEBOUNCE_MS);

    async onload(): Promise<void> {
        await this.loadSettings();
        this.renameService = new RenameService(this.app, () => this.settings);

        this.addSettingTab(new H1AlignerSettingTab(this.app, this));

        // file-open event — registerEvent required to avoid leaks (PPLX Q2)
        this.registerEvent(
            this.app.workspace.on('file-open', (file) => this.onFileOpen(file)),
        );

        // Manual command — palette-accessible, bypasses debounce
        this.addCommand({
            id: 'rename-active-file-from-h1',
            name: 'Rename active file from first H1',
            checkCallback: (checking: boolean) => {
                const file = this.app.workspace.getActiveFile();
                if (!file || file.extension !== 'md') return false;
                if (this.isIgnored(file.path)) return false;
                if (!checking) {
                    void this.triggerRename(file, /* manual */ true);
                }
                return true;
            },
        });
    }

    onunload(): void {
        this.debouncer.cancelAll();
    }

    private onFileOpen(file: TFile | null): void {
        if (!file) return;
        if (!this.settings.renameOnFileOpen) return;
        if (file.extension !== 'md') return;
        if (this.isIgnored(file.path)) return;

        // Per-file debounce — coalesce rapid file-switch bursts
        this.debouncer.schedule(file.path, () => {
            void this.triggerRename(file, /* manual */ false);
        });
    }

    /** Q4 ignoreFolders — prefix match on normalized vault paths. */
    private isIgnored(path: string): boolean {
        const folders = this.settings.ignoreFolders.map((f) => normalizePath(f));
        return isIgnoredPath(path, folders);
    }

    private async triggerRename(file: TFile, manual: boolean): Promise<void> {
        const outcome = await this.renameService.renameFromH1(file);
        if (outcome.error) {
            console.error('[H1Aligner] rename failed:', outcome.error);
        }
        const message = noticeFor(outcome, manual, this.settings.showNoticeOnRename);
        if (message) new Notice(message);
    }

    async loadSettings(): Promise<void> {
        this.settings = normalizeSettings(await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}
