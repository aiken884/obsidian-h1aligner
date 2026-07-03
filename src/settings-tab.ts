/**
 * settings-tab.ts — Obsidian SettingTab UI for H1Aligner.
 *
 * Split out from settings.ts so that the pure schema/defaults module remains
 * vitest-loadable without an `obsidian` stub. Input parsing/validation lives
 * in settings.ts (parseIgnoreFolders, parseMaxFilenameLength) and
 * filename.ts (cleanReplacementChar) so it is unit-testable.
 *
 * UI guidelines: no top-level plugin-name heading, section headings via
 * Setting.setHeading(), sentence case names.
 */
import { App, PluginSettingTab, Setting } from 'obsidian';
import type H1AlignerPlugin from './main';
import { parseIgnoreFolders, parseMaxFilenameLength } from './settings';
import { cleanReplacementChar } from './filename';

export class H1AlignerSettingTab extends PluginSettingTab {
    private readonly plugin: H1AlignerPlugin;

    constructor(app: App, plugin: H1AlignerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

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

        new Setting(containerEl).setName('Filename sanitisation').setHeading();

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
                'Replace characters that are invalid on Windows (\\ / : * ? " < > |) or break Obsidian links (# ^ [ ]) with the replacement character.',
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
            .setDesc(
                'Single character used to replace illegal characters (illegal characters themselves are rejected; leave empty to delete instead). Default: single space.',
            )
            .addText((t) =>
                t
                    .setPlaceholder(' ')
                    .setValue(this.plugin.settings.illegalReplacementChar)
                    .onChange(async (v) => {
                        const cleaned = cleanReplacementChar(v);
                        // Keep the field showing what will actually be used
                        // (setValue does not re-fire onChange).
                        if (cleaned !== v) t.setValue(cleaned);
                        this.plugin.settings.illegalReplacementChar = cleaned;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Maximum filename length')
            .setDesc(
                'Truncate filenames longer than this many characters (1-255; filenames are additionally capped at 255 bytes for filesystem compatibility). Default: 150.',
            )
            .addText((t) =>
                t
                    .setPlaceholder('150')
                    .setValue(String(this.plugin.settings.maxFilenameLength))
                    .onChange(async (v) => {
                        const n = parseMaxFilenameLength(v);
                        if (n !== null) {
                            // Reflect clamping (e.g. 300 -> 255) in the field.
                            if (String(n) !== v.trim()) t.setValue(String(n));
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
                        this.plugin.settings.ignoreFolders = parseIgnoreFolders(v);
                        await this.plugin.saveSettings();
                    }),
            );
    }
}
