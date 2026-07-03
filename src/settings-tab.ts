/**
 * settings-tab.ts — Obsidian SettingTab UI for H1Aligner.
 *
 * Thin shell: parsing/validation lives in settings.ts (parseIgnoreFolders,
 * parseExcludePatterns, parseMaxFilenameLength), filename.ts
 * (cleanReplacementChar) and template.ts (renderNameTemplate), all
 * unit-tested. Section headings via Setting.setHeading(), sentence case.
 */
import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type H1AlignerPlugin from './main';
import {
    parseIgnoreFolders,
    parseExcludePatterns,
    parseMaxFilenameLength,
    RenameTrigger,
    NoticeLevel,
    CollisionStrategy,
} from './settings';
import { cleanReplacementChar, sanitizeFileName } from './filename';
import { renderNameTemplate } from './template';

export class H1AlignerSettingTab extends PluginSettingTab {
    private readonly plugin: H1AlignerPlugin;

    constructor(app: App, plugin: H1AlignerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // ---- Trigger ----------------------------------------------------
        new Setting(containerEl)
            .setName('Rename trigger')
            .setDesc(
                'When to rename automatically. "On file open" renames when you switch to a note; "After editing" renames after you pause typing; "Manual only" leaves it to the command.',
            )
            .addDropdown((d) =>
                d
                    .addOption('file-open', 'On file open')
                    .addOption('edit', 'After editing (debounced)')
                    .addOption('manual', 'Manual only')
                    .setValue(this.plugin.settings.renameTrigger)
                    .onChange(async (v) => {
                        this.plugin.settings.renameTrigger = v as RenameTrigger;
                        // Drop timers scheduled under the previous mode.
                        this.plugin.cancelPendingRenames();
                        await this.plugin.saveSettings();
                    }),
            );

        // ---- Scope ------------------------------------------------------
        new Setting(containerEl).setName('Scope').setHeading();

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

        new Setting(containerEl)
            .setName('Include only these folders')
            .setDesc(
                'Comma-separated whitelist. When non-empty, ONLY notes inside these folders are renamed. Leave empty to process the whole vault.',
            )
            .addText((t) =>
                t
                    .setPlaceholder('e.g. _inbox, projects')
                    .setValue(this.plugin.settings.includeFolders.join(', '))
                    .onChange(async (v) => {
                        this.plugin.settings.includeFolders = parseIgnoreFolders(v);
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Exclude filename patterns')
            .setDesc(
                'One regular expression per line, tested against the note name (without .md). Unanchored substring match — use ^ and $ for exact names. Matching notes are not auto-renamed (the manual command still works). The default protects date-named daily notes.',
            )
            .addTextArea((t) => {
                t
                    .setPlaceholder('^\\d{4}-\\d{2}-\\d{2}$')
                    .setValue(this.plugin.settings.excludePatterns.join('\n'))
                    .onChange(async (v) => {
                        this.plugin.settings.excludePatterns = parseExcludePatterns(v);
                        await this.plugin.saveSettings();
                    });
                // Invalid patterns fail OPEN (no protection) — tell the user
                // on blur instead of failing silently.
                t.inputEl.addEventListener('blur', () => {
                    const bad = this.plugin.settings.excludePatterns.filter((p) => {
                        try { new RegExp(p); return false; } catch { return true; }
                    });
                    if (bad.length) {
                        new Notice(`H1Aligner: invalid exclude pattern(s) ignored:\n${bad.join('\n')}`);
                    }
                });
            });

        new Setting(containerEl)
            .setName('Respect frontmatter lock')
            .setDesc(
                'Skip notes whose frontmatter contains "h1aligner-lock: true". Lets you exempt individual notes.',
            )
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.skipIfFrontmatterLock)
                    .onChange(async (v) => {
                        this.plugin.settings.skipIfFrontmatterLock = v;
                        await this.plugin.saveSettings();
                    }),
            );

        // ---- Naming -----------------------------------------------------
        new Setting(containerEl).setName('Naming').setHeading();

        new Setting(containerEl)
            .setName('Filename template')
            .setDesc(
                'Tokens: {{h1}} (the heading — REQUIRED; templates without it are treated as plain {{h1}}), {{date}} (file creation date, YYYY-MM-DD), {{date:FORMAT}} with YYYY/MM/DD/HH/mm/ss. Creation date keeps renames stable. Default: {{h1}}',
            )
            .addText((t) =>
                t
                    .setPlaceholder('{{h1}}')
                    .setValue(this.plugin.settings.nameTemplate)
                    .onChange(async (v) => {
                        this.plugin.settings.nameTemplate = v.trim() ? v : '{{h1}}';
                        await this.plugin.saveSettings();
                        this.updatePreview();
                    }),
            );

        new Setting(containerEl)
            .setName('When the target name is taken')
            .setDesc('Skip leaves the note untouched; Number appends the first free " 1", " 2", …')
            .addDropdown((d) =>
                d
                    .addOption('skip', 'Skip (safe default)')
                    .addOption('number', 'Append a number')
                    .setValue(this.plugin.settings.collisionStrategy)
                    .onChange(async (v) => {
                        this.plugin.settings.collisionStrategy = v as CollisionStrategy;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Allow case-only renames')
            .setDesc(
                'Rename "linker.md" to "Linker.md" when only the capitalisation differs. Turn off to keep the file tree still.',
            )
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.allowCaseOnlyRename)
                    .onChange(async (v) => {
                        this.plugin.settings.allowCaseOnlyRename = v;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Trim whitespace')
            .setDesc('Strip leading and trailing whitespace from the H1 text.')
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.trimWhitespace)
                    .onChange(async (v) => {
                        this.plugin.settings.trimWhitespace = v;
                        await this.plugin.saveSettings();
                        this.updatePreview();
                    }),
            );

        new Setting(containerEl)
            .setName('Replace illegal characters')
            .setDesc(
                'Replace characters that are invalid on Windows (\\ / : * ? " < > |) or break Obsidian links (# ^ [ ]) with the replacement character. Path separators are always replaced.',
            )
            .addToggle((t) =>
                t
                    .setValue(this.plugin.settings.replaceIllegalCharacters)
                    .onChange(async (v) => {
                        this.plugin.settings.replaceIllegalCharacters = v;
                        await this.plugin.saveSettings();
                        this.updatePreview();
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
                        this.updatePreview();
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
                            this.updatePreview();
                        }
                    }),
            );

        // Live preview
        new Setting(containerEl)
            .setName('Preview')
            .setDesc(
                'Type a sample H1 to see the filename it would produce with the current settings. Date tokens preview with the current time; real renames use each file\'s creation time.',
            )
            .addText((t) =>
                t.setPlaceholder('# My note: draft/v2').onChange((v) => {
                    this.previewInput = v;
                    this.updatePreview();
                }),
            );
        this.previewEl = containerEl.createEl('div', { text: '' });
        this.previewEl.style.marginTop = '-0.5em';
        this.previewEl.style.marginBottom = '1em';
        this.previewEl.style.opacity = '0.8';
        this.previewEl.style.fontFamily = 'var(--font-monospace)';

        // ---- Notifications ------------------------------------------------
        new Setting(containerEl).setName('Notifications').setHeading();

        new Setting(containerEl)
            .setName('Notice level')
            .setDesc(
                'For automatic renames. Off: silent. Errors only: report failures. All: also announce successful renames. The manual command and batch apply always report.',
            )
            .addDropdown((d) =>
                d
                    .addOption('off', 'Off (quiet)')
                    .addOption('errors', 'Errors only')
                    .addOption('all', 'All renames')
                    .setValue(this.plugin.settings.noticeLevel)
                    .onChange(async (v) => {
                        this.plugin.settings.noticeLevel = v as NoticeLevel;
                        await this.plugin.saveSettings();
                    }),
            );

        // ---- Advanced -----------------------------------------------------
        new Setting(containerEl).setName('Advanced').setHeading();

        new Setting(containerEl)
            .setName('File-open debounce (ms)')
            .setDesc('Wait time after a file-open before renaming. Default: 100.')
            .addText((t) =>
                t
                    .setPlaceholder('100')
                    .setValue(String(this.plugin.settings.fileOpenDebounceMs))
                    .onChange(async (v) => {
                        const n = Number(v.trim());
                        if (Number.isFinite(n) && n >= 0 && n <= 60000) {
                            this.plugin.settings.fileOpenDebounceMs = Math.floor(n);
                            await this.plugin.saveSettings();
                        }
                    }),
            );

        new Setting(containerEl)
            .setName('Edit debounce (ms)')
            .setDesc(
                'Typing pause required before an "After editing" rename fires. Keep this generous — renaming mid-typing is disruptive. Default: 2000.',
            )
            .addText((t) =>
                t
                    .setPlaceholder('2000')
                    .setValue(String(this.plugin.settings.editDebounceMs))
                    .onChange(async (v) => {
                        const n = Number(v.trim());
                        if (Number.isFinite(n) && n >= 0 && n <= 60000) {
                            this.plugin.settings.editDebounceMs = Math.floor(n);
                            await this.plugin.saveSettings();
                        }
                    }),
            );

        this.updatePreview();
    }

    private previewInput = '';
    private previewEl: HTMLElement | null = null;

    private updatePreview(): void {
        if (!this.previewEl) return;
        const h1 = this.previewInput.replace(/^#+\s*/, '').trim();
        if (!h1) {
            this.previewEl.setText('');
            return;
        }
        const s = this.plugin.settings;
        const rendered = renderNameTemplate(s.nameTemplate, { h1, ctime: Date.now() });
        const base = sanitizeFileName(rendered, {
            trimWhitespace: s.trimWhitespace,
            replaceIllegalCharacters: s.replaceIllegalCharacters,
            illegalReplacementChar: s.illegalReplacementChar,
            maxLength: s.maxFilenameLength,
            // Same budget rename-service computes for '.md' files.
            maxBytes: 255 - ('md'.length + 1),
        });
        this.previewEl.setText(base ? `→ ${base}.md` : '→ (empty after sanitising — would be skipped)');
    }
}
