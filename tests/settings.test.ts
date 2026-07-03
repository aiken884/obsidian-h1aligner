import { describe, it, expect } from 'vitest';
import {
    DEFAULT_SETTINGS,
    normalizeSettings,
    parseIgnoreFolders,
    parseMaxFilenameLength,
} from '../src/settings';

describe('normalizeSettings', () => {
    it('returns defaults for null / undefined / non-object', () => {
        expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
        expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
        expect(normalizeSettings('junk')).toEqual(DEFAULT_SETTINGS);
        expect(normalizeSettings(42)).toEqual(DEFAULT_SETTINGS);
    });

    it('keeps valid stored values', () => {
        const s = normalizeSettings({
            renameOnFileOpen: false,
            showNoticeOnRename: true,
            maxFilenameLength: 80,
            ignoreFolders: ['templates'],
        });
        expect(s.renameOnFileOpen).toBe(false);
        expect(s.showNoticeOnRename).toBe(true);
        expect(s.maxFilenameLength).toBe(80);
        expect(s.ignoreFolders).toEqual(['templates']);
    });

    it('falls back to defaults for wrong-typed booleans', () => {
        const s = normalizeSettings({ renameOnFileOpen: 'yes', showNoticeOnRename: 1 });
        expect(s.renameOnFileOpen).toBe(DEFAULT_SETTINGS.renameOnFileOpen);
        expect(s.showNoticeOnRename).toBe(DEFAULT_SETTINGS.showNoticeOnRename);
    });

    it('rejects non-positive or non-numeric maxFilenameLength', () => {
        expect(normalizeSettings({ maxFilenameLength: -5 }).maxFilenameLength).toBe(150);
        expect(normalizeSettings({ maxFilenameLength: 0 }).maxFilenameLength).toBe(150);
        expect(normalizeSettings({ maxFilenameLength: '80' }).maxFilenameLength).toBe(150);
        expect(normalizeSettings({ maxFilenameLength: NaN }).maxFilenameLength).toBe(150);
    });

    it('clamps oversized maxFilenameLength to 255 and floors fractions', () => {
        expect(normalizeSettings({ maxFilenameLength: 999 }).maxFilenameLength).toBe(255);
        expect(normalizeSettings({ maxFilenameLength: 3.7 }).maxFilenameLength).toBe(3);
    });

    it('sanitises corrupt ignoreFolders', () => {
        expect(normalizeSettings({ ignoreFolders: 'nope' }).ignoreFolders).toEqual(
            DEFAULT_SETTINGS.ignoreFolders,
        );
        expect(
            normalizeSettings({ ignoreFolders: [' a ', 7, '', null, 'b'] }).ignoreFolders,
        ).toEqual(['a', 'b']);
    });

    it('cleans a dangerous illegalReplacementChar', () => {
        expect(normalizeSettings({ illegalReplacementChar: 7 }).illegalReplacementChar).toBe(' ');
        expect(normalizeSettings({ illegalReplacementChar: '--' }).illegalReplacementChar).toBe('-');
        expect(normalizeSettings({ illegalReplacementChar: '/' }).illegalReplacementChar).toBe('');
    });

    it('never returns the DEFAULT_SETTINGS object itself (no shared mutation)', () => {
        const s = normalizeSettings(null);
        expect(s).not.toBe(DEFAULT_SETTINGS);
        expect(s.ignoreFolders).not.toBe(DEFAULT_SETTINGS.ignoreFolders);
    });
});

describe('parseIgnoreFolders', () => {
    it('splits on commas, trims, drops empties', () => {
        expect(parseIgnoreFolders(' a , b ,, c ')).toEqual(['a', 'b', 'c']);
    });

    it('strips trailing slashes', () => {
        expect(parseIgnoreFolders('templates/, daily//')).toEqual(['templates', 'daily']);
    });

    it('returns empty array for empty input', () => {
        expect(parseIgnoreFolders('')).toEqual([]);
        expect(parseIgnoreFolders('  ,  ')).toEqual([]);
    });
});

describe('parseMaxFilenameLength', () => {
    it('parses a plain integer', () => {
        expect(parseMaxFilenameLength('42')).toBe(42);
        expect(parseMaxFilenameLength(' 42 ')).toBe(42);
    });

    it('rejects non-numeric input', () => {
        expect(parseMaxFilenameLength('abc')).toBeNull();
        expect(parseMaxFilenameLength('')).toBeNull();
    });

    it('rejects zero and negatives', () => {
        expect(parseMaxFilenameLength('0')).toBeNull();
        expect(parseMaxFilenameLength('-3')).toBeNull();
    });

    it('clamps values above 255 (same policy as normalizeSettings)', () => {
        expect(parseMaxFilenameLength('300')).toBe(255);
        expect(parseMaxFilenameLength('1e3')).toBe(255);
    });

    it('accepts the 255 boundary', () => {
        expect(parseMaxFilenameLength('255')).toBe(255);
    });
});
