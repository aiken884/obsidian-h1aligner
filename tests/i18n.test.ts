import { describe, it, expect } from 'vitest';
import { t, resolveLocale, LOCALES } from '../src/i18n';

describe('resolveLocale', () => {
    it("maps Obsidian's zh-TW language value to the zh-tw table", () => {
        expect(resolveLocale('zh-TW')).toBe('zh-tw');
    });

    it('falls back to en for everything else (including zh simplified and null)', () => {
        expect(resolveLocale('en')).toBe('en');
        expect(resolveLocale('zh')).toBe('en');
        expect(resolveLocale('ja')).toBe('en');
        expect(resolveLocale(null)).toBe('en');
    });
});

describe('locale tables', () => {
    it('zh-tw covers exactly the same keys as en (no missing/extra strings)', () => {
        const enKeys = Object.keys(LOCALES.en).sort();
        const zhKeys = Object.keys(LOCALES['zh-tw']).sort();
        expect(zhKeys).toEqual(enKeys);
    });

    it('no locale table contains empty strings', () => {
        for (const table of Object.values(LOCALES)) {
            for (const [k, v] of Object.entries(table)) {
                expect(v.length, `empty string for key ${k}`).toBeGreaterThan(0);
            }
        }
    });
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
