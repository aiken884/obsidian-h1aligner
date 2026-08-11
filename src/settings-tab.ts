/**
 * settings-tab.ts — Obsidian SettingTab UI for H1Aligner.
 *
 * Thin shell: parsing/validation lives in settings.ts (parseIgnoreFolders,
 * parseExcludePatterns, parseMaxFilenameLength, parseTagsToIgnoreForMove),
 * filename.ts (cleanReplacementChar) and template.ts (renderNameTemplate),
 * all unit-tested. All UI strings come from src/i18n.ts (en / zh-TW / ja).
 *
 * Renders via Obsidian 1.13.0+'s declarative Settings API only
 * (getSettingDefinitions()/getControlValue()/setControlValue()) — this
 * plugin's minAppVersion is 1.13.0, so the imperative display() fallback
 * this file used to also carry for older versions has been removed
 * entirely (see git history if it's ever needed again). Obsidian's
 * community-plugin review rejects a release whose source calls APIs newer
 * than the declared minAppVersion even when those calls are only reachable
 * at runtime on versions that actually have them (as the two-path setup
 * was) — raising the floor and dropping the fallback was the only option
 * that reliably passes review; see CHANGELOG.md's 0.11.1 entry.
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
                // Wrapped for scroll preservation — see withPreservedScroll.
                this.withPreservedScroll(() => this.refreshDomState());
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

    /** Exclude-patterns textarea with inline regex validation. */
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

    /**
     * Toggling moveTagsToFrontmatter re-renders part of this page via
     * refreshDomState() — on real devices (both mobile and desktop; not
     * WebView-specific) this was observed to reset the settings panel's
     * scroll position to the top, which is jarring on a page this long.
     * refreshDomState() is documented as "cheap: toggles CSS state in
     * place, no re-render," but that evidently doesn't guarantee the
     * scroll position survives in practice. Record the scroll offset
     * before the change and restore it once the DOM settles, regardless of
     * why it moved — this doesn't depend on refreshDomState()'s behaviour
     * actually matching its documentation.
     */
    private withPreservedScroll(fn: () => void): void {
        const scroller = this.findScrollContainer();
        const scrollTop = scroller?.scrollTop ?? 0;
        fn();
        if (!scroller) return;
        const restore = (): void => {
            scroller.scrollTop = scrollTop;
        };
        // requestAnimationFrame: a same-tick assignment can be clobbered by
        // whatever caused the jump in the first place, which hasn't
        // necessarily run yet. Not available under Node (unit tests) —
        // fall back to a synchronous restore there.
        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(restore);
        } else {
            restore();
        }
    }

    /** Walk up from containerEl to the nearest actually-scrollable ancestor. */
    private findScrollContainer(): HTMLElement | null {
        let el: HTMLElement | null = this.containerEl;
        while (el) {
            if (el.scrollHeight > el.clientHeight) return el;
            el = el.parentElement;
        }
        return null;
    }
}
