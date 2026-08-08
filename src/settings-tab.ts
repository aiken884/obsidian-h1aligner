/**
 * settings-tab.ts — Obsidian SettingTab UI for H1Aligner.
 *
 * Thin shell: parsing/validation lives in settings.ts (parseIgnoreFolders,
 * parseExcludePatterns, parseMaxFilenameLength, parseTagsToIgnoreForMove),
 * filename.ts (cleanReplacementChar) and template.ts (renderNameTemplate),
 * all unit-tested. All UI strings come from src/i18n.ts (en / zh-TW / ja).
 *
 * Two rendering paths, same underlying settings:
 * - getSettingDefinitions()/getControlValue()/setControlValue() — declarative
 *   API (Obsidian 1.13.0+). Primary path; used whenever available.
 * - display() — imperative fallback for Obsidian < 1.13.0 (our
 *   minAppVersion is 1.8.0). Obsidian only calls this when
 *   getSettingDefinitions() returns an empty array, so it must stay in sync
 *   with the declarative definitions by hand. Section headings via
 *   Setting.setHeading(), sentence case.
 */
import { App, PluginSettingTab, Setting, type SettingDefinitionItem, type SettingGroup } from 'obsidian';
import type H1AlignerPlugin from './main';
import {
    getExcludePatternsDraft,
    parseIgnoreFolders,
    parseMaxFilenameLength,
    parseTagsToIgnoreForMove,
    RenameTrigger,
    NoticeLevel,
    CollisionStrategy,
    BodyTagHandling,
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

    // ==================================================================
    // Declarative Settings API (Obsidian 1.13.0+) — primary rendering path.
    // ==================================================================

    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            // ---- Trigger --------------------------------------------------
            {
                name: t('set.trigger.name'),
                desc: t('set.trigger.desc'),
                control: {
                    type: 'dropdown',
                    key: 'renameTrigger',
                    options: {
                        'file-open': t('set.trigger.fileOpen'),
                        edit: t('set.trigger.edit'),
                        both: t('set.trigger.both'),
                        leave: t('set.trigger.leave'),
                        manual: t('set.trigger.manual'),
                    },
                },
            },

            // ---- Scope ------------------------------------------------------
            {
                type: 'group',
                heading: t('set.scope.heading'),
                items: [
                    {
                        name: t('set.ignore.name'),
                        desc: t('set.ignore.desc'),
                        control: { type: 'text', key: 'ignoreFolders', placeholder: '.trash' },
                    },
                    {
                        name: t('set.include.name'),
                        desc: t('set.include.desc'),
                        control: {
                            type: 'text',
                            key: 'includeFolders',
                            placeholder: '_inbox, projects',
                        },
                    },
                    {
                        name: t('set.exclude.name'),
                        desc: t('set.exclude.desc'),
                        render: (setting) => this.renderExcludePatterns(setting),
                    },
                    {
                        name: t('set.lock.name'),
                        desc: t('set.lock.desc'),
                        control: { type: 'toggle', key: 'skipIfFrontmatterLock' },
                    },
                ],
            },

            // ---- Naming -------------------------------------------------------
            {
                type: 'group',
                heading: t('set.naming.heading'),
                items: [
                    {
                        name: t('set.template.name'),
                        desc: t('set.template.desc'),
                        control: { type: 'text', key: 'nameTemplate', placeholder: '{{h1}}' },
                    },
                    {
                        name: t('set.collision.name'),
                        desc: t('set.collision.desc'),
                        control: {
                            type: 'dropdown',
                            key: 'collisionStrategy',
                            options: {
                                skip: t('set.collision.skip'),
                                number: t('set.collision.number'),
                            },
                        },
                    },
                    {
                        name: t('set.caseOnly.name'),
                        desc: t('set.caseOnly.desc'),
                        control: { type: 'toggle', key: 'allowCaseOnlyRename' },
                    },
                    {
                        name: t('set.alias.name'),
                        desc: t('set.alias.desc'),
                        control: { type: 'toggle', key: 'preserveOldNameAsAlias' },
                    },
                    {
                        name: t('set.trim.name'),
                        desc: t('set.trim.desc'),
                        control: { type: 'toggle', key: 'trimWhitespace' },
                    },
                    {
                        name: t('set.replace.name'),
                        desc: t('set.replace.desc'),
                        control: { type: 'toggle', key: 'replaceIllegalCharacters' },
                    },
                    {
                        name: t('set.replChar.name'),
                        desc: t('set.replChar.desc'),
                        // render, not a plain `control`: cleanReplacementChar can
                        // silently shorten/clean what the user typed, and the
                        // field must keep showing what will actually be used —
                        // the generic control-key binding has no hook to echo a
                        // transformed value back into the displayed input.
                        render: (setting) => this.renderIllegalReplacementChar(setting),
                    },
                    {
                        name: t('set.maxLen.name'),
                        desc: t('set.maxLen.desc'),
                        // render, not a plain `control`, for the same reason —
                        // parseMaxFilenameLength clamps out-of-range input
                        // (e.g. 300 -> 255) and the field must reflect that.
                        render: (setting) => this.renderMaxFilenameLength(setting),
                    },
                    {
                        name: t('set.preview.name'),
                        desc: t('set.preview.desc'),
                        render: (setting, group) => this.renderPreview(setting, group),
                    },
                ],
            },

            // ---- Notifications ------------------------------------------------
            {
                type: 'group',
                heading: t('set.notif.heading'),
                items: [
                    {
                        name: t('set.notice.name'),
                        desc: t('set.notice.desc'),
                        control: {
                            type: 'dropdown',
                            key: 'noticeLevel',
                            options: {
                                off: t('set.notice.off'),
                                errors: t('set.notice.errors'),
                                all: t('set.notice.all'),
                            },
                        },
                    },
                ],
            },

            // ---- Advanced -------------------------------------------------------
            {
                type: 'group',
                heading: t('set.adv.heading'),
                items: [
                    {
                        name: t('set.debounceOpen.name'),
                        desc: t('set.debounceOpen.desc'),
                        control: {
                            type: 'number',
                            key: 'fileOpenDebounceMs',
                            placeholder: '100',
                            min: 0,
                            max: 60000,
                            step: 1,
                        },
                    },
                    {
                        name: t('set.debounceEdit.name'),
                        desc: t('set.debounceEdit.desc'),
                        control: {
                            type: 'number',
                            key: 'editDebounceMs',
                            placeholder: '2000',
                            min: 0,
                            max: 60000,
                            step: 1,
                        },
                    },
                ],
            },

            // ---- Experimental -----------------------------------------------------
            {
                type: 'group',
                heading: t('set.exp.heading'),
                items: [
                    {
                        name: t('set.exp.warning'),
                        searchable: false,
                        render: (setting, group) => {
                            // Plain warning paragraph, not a name/control row —
                            // discard the framework-created row shell and
                            // append directly to the group's list instead.
                            setting.settingEl.remove();
                            const el = group.listEl.createEl('p', { text: t('set.exp.warning') });
                            el.classList.add('h1aligner-experimental-warning');
                        },
                    },
                    {
                        name: t('set.tagmove.name'),
                        desc: t('set.tagmove.desc'),
                        control: { type: 'toggle', key: 'moveTagsToFrontmatter' },
                    },
                    {
                        name: t('set.tagmove.body.name'),
                        desc: t('set.tagmove.body.desc'),
                        // Sub-settings keep their stored values when toggled
                        // off — they are only hidden, never reset.
                        visible: () => this.plugin.settings.moveTagsToFrontmatter,
                        control: {
                            type: 'dropdown',
                            key: 'bodyTagHandling',
                            options: {
                                keep: t('set.tagmove.body.keep'),
                                'remove-hash': t('set.tagmove.body.removeHash'),
                                'remove-tag': t('set.tagmove.body.removeTag'),
                            },
                        },
                    },
                    {
                        name: t('set.tagmove.ignore.name'),
                        desc: t('set.tagmove.ignore.desc'),
                        visible: () => this.plugin.settings.moveTagsToFrontmatter,
                        control: {
                            type: 'textarea',
                            key: 'tagsToIgnoreForMove',
                            placeholder: 'Archive, inbox/todo',
                        },
                    },
                ],
            },
        ];
    }

    getControlValue(key: string): unknown {
        switch (key) {
            case 'ignoreFolders':
                return this.plugin.settings.ignoreFolders.join(', ');
            case 'includeFolders':
                return this.plugin.settings.includeFolders.join(', ');
            case 'tagsToIgnoreForMove':
                return this.plugin.settings.tagsToIgnoreForMove.join(', ');
            default:
                // Every other control's key matches its H1AlignerSettings
                // property name and value shape 1:1 — the base
                // PluginSettingTab implementation reads it straight off
                // this.plugin.settings.
                return super.getControlValue(key);
        }
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        const s = this.plugin.settings;
        switch (key) {
            case 'renameTrigger':
                s.renameTrigger = value as RenameTrigger;
                // Drop timers scheduled under the previous mode.
                this.plugin.cancelPendingRenames();
                await this.plugin.saveSettings();
                return;
            case 'ignoreFolders':
                s.ignoreFolders = parseIgnoreFolders(String(value));
                await this.plugin.saveSettings();
                return;
            case 'includeFolders':
                s.includeFolders = parseIgnoreFolders(String(value));
                await this.plugin.saveSettings();
                return;
            case 'skipIfFrontmatterLock':
                s.skipIfFrontmatterLock = Boolean(value);
                await this.plugin.saveSettings();
                return;
            case 'nameTemplate':
                s.nameTemplate = String(value).trim() ? String(value) : '{{h1}}';
                await this.plugin.saveSettings();
                this.updatePreview();
                return;
            case 'collisionStrategy':
                s.collisionStrategy = value as CollisionStrategy;
                await this.plugin.saveSettings();
                return;
            case 'allowCaseOnlyRename':
                s.allowCaseOnlyRename = Boolean(value);
                await this.plugin.saveSettings();
                return;
            case 'preserveOldNameAsAlias':
                s.preserveOldNameAsAlias = Boolean(value);
                await this.plugin.saveSettings();
                return;
            case 'trimWhitespace':
                s.trimWhitespace = Boolean(value);
                await this.plugin.saveSettings();
                this.updatePreview();
                return;
            case 'replaceIllegalCharacters':
                s.replaceIllegalCharacters = Boolean(value);
                await this.plugin.saveSettings();
                this.updatePreview();
                return;
            case 'noticeLevel':
                s.noticeLevel = value as NoticeLevel;
                await this.plugin.saveSettings();
                return;
            case 'fileOpenDebounceMs': {
                if (typeof value === 'string' && value.trim() === '') return; // Number('') is 0 — don't save mid-edit
                const n = Number(value);
                if (Number.isFinite(n) && n >= 0 && n <= 60000) {
                    s.fileOpenDebounceMs = Math.floor(n);
                    await this.plugin.saveSettings();
                }
                return;
            }
            case 'editDebounceMs': {
                if (typeof value === 'string' && value.trim() === '') return; // Number('') is 0 — don't save mid-edit
                const n = Number(value);
                if (Number.isFinite(n) && n >= 0 && n <= 60000) {
                    s.editDebounceMs = Math.floor(n);
                    await this.plugin.saveSettings();
                }
                return;
            }
            case 'moveTagsToFrontmatter':
                s.moveTagsToFrontmatter = Boolean(value);
                await this.plugin.saveSettings();
                // bodyTagHandling/tagsToIgnoreForMove's `visible` predicates
                // depend on this — re-evaluate without a full re-render.
                this.refreshDomState();
                return;
            case 'bodyTagHandling':
                s.bodyTagHandling = value as BodyTagHandling;
                await this.plugin.saveSettings();
                return;
            case 'tagsToIgnoreForMove':
                s.tagsToIgnoreForMove = parseTagsToIgnoreForMove(String(value));
                await this.plugin.saveSettings();
                return;
            default:
                return;
        }
    }

    /** Exclude-patterns textarea with inline regex validation — same custom UI as display(). */
    private renderExcludePatterns(setting: Setting): void {
        const validationEl = setting.settingEl.createDiv();
        validationEl.classList.add('h1aligner-validation');
        validationEl.id = 'h1aligner-exclude-pattern-validation';
        const announcementEl = setting.settingEl.createDiv();
        announcementEl.classList.add('h1aligner-screen-reader-only');
        announcementEl.setAttribute('aria-live', 'polite');
        let previousInvalidState: boolean | null = null;

        setting.addTextArea((txt) => {
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
    }

    /** Replacement-character text input, echoing back cleanReplacementChar's output. */
    private renderIllegalReplacementChar(setting: Setting): void {
        setting.addText((txt) =>
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
    }

    /** Max-filename-length text input, echoing back parseMaxFilenameLength's clamp. */
    private renderMaxFilenameLength(setting: Setting): void {
        setting.addText((txt) =>
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
    }

    /** Filename-template text input + live rendered preview — not a stored setting. */
    private renderPreview(setting: Setting, group: SettingGroup): void {
        setting.addText((txt) =>
            txt.setPlaceholder('# My note: draft/v2').onChange((v) => {
                this.previewInput = v;
                this.updatePreview();
            }),
        );
        this.previewEl = group.listEl.createDiv();
        this.previewEl.classList.add('h1aligner-preview');
        this.updatePreview();
    }

    // ==================================================================
    // Imperative fallback (Obsidian < 1.13.0). Obsidian only calls
    // display() when getSettingDefinitions() above returns []; it never
    // does on 1.13.0+, so this must be kept in sync with it by hand.
    // ==================================================================

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

        // ---- Experimental -------------------------------------------------
        new Setting(containerEl).setName(t('set.exp.heading')).setHeading();
        const expWarning = containerEl.createEl('p', { text: t('set.exp.warning') });
        expWarning.classList.add('h1aligner-experimental-warning');

        new Setting(containerEl)
            .setName(t('set.tagmove.name'))
            .setDesc(t('set.tagmove.desc'))
            .addToggle((tg) =>
                tg
                    .setValue(this.plugin.settings.moveTagsToFrontmatter)
                    .onChange(async (v) => {
                        // Sub-settings keep their stored values when toggled
                        // off — they are only hidden, never reset.
                        this.plugin.settings.moveTagsToFrontmatter = v;
                        await this.plugin.saveSettings();
                        this.display();
                    }),
            );

        if (this.plugin.settings.moveTagsToFrontmatter) {
            new Setting(containerEl)
                .setName(t('set.tagmove.body.name'))
                .setDesc(t('set.tagmove.body.desc'))
                .addDropdown((d) =>
                    d
                        .addOption('keep', t('set.tagmove.body.keep'))
                        .addOption('remove-hash', t('set.tagmove.body.removeHash'))
                        .addOption('remove-tag', t('set.tagmove.body.removeTag'))
                        .setValue(this.plugin.settings.bodyTagHandling)
                        .onChange(async (v) => {
                            this.plugin.settings.bodyTagHandling = v as BodyTagHandling;
                            await this.plugin.saveSettings();
                        }),
                );

            new Setting(containerEl)
                .setName(t('set.tagmove.ignore.name'))
                .setDesc(t('set.tagmove.ignore.desc'))
                .addTextArea((txt) =>
                    txt
                        .setPlaceholder('Archive, inbox/todo')
                        .setValue(this.plugin.settings.tagsToIgnoreForMove.join(', '))
                        .onChange(async (v) => {
                            this.plugin.settings.tagsToIgnoreForMove = parseTagsToIgnoreForMove(v);
                            await this.plugin.saveSettings();
                        }),
                );
        }

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
