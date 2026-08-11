/**
 * settings-tab.test.ts — unit coverage for the declarative Settings API
 * (Obsidian 1.13.0+, the plugin's minAppVersion since 0.11.1 — the only
 * rendering path this file has, the imperative display() fallback was
 * removed): getSettingDefinitions() / getControlValue() / setControlValue()
 * / refreshDomState().
 *
 * The installed 'obsidian' package (node_modules/obsidian) ships type
 * declarations only — `main: ""`, no runtime JS — so PluginSettingTab and
 * Setting must be stubbed here for the module to even load. The stub mirrors
 * the real base-class contract documented in obsidian.d.ts: PluginSettingTab's
 * default getControlValue/setControlValue read/write `this.plugin.settings`
 * directly (H1AlignerSettingTab.getControlValue falls back to
 * `super.getControlValue(key)` for every key it doesn't special-case), and
 * refreshDomState() is a real-DOM re-evaluation pass the actual app performs
 * — a no-op stub here is correct per this task's own guidance, since nothing
 * under test reads DOM state back out of it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('obsidian', () => {
    class PluginSettingTab {
        app: unknown;
        plugin: { settings: Record<string, unknown>; saveSettings?: () => unknown };
        containerEl: unknown = {};

        constructor(app: unknown, plugin: { settings: Record<string, unknown>; saveSettings?: () => unknown }) {
            this.app = app;
            this.plugin = plugin;
        }

        getSettingDefinitions(): unknown[] {
            return [];
        }

        // Real PluginSettingTab default (per obsidian.d.ts): "Reads from
        // `this.plugin.settings`." H1AlignerSettingTab.getControlValue's
        // default branch calls this via super.getControlValue(key).
        getControlValue(key: string): unknown {
            return this.plugin.settings[key];
        }

        // Real PluginSettingTab default: "Mutates and persists
        // `this.plugin.settings`." Not actually reached by
        // H1AlignerSettingTab.setControlValue (every key is switch-handled,
        // including an explicit no-op default), but provided for parity.
        setControlValue(key: string, value: unknown): void {
            this.plugin.settings[key] = value;
        }

        refreshDomState(): void {
            // Real implementation re-evaluates visible/disabled predicates
            // against live DOM. No DOM exists in this unit test — a no-op
            // is the correct fake per this task's guidance.
        }

        update(): void {}
    }

    class Setting {
        settingEl: unknown = { remove: () => {}, createDiv: () => ({}), createEl: () => ({}) };
        setName() { return this; }
        setDesc() { return this; }
        setHeading() { return this; }
        addToggle() { return this; }
        addText() { return this; }
        addTextArea() { return this; }
        addDropdown() { return this; }
    }

    return { PluginSettingTab, Setting };
});

import { H1AlignerSettingTab } from '../src/settings-tab';
import { DEFAULT_SETTINGS, type H1AlignerSettings } from '../src/settings';
import type H1AlignerPlugin from '../src/main';

/** Minimal fake plugin: a settings bag + the two methods settings-tab.ts calls on it. */
function makeFakePlugin(overrides: Partial<H1AlignerSettings> = {}) {
    const plugin = {
        settings: { ...DEFAULT_SETTINGS, ...overrides } as H1AlignerSettings,
        saveSettings: vi.fn(async () => {}),
        cancelPendingRenames: vi.fn(),
    };
    return plugin;
}

function makeTab(plugin: ReturnType<typeof makeFakePlugin>): H1AlignerSettingTab {
    return new H1AlignerSettingTab({} as never, plugin as unknown as H1AlignerPlugin);
}

// ---------------------------------------------------------------------------
// getSettingDefinitions()
// ---------------------------------------------------------------------------

