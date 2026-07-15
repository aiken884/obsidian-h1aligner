/**
 * settings-tab.ts — Obsidian SettingTab UI for H1Aligner.
 *
 * Thin shell: parsing/validation lives in settings.ts (parseIgnoreFolders,
 * parseExcludePatterns, parseMaxFilenameLength), filename.ts
 * (cleanReplacementChar) and template.ts (renderNameTemplate), all
 * unit-tested. All UI strings come from src/i18n.ts (en / zh-TW / ja).
 * Section headings via Setting.setHeading(), sentence case.
 */
import { App, PluginSettingTab, Setting } from 'obsidian';
import type H1AlignerPlugin from './main';
import {
    getExcludePatternsDraft,
    parseIgnoreFolders,
    parseMaxFilenameLength,
    RenameTrigger,
    NoticeLevel,
    CollisionStrategy,
    updateExcludePatternsFromDraft,
    validateExcludePatterns,
} from './settings';
import { cleanReplacementChar, sanitizeFileName } from './filename';
import { renderNameTemplate } from './template';
import { t } from './i18n';

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
            .setName(t('set.trigger.name'))
            .setDesc(t('set.trigger.desc'))
            .addDropdown((d) =>
                d
                    .addOption('file-open', t('set.trigger.fileOpen'))
                    .addOption('edit', t('set.trigger.edit'))
                    .addOption('both', t('set.trigger.both'))
                    .addOption('leave', t('set.trigger.leave'))
                    .addOption('manual', t('set.trigger.manual'))
                    .setValue(this.plugin.settings.renameTrigger)
                    .onChange(async (v) => {
                        this.plugin.settings.renameTrigger = v as RenameTrigger;
                        // Drop timers scheduled under the previous mode.
                        this.plugin.cancelPendingRenames();
                        await this.plugin.saveSettings();
                    }),
            );

        // ---- Scope ------------------------------------------------------
        new Setting(containerEl).setName(t('set.scope.heading')).setHeading();

        new Setting(containerEl)
            .setName(t('set.ignore.name'))
            .setDesc(t('set.ignore.desc'))
            .addText((txt) =>
                txt
                    .setPlaceholder('.trash')
                    .setValue(this.plugin.settings.ignoreFolders.join(', '))
                    .onChange(async (v) => {
                        this.plugin.settings.ignoreFolders = parseIgnoreFolders(v);
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName(t('set.include.name'))
            .setDesc(t('set.include.desc'))
            .addText((txt) =>
                txt
                    .setPlaceholder('_inbox, projects')
                    .setValue(this.plugin.settings.includeFolders.join(', '))
                    .onChange(async (v) => {
                        this.plugin.settings.includeFolders = parseIgnoreFolders(v);
                        await this.plugin.saveSettings();
                    }),
            );

        const excludeSetting = new Setting(containerEl)
            .setName(t('set.exclude.name'))
            .setDesc(t('set.exclude.desc'));
        const validationEl = excludeSetting.settingEl.createDiv();
        validationEl.classList.add('h1aligner-validation');
        validationEl.id = 'h1aligner-exclude-pattern-validation';
        const announcementEl = excludeSetting.settingEl.createDiv();
        announcementEl.classList.add('h1aligner-screen-reader-only');
        announcementEl.setAttribute('aria-live', 'polite');
        let previousInvalidState: boolean | null = null;

        excludeSetting.addTextArea((txt) => {
            const renderValidation = (invalidPatterns: string[]): void => {
                const hasInvalidPatterns = invalidPatterns.length > 0;
                txt.inputEl.setAttribute('aria-invalid', String(hasInvalidPatterns));
                validationEl.empty();
                if (hasInvalidPatterns) {
                    validationEl.createDiv({
                        text: t('set.exclude.invalid', { patterns: invalidPatterns.join('\n') }),
                    });
                    validationEl.createDiv({ text: t('set.exclude.pending') });
                    const activePatterns = this.plugin.settings.excludePatterns;
                    if (
                        validateExcludePatterns(activePatterns.join('\n')).invalidPatterns.length === 0
                    ) {
                        const active = validationEl.createDiv({
                            text:
                                activePatterns.length > 0
                                    ? t('set.exclude.active', {
                                        patterns: activePatterns.join('\n'),
                                    })
                                    : t('set.exclude.none'),
                        });
                        active.classList.add('h1aligner-validation-active');
                    }
                }
                if (
                    previousInvalidState !== null &&
                    previousInvalidState !== hasInvalidPatterns
                ) {
                    announcementEl.setText(
                        t(
                            hasInvalidPatterns
                                ? 'set.exclude.announcement.invalid'
                                : 'set.exclude.announcement.valid',
                        ),
                    );
                }
                previousInvalidState = hasInvalidPatterns;
            };

                txt
                    .setPlaceholder('^\\d{4}-\\d{2}-\\d{2}$')
                    .setValue(getExcludePatternsDraft(this.plugin.settings))
                    .onChange(async (v) => {
                        const validation = updateExcludePatternsFromDraft(this.plugin.settings, v);
                        renderValidation(validation.invalidPatterns);
                        await this.plugin.saveSettings();
                    });
                txt.inputEl.setAttribute('aria-describedby', validationEl.id);
                renderValidation(
                    validateExcludePatterns(getExcludePatternsDraft(this.plugin.settings)).invalidPatterns,
                );
            });

        new Setting(containerEl)
            .setName(t('set.lock.name'))
            .setDesc(t('set.lock.desc'))
            .addToggle((tg) =>
                tg
                    .setValue(this.plugin.settings.skipIfFrontmatterLock)
                    .onChange(async (v) => {
                        this.plugin.settings.skipIfFrontmatterLock = v;
                        await this.plugin.saveSettings();
                    }),
            );

        // ---- Naming -----------------------------------------------------
        new Setting(containerEl).setName(t('set.naming.heading')).setHeading();

        new Setting(containerEl)
            .setName(t('set.template.name'))
            .setDesc(t('set.template.desc'))
            .addText((txt) =>
                txt
                    .setPlaceholder('{{h1}}')
                    .setValue(this.plugin.settings.nameTemplate)
                    .onChange(async (v) => {
                        this.plugin.settings.nameTemplate = v.trim() ? v : '{{h1}}';
                        await this.plugin.saveSettings();
                        this.updatePreview();
                    }),
            );

        new Setting(containerEl)
            .setName(t('set.collision.name'))
            .setDesc(t('set.collision.desc'))
            .addDropdown((d) =>
                d
                    .addOption('skip', t('set.collision.skip'))
                    .addOption('number', t('set.collision.number'))
                    .setValue(this.plugin.settings.collisionStrategy)
                    .onChange(async (v) => {
                        this.plugin.settings.collisionStrategy = v as CollisionStrategy;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName(t('set.caseOnly.name'))
            .setDesc(t('set.caseOnly.desc'))
            .addToggle((tg) =>
                tg
                    .setValue(this.plugin.settings.allowCaseOnlyRename)
                    .onChange(async (v) => {
                        this.plugin.settings.allowCaseOnlyRename = v;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName(t('set.alias.name'))
            .setDesc(t('set.alias.desc'))
            .addToggle((tg) =>
                tg
                    .setValue(this.plugin.settings.preserveOldNameAsAlias)
                    .onChange(async (v) => {
                        this.plugin.settings.preserveOldNameAsAlias = v;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName(t('set.trim.name'))
            .setDesc(t('set.trim.desc'))
            .addToggle((tg) =>
                tg
                    .setValue(this.plugin.settings.trimWhitespace)
                    .onChange(async (v) => {
                        this.plugin.settings.trimWhitespace = v;
                        await this.plugin.saveSettings();
                        this.updatePreview();
                    }),
            );

        new Setting(containerEl)
            .setName(t('set.replace.name'))
            .setDesc(t('set.replace.desc'))
            .addToggle((tg) =>
                tg
                    .setValue(this.plugin.settings.replaceIllegalCharacters)
                    .onChange(async (v) => {
                        this.plugin.settings.replaceIllegalCharacters = v;
                        await this.plugin.saveSettings();
                        this.updatePreview();
                    }),
            );

        new Setting(containerEl)
            .setName(t('set.replChar.name'))
            .setDesc(t('set.replChar.desc'))
            .addText((txt) =>
                txt
                    .setPlaceholder(' ')
                    .setValue(this.plugin.settings.illegalReplacementChar)
                    .onChange(async (v) => {
                        const cleaned = cleanReplacementChar(v);
                        // Keep the field showing what will actually be used
                        // (setValue does not re-fire onChange).
                        if (cleaned !== v) txt.setValue(cleaned);
                        this.plugin.settings.illegalReplacementChar = cleaned;
                        await this.plugin.saveSettings();
                        this.updatePreview();
                    }),
            );

        new Setting(containerEl)
            .setName(t('set.maxLen.name'))
            .setDesc(t('set.maxLen.desc'))
            .addText((txt) =>
                txt
                    .setPlaceholder('150')
                    .setValue(String(this.plugin.settings.maxFilenameLength))
                    .onChange(async (v) => {
                        const n = parseMaxFilenameLength(v);
                        if (n !== null) {
                            // Reflect clamping (e.g. 300 -> 255) in the field.
                            if (String(n) !== v.trim()) txt.setValue(String(n));
                            this.plugin.settings.maxFilenameLength = n;
                            await this.plugin.saveSettings();
                            this.updatePreview();
                        }
                    }),
            );

        // Live preview
        new Setting(containerEl)
            .setName(t('set.preview.name'))
            .setDesc(t('set.preview.desc'))
            .addText((txt) =>
                txt.setPlaceholder('# My note: draft/v2').onChange((v) => {
                    this.previewInput = v;
                    this.updatePreview();
                }),
            );
        this.previewEl = containerEl.createDiv();
        this.previewEl.classList.add('h1aligner-preview');

        // ---- Notifications ------------------------------------------------
        new Setting(containerEl).setName(t('set.notif.heading')).setHeading();

        new Setting(containerEl)
            .setName(t('set.notice.name'))
            .setDesc(t('set.notice.desc'))
            .addDropdown((d) =>
                d
                    .addOption('off', t('set.notice.off'))
                    .addOption('errors', t('set.notice.errors'))
                    .addOption('all', t('set.notice.all'))
                    .setValue(this.plugin.settings.noticeLevel)
                    .onChange(async (v) => {
                        this.plugin.settings.noticeLevel = v as NoticeLevel;
                        await this.plugin.saveSettings();
                    }),
            );

        // ---- Advanced -----------------------------------------------------
        new Setting(containerEl).setName(t('set.adv.heading')).setHeading();

        new Setting(containerEl)
            .setName(t('set.debounceOpen.name'))
            .setDesc(t('set.debounceOpen.desc'))
            .addText((txt) =>
                txt
                    .setPlaceholder('100')
                    .setValue(String(this.plugin.settings.fileOpenDebounceMs))
                    .onChange(async (v) => {
                        if (v.trim() === '') return; // Number('') is 0 — don't save mid-edit
                        const n = Number(v.trim());
                        if (Number.isFinite(n) && n >= 0 && n <= 60000) {
                            this.plugin.settings.fileOpenDebounceMs = Math.floor(n);
                            await this.plugin.saveSettings();
                        }
                    }),
            );

        new Setting(containerEl)
            .setName(t('set.debounceEdit.name'))
            .setDesc(t('set.debounceEdit.desc'))
            .addText((txt) =>
                txt
                    .setPlaceholder('2000')
                    .setValue(String(this.plugin.settings.editDebounceMs))
                    .onChange(async (v) => {
                        if (v.trim() === '') return; // Number('') is 0 — don't save mid-edit
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
        this.previewEl.setText(base ? `→ ${base}.md` : t('set.preview.empty'));
    }
}
