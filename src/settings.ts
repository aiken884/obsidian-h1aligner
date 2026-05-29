/**
 * settings.ts — H1Aligner settings schema + Obsidian SettingTab.
 *
 * Phase 1 MVP defaults (all per Aiken 拍板, see [[H1Aligner 拍板議題展開_2026-05-29]]):
 *   - renameOnFileOpen              = true  (core feature switch)
 *   - showNoticeOnRename            = false (Q2 — quiet by default)
 *   - trimWhitespace                = true  (Q3.1)
 *   - replaceIllegalCharacters      = true  (Q3.2)
 *   - illegalReplacementChar        = ' '   (Q3.3 — 空白)
 *   - maxFilenameLength             = 150   (Q3.4)
 *   - ignoreFolders                 = ['.obsidian', '.trash'] (Q4 — prefix match)
 *   - skipIfFrontmatterLock         = false (Q5 — schema kept, logic NOT implemented in Phase 1)
 */
import { App, PluginSettingTab, Setting } from 'obsidian';
import type H1AlignerPlugin from './main';

export interface H1AlignerSettings {
    renameOnFileOpen: boolean;
    showNoticeOnRename: boolean;
    trimWhitespace: boolean;
    replaceIllegalCharacters: boolean;
    illegalReplacementChar: string;
    maxFilenameLength: number;
    ignoreFolders: string[];
    /**
     * Phase 1: schema kept, logic deferred to Phase 2 (per Q5).
     */
    skipIfFrontmatterLock: boolean;
}

export const DEFAULT_SETTINGS: H1AlignerSettings = {
    renameOnFileOpen: true,
    showNoticeOnRename: false,
    trimWhitespace: true,
    replaceIllegalCharacters: true,
    illegalReplacementChar: ' ',
    maxFilenameLength: 150,
    ignoreFolders: ['.obsidian', '.trash'],
    skipIfFrontmatterLock: false,
};

/**
 * Obsidian SettingTab for H1Aligner.
 * Phase 1 — basic UI surface. Phase 2 will refine grouping and add live preview.
 */
export class H1AlignerSettingTab extends PluginSettingTab {
    private readonly plugin: H1AlignerPlugin;

    constructor(app: App, plugin: H1AlignerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'H1Aligner' });

        new Setting(containerEl)
            .setName('Rename on file open')
            .setDesc(
                'Automatically rename the active file to match its first H1 when you switch to it.',
            )
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.renameOnFileOpen)
                    .onChange(async (v) => {
                        this.plugin.settings.renameOnFileOpen = v;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Show notice on rename')
            .setDesc('Display a toast notification when a file is renamed. Quiet by default.')
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.showNoticeOnRename)
                    .onChange(async (v) => {
                        this.plugin.settings.showNoticeOnRename = v;
                        await this.plugin.saveSettings();
                    }),
            );

        containerEl.createEl('h3', { text: 'Filename sanitisation' });

        new Setting(containerEl)
            .setName('Trim whitespace')
            .setDesc('Strip leading and trailing whitespace from the H1 text.')
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.trimWhitespace)
                    .onChange(async (v) => {
                        this.plugin.settings.trimWhitespace = v;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Replace illegal characters')
            .setDesc(
                'Replace Windows-illegal characters \\ / : * ? " < > | with the replacement character.',
            )
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.replaceIllegalCharacters)
                    .onChange(async (v) => {
                        this.plugin.settings.replaceIllegalCharacters = v;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Replacement character')
            .setDesc('Character used to replace illegal characters. Default: single space.')
            .addText((t) =>
                t
                    .setPlaceholder(' ')
                    .setValue(this.plugin.settings.illegalReplacementChar)
                    .onChange(async (v) => {
                        this.plugin.settings.illegalReplacementChar = v;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Maximum filename length')
            .setDesc('Truncate filenames longer than this many characters. Default: 150.')
            .addText((t) =>
                t
                    .setPlaceholder('150')
                    .setValue(String(this.plugin.settings.maxFilenameLength))
                    .onChange(async (v) => {
                        const n = parseInt(v, 10);
                        if (!Number.isNaN(n) && n > 0) {
                            this.plugin.settings.maxFilenameLength = n;
                            await this.plugin.saveSettings();
                        }
                    }),
            );

        new Setting(containerEl)
            .setName('Ignore folders')
            .setDesc(
                'Comma-separated folder paths to ignore (prefix match). Default: .obsidian, .trash',
            )
            .addText((t) =>
                t
                    .setPlaceholder('.obsidian, .trash')
                    .setValue(this.plugin.settings.ignoreFolders.join(', '))
                    .onChange(async (v) => {
                        this.plugin.settings.ignoreFolders = v
                            .split(',')
                            .map((s) => s.trim())
                            .filter((s) => s.length > 0);
                        await this.plugin.saveSettings();
                    }),
            );
    }
}