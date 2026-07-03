import { describe, it, expect } from 'vitest';
import { t, resolveLocale, LOCALES } from '../src/i18n';

describe('resolveLocale', () => {
    it("maps Obsidian's zh-TW language value to the zh-tw table", () => {
        expect(resolveLocale('zh-TW')).toBe('zh-tw');
    });

    it("maps Obsidian's ja language value to the ja table", () => {
        expect(resolveLocale('ja')).toBe('ja');
        expect(resolveLocale('JA')).toBe('ja');
    });

    it('falls back to en for everything else (including zh simplified and null)', () => {
        expect(resolveLocale('en')).toBe('en');
        expect(resolveLocale('zh')).toBe('en');
        expect(resolveLocale('ko')).toBe('en');
        expect(resolveLocale(null)).toBe('en');
    });
});

describe('locale tables', () => {
    const enKeys = Object.keys(LOCALES.en).sort();
    const locales = Object.keys(LOCALES) as Array<keyof typeof LOCALES>;

    it('ships exactly the supported locales: en, zh-tw, ja', () => {
        expect(locales.sort()).toEqual(['en', 'ja', 'zh-tw']);
    });

    for (const locale of Object.keys(LOCALES) as Array<keyof typeof LOCALES>) {
        it(`${locale} covers exactly the same keys as en (no missing/extra strings)`, () => {
            expect(Object.keys(LOCALES[locale]).sort()).toEqual(enKeys);
        });

        it(`${locale} contains no empty strings`, () => {
            for (const [k, v] of Object.entries(LOCALES[locale])) {
                expect((v as string).length, `empty string for key ${k}`).toBeGreaterThan(0);
            }
        });

        it(`${locale} preserves every {placeholder} that en uses`, () => {
            for (const [k, enVal] of Object.entries(LOCALES.en)) {
                const placeholders = (enVal as string).match(/\{[a-zA-Z]+\}/g) ?? [];
                const localized = (LOCALES[locale] as Record<string, string>)[k];
                for (const ph of placeholders) {
                    expect(
                        localized.includes(ph),
                        `${locale}/${k} missing placeholder ${ph}`,
                    ).toBe(true);
                }
            }
        });
    }
});

describe('t', () => {
    it('returns the en string in a Node environment (no localStorage)', () => {
        expect(t('notice.nothingToUndo')).toBe('H1Aligner: nothing to undo');
    });

    it('interpolates {var} placeholders', () => {
        expect(t('notice.renamed', { name: 'New Title' })).toBe(
            'H1Aligner: renamed → New Title',
        );
        expect(t('notice.skipped', { reason: 'no-h1' })).toBe('H1Aligner: skipped (no-h1)');
    });
});
