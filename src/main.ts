import { Notice, Plugin, TFile } from 'obsidian';
import { RenameService } from './rename-service';
import { DEFAULT_SETTINGS, H1AlignerSettings } from './settings';
import { H1AlignerSettingTab } from './settings-tab';

/**
 * H1Aligner — Obsidian plugin entry point.
 *
 * Phase 1 MVP responsibilities:
 *   1. Load/save settings (Plugin.loadData/saveData).
 *   2. Register SettingTab.
 *   3. Subscribe to workspace `file-open` via `registerEvent`
 *      (per PPLX Q2 — registerEvent prevents memory leaks on unload).
 *   4. Filter eligible files (`.md` + not in ignoreFolders prefix per Q4).
 *   5. Per-file debounce 100ms (PPLX Q5: 50-150ms burst coalescing).
 *   6. Delegate to RenameService (serial mutex + 4-layer guard).
 *   7. Quiet by default (Q2); show Notice only when settings.showNoticeOnRename.
 *   8. Manual command "Rename active file from first H1" (bypasses debounce
 *      and the renameOnFileOpen switch — but still honours ignoreFolders).
 */
export default class H1AlignerPlugin extends Plugin {
    settings: H1AlignerSettings = { ...DEFAULT_SETTINGS };
    private renameService!: RenameService;
    private readonly debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
    private static readonly DEBOUNCE_MS = 100;

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

        console.log('[H1Aligner] loaded');
    }

    onunload(): void {
        for (const t of this.debounceTimers.values()) clearTimeout(t);
        this.debounceTimers.clear();
        console.log('[H1Aligner] unloaded');
    }

    private onFileOpen(file: TFile | null): void {
        if (!file) return;
        if (!this.settings.renameOnFileOpen) return;
        if (file.extension !== 'md') return;
        if (this.isIgnored(file.path)) return;

        // Per-file debounce — coalesce rapid file-switch bursts
        const key = file.path;
        const existing = this.debounceTimers.get(key);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(() => {
            this.debounceTimers.delete(key);
            void this.triggerRename(file, /* manual */ false);
        }, H1AlignerPlugin.DEBOUNCE_MS);
        this.debounceTimers.set(key, timer);
    }

    /**
     * Q4 ignoreFolders — prefix match.
     * Treat each entry as a folder prefix; match if path === prefix
     * or path starts with `prefix + '/'`.
     */
    private isIgnored(path: string): boolean {
        for (const raw of this.settings.ignoreFolders) {
            if (!raw) continue;
            const prefix = raw.endsWith('/') ? raw.slice(0, -1) : raw;
            if (path === prefix) return true;
            if (path.startsWith(prefix + '/')) return true;
        }
        return false;
    }

    private async triggerRename(file: TFile, manual: boolean): Promise<void> {
        const outcome = await this.renameService.renameFromH1(file);

        if (outcome.error) {
            console.error('[H1Aligner] rename failed:', outcome.error);
            if (this.settings.showNoticeOnRename || manual) {
                new Notice(`H1Aligner error: ${outcome.error.message}`);
            }
            return;
        }

        if (this.settings.showNoticeOnRename || manual) {
            if (outcome.skipped === 'none' && outcome.newName) {
                new Notice(`H1Aligner: renamed → ${outcome.newName}`);
            } else if (manual) {
                new Notice(`H1Aligner: skipped (${outcome.skipped})`);
            }
        }
    }

    async loadSettings(): Promise<void> {
        const raw = await this.loadData();
        const partial = (raw ?? {}) as Partial<H1AlignerSettings>;
        this.settings = { ...DEFAULT_SETTINGS, ...partial };
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }
}