describe('getSettingDefinitions', () => {
    // Recursively walk the returned tree and collect every control key,
    // asserting each node has a well-formed shape along the way (throws on
    // anything malformed — the assertions themselves double as "no throw").
    function collectControlKeys(items: unknown[]): string[] {
        const keys: string[] = [];
        for (const raw of items) {
            expect(raw).toBeTypeOf('object');
            const item = raw as Record<string, unknown>;
            if (item.type === 'group' || item.type === 'list') {
                expect(item.heading === undefined || typeof item.heading === 'string').toBe(true);
                expect(Array.isArray(item.items)).toBe(true);
                keys.push(...collectControlKeys(item.items as unknown[]));
                continue;
            }
            // Leaf definition: name is required; exactly one of control/render (or neither).
            expect(typeof item.name).toBe('string');
            expect((item.name as string).length).toBeGreaterThan(0);
            if (item.desc !== undefined) expect(typeof item.desc).toBe('string');
            if (item.control !== undefined) {
                expect(item.render).toBeUndefined();
                const control = item.control as Record<string, unknown>;
                expect(typeof control.key).toBe('string');
                expect(typeof control.type).toBe('string');
                keys.push(control.key as string);
            } else if (item.render !== undefined) {
                expect(typeof item.render).toBe('function');
            }
            if (item.visible !== undefined) {
                expect(['boolean', 'function']).toContain(typeof item.visible);
            }
        }
        return keys;
    }

    it('returns a well-formed array without throwing, for default settings', () => {
        const tab = makeTab(makeFakePlugin());
        const defs = tab.getSettingDefinitions();
        expect(Array.isArray(defs)).toBe(true);
        expect(defs.length).toBeGreaterThan(0);
        const keys = collectControlKeys(defs as unknown[]);

        // Every control-keyed setting the get/set bridge below is expected
        // to handle must actually be reachable from the definitions tree,
        // and vice versa — no orphaned keys either direction.
        expect(new Set(keys)).toEqual(new Set([
            'renameTrigger',
            'ignoreFolders',
            'includeFolders',
            'skipIfFrontmatterLock',
            'nameTemplate',
            'collisionStrategy',
            'allowCaseOnlyRename',
            'preserveOldNameAsAlias',
            'trimWhitespace',
            'replaceIllegalCharacters',
            'noticeLevel',
            'fileOpenDebounceMs',
            'editDebounceMs',
            'moveTagsToFrontmatter',
            'bodyTagHandling',
            'tagsToIgnoreForMove',
        ]));
        // No duplicate keys.
        expect(keys.length).toBe(new Set(keys).size);
    });

    it('reflects current settings via visible predicates (moveTagsToFrontmatter gates its sub-settings)', () => {
        const off = makeTab(makeFakePlugin({ moveTagsToFrontmatter: false }));
        const on = makeTab(makeFakePlugin({ moveTagsToFrontmatter: true }));

        const findVisible = (defs: unknown[], key: string): (() => boolean) => {
            for (const raw of defs) {
                const item = raw as Record<string, unknown>;
                if (item.type === 'group' || item.type === 'list') {
                    const found = findVisible(item.items as unknown[], key);
                    if (found) return found;
                    continue;
                }
                const control = item.control as Record<string, unknown> | undefined;
                if (control?.key === key) return item.visible as () => boolean;
            }
            return undefined as never;
        };

        const bodyHandlingVisibleOff = findVisible(off.getSettingDefinitions() as unknown[], 'bodyTagHandling');
        const bodyHandlingVisibleOn = findVisible(on.getSettingDefinitions() as unknown[], 'bodyTagHandling');
        expect(typeof bodyHandlingVisibleOff).toBe('function');
        expect(bodyHandlingVisibleOff()).toBe(false);
        expect(bodyHandlingVisibleOn()).toBe(true);
    });

    it('does not throw when built repeatedly (idempotent, no shared/leaking state)', () => {
        const tab = makeTab(makeFakePlugin());
        expect(() => tab.getSettingDefinitions()).not.toThrow();
        expect(() => tab.getSettingDefinitions()).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// getControlValue / setControlValue round-trip
// ---------------------------------------------------------------------------

describe('getControlValue / setControlValue round-trip', () => {
    it('round-trips ignoreFolders (array <-> comma-joined string)', async () => {
        const plugin = makeFakePlugin();
        const tab = makeTab(plugin);
        expect(tab.getControlValue('ignoreFolders')).toBe('.trash');

        await tab.setControlValue('ignoreFolders', '  a , b ,, templates/ ');
        expect(plugin.settings.ignoreFolders).toEqual(['a', 'b', 'templates']);
        expect(tab.getControlValue('ignoreFolders')).toBe('a, b, templates');
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('round-trips includeFolders (array <-> comma-joined string)', async () => {
        const plugin = makeFakePlugin();
        const tab = makeTab(plugin);
        expect(tab.getControlValue('includeFolders')).toBe('');

        await tab.setControlValue('includeFolders', '_inbox, projects');
        expect(plugin.settings.includeFolders).toEqual(['_inbox', 'projects']);
        expect(tab.getControlValue('includeFolders')).toBe('_inbox, projects');
    });

    it('round-trips tagsToIgnoreForMove (array <-> comma-joined string, comma/newline parse, strips #)', async () => {
        const plugin = makeFakePlugin();
        const tab = makeTab(plugin);
        expect(tab.getControlValue('tagsToIgnoreForMove')).toBe('');

        await tab.setControlValue('tagsToIgnoreForMove', 'Archive\ninbox/todo, #private');
        expect(plugin.settings.tagsToIgnoreForMove).toEqual(['Archive', 'inbox/todo', 'private']);
        expect(tab.getControlValue('tagsToIgnoreForMove')).toBe('Archive, inbox/todo, private');
    });

    it('round-trips a boolean pass-through key (skipIfFrontmatterLock) via the default/super path', async () => {
        const plugin = makeFakePlugin({ skipIfFrontmatterLock: true });
        const tab = makeTab(plugin);
        expect(tab.getControlValue('skipIfFrontmatterLock')).toBe(true);

        await tab.setControlValue('skipIfFrontmatterLock', false);
        expect(plugin.settings.skipIfFrontmatterLock).toBe(false);
        expect(tab.getControlValue('skipIfFrontmatterLock')).toBe(false);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('round-trips an enum pass-through key (noticeLevel)', async () => {
        const plugin = makeFakePlugin();
        const tab = makeTab(plugin);
        await tab.setControlValue('noticeLevel', 'errors');
        expect(plugin.settings.noticeLevel).toBe('errors');
        expect(tab.getControlValue('noticeLevel')).toBe('errors');
    });

    it("nameTemplate falls back to '{{h1}}' for blank input, otherwise passes through", async () => {
        const plugin = makeFakePlugin();
        const tab = makeTab(plugin);

        await tab.setControlValue('nameTemplate', '{{date}} {{h1}}');
        expect(plugin.settings.nameTemplate).toBe('{{date}} {{h1}}');

        await tab.setControlValue('nameTemplate', '   ');
        expect(plugin.settings.nameTemplate).toBe('{{h1}}');
    });
});

// ---------------------------------------------------------------------------
// renameTrigger -> cancelPendingRenames() side effect
// ---------------------------------------------------------------------------

describe("setControlValue('renameTrigger', ...)", () => {
    it('calls plugin.cancelPendingRenames() and persists the new trigger', async () => {
        const plugin = makeFakePlugin({ renameTrigger: 'file-open' });
        const tab = makeTab(plugin);

        await tab.setControlValue('renameTrigger', 'edit');

        expect(plugin.settings.renameTrigger).toBe('edit');
        expect(plugin.cancelPendingRenames).toHaveBeenCalledTimes(1);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });
});

// ---------------------------------------------------------------------------
// fileOpenDebounceMs / editDebounceMs — empty-string guard (regression)
// ---------------------------------------------------------------------------

describe('debounce fields — empty-string guard (Number(\'\') === 0 regression)', () => {
    for (const key of ['fileOpenDebounceMs', 'editDebounceMs'] as const) {
        it(`${key}: an empty string does NOT overwrite the stored value with 0`, async () => {
            const plugin = makeFakePlugin({ [key]: 500 } as Partial<H1AlignerSettings>);
            const tab = makeTab(plugin);

            await tab.setControlValue(key, '');

            expect(plugin.settings[key]).toBe(500); // NOT 0
            expect(plugin.saveSettings).not.toHaveBeenCalled();
        });

        it(`${key}: a whitespace-only string is treated the same as empty`, async () => {
            const plugin = makeFakePlugin({ [key]: 500 } as Partial<H1AlignerSettings>);
            const tab = makeTab(plugin);

            await tab.setControlValue(key, '   ');

            expect(plugin.settings[key]).toBe(500);
            expect(plugin.saveSettings).not.toHaveBeenCalled();
        });

        it(`${key}: a real numeric literal 0 (not the empty-field sentinel) DOES save`, async () => {
            const plugin = makeFakePlugin({ [key]: 500 } as Partial<H1AlignerSettings>);
            const tab = makeTab(plugin);

            await tab.setControlValue(key, 0);

            expect(plugin.settings[key]).toBe(0);
            expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
        });

        it(`${key}: a valid in-range string is parsed, floored, and saved`, async () => {
            const plugin = makeFakePlugin({ [key]: 500 } as Partial<H1AlignerSettings>);
            const tab = makeTab(plugin);

            await tab.setControlValue(key, '250.9');

            expect(plugin.settings[key]).toBe(250);
            expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
        });
    }
});

// ---------------------------------------------------------------------------
// moveTagsToFrontmatter -> refreshDomState()
// ---------------------------------------------------------------------------

describe("setControlValue('moveTagsToFrontmatter', ...)", () => {
    it('does not throw and calls refreshDomState() after persisting', async () => {
        const plugin = makeFakePlugin({ moveTagsToFrontmatter: false });
        const tab = makeTab(plugin);
        const refreshSpy = vi.spyOn(tab, 'refreshDomState');

        await expect(tab.setControlValue('moveTagsToFrontmatter', true)).resolves.toBeUndefined();

        expect(plugin.settings.moveTagsToFrontmatter).toBe(true);
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
        expect(refreshSpy).toHaveBeenCalledTimes(1);
        // refreshDomState must run AFTER the save completes, not before.
        expect(plugin.saveSettings.mock.invocationCallOrder[0]).toBeLessThan(
            refreshSpy.mock.invocationCallOrder[0],
        );
    });

    // Regression: a real-device report (both mobile and desktop) found the
    // settings panel jumping to the very top whenever this toggle fired —
    // refreshDomState() is documented as scroll-preserving, but evidently
    // isn't in practice. withPreservedScroll() must restore the scroll
    // offset regardless of what refreshDomState() itself does to it.
    it('restores the scroll position even if refreshDomState() resets it', async () => {
        const plugin = makeFakePlugin({ moveTagsToFrontmatter: false });
        const tab = makeTab(plugin);
        const scroller = {
            scrollHeight: 2000,
            clientHeight: 600,
            scrollTop: 480,
            parentElement: null as unknown,
        };
        (tab as unknown as { containerEl: unknown }).containerEl = scroller;
        // Simulate the real-world symptom: refreshDomState() itself (or
        // whatever it triggers) resets the scroll offset to 0.
        vi.spyOn(tab, 'refreshDomState').mockImplementation(() => {
            scroller.scrollTop = 0;
        });

        await tab.setControlValue('moveTagsToFrontmatter', true);

        // No window.requestAnimationFrame under Node/vitest — the
        // implementation falls back to a synchronous restore, so this can
        // be asserted immediately with no extra wait.
        expect(scroller.scrollTop).toBe(480);
    });

    it('is a no-op when there is nothing actually scrollable (no jump to begin with)', async () => {
        const plugin = makeFakePlugin({ moveTagsToFrontmatter: false });
        const tab = makeTab(plugin);
        // Default mock containerEl ({}) has no scrollHeight/clientHeight —
        // findScrollContainer() must return null and this must not throw.
        await expect(tab.setControlValue('moveTagsToFrontmatter', true)).resolves.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// Out-of-range / invalid values for number-ish keys: rejected, not clamped,
// settings left uncorrupted.
// ---------------------------------------------------------------------------

describe('out-of-range / invalid number-ish values are rejected, not clamped', () => {
    for (const key of ['fileOpenDebounceMs', 'editDebounceMs'] as const) {
        it(`${key}: negative values are rejected (previous value kept)`, async () => {
            const plugin = makeFakePlugin({ [key]: 500 } as Partial<H1AlignerSettings>);
            const tab = makeTab(plugin);
            await tab.setControlValue(key, '-5');
            expect(plugin.settings[key]).toBe(500);
            expect(plugin.saveSettings).not.toHaveBeenCalled();
        });

        it(`${key}: values above the 60000ms ceiling are rejected, NOT clamped to 60000`, async () => {
            const plugin = makeFakePlugin({ [key]: 500 } as Partial<H1AlignerSettings>);
            const tab = makeTab(plugin);
            await tab.setControlValue(key, '999999');
            expect(plugin.settings[key]).toBe(500);
            expect(plugin.saveSettings).not.toHaveBeenCalled();
        });

        it(`${key}: non-numeric garbage is rejected`, async () => {
            const plugin = makeFakePlugin({ [key]: 500 } as Partial<H1AlignerSettings>);
            const tab = makeTab(plugin);
            await tab.setControlValue(key, 'abc');
            expect(plugin.settings[key]).toBe(500);
            expect(plugin.saveSettings).not.toHaveBeenCalled();
        });

        it(`${key}: the 0 and 60000 boundaries are both accepted`, async () => {
            const plugin = makeFakePlugin({ [key]: 500 } as Partial<H1AlignerSettings>);
            const tab = makeTab(plugin);
            await tab.setControlValue(key, '0');
            expect(plugin.settings[key]).toBe(0);
            await tab.setControlValue(key, '60000');
            expect(plugin.settings[key]).toBe(60000);
            expect(plugin.saveSettings).toHaveBeenCalledTimes(2);
        });
    }
});

// ---------------------------------------------------------------------------
// Misc: unknown keys are a safe no-op (default switch branch).
// ---------------------------------------------------------------------------

describe('unknown control keys', () => {
    it('setControlValue on an unrecognised key does not throw and does not save', async () => {
        const plugin = makeFakePlugin();
        const tab = makeTab(plugin);
        await expect(tab.setControlValue('totallyMadeUpKey', 'x')).resolves.toBeUndefined();
        expect(plugin.saveSettings).not.toHaveBeenCalled();
    });

    it('setControlValue on maxFilenameLength/illegalReplacementChar (render-only fields) is a no-op — not control-key wired', async () => {
        // These two settings are intentionally NOT in the getControlValue/
        // setControlValue switch: they're driven by custom `render:`
        // callbacks (see getSettingDefinitions) so their fields can echo
        // back parseMaxFilenameLength's clamp / cleanReplacementChar's
        // cleanup. Confirms that going through the generic control-key path
        // for them is inert rather than silently corrupting state.
        const plugin = makeFakePlugin({ maxFilenameLength: 150, illegalReplacementChar: ' ' });
        const tab = makeTab(plugin);
        await tab.setControlValue('maxFilenameLength', '9999');
        await tab.setControlValue('illegalReplacementChar', '///');
        expect(plugin.settings.maxFilenameLength).toBe(150);
        expect(plugin.settings.illegalReplacementChar).toBe(' ');
        expect(plugin.saveSettings).not.toHaveBeenCalled();
    });
});
