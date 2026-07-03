import { describe, it, expect } from 'vitest';
import {
    DEFAULT_SETTINGS,
    normalizeSettings,
    parseIgnoreFolders,
    parseExcludePatterns,
    parseMaxFilenameLength,
} from '../src/settings';

describe('normalizeSettings', () => {
    it('returns defaults for null / undefined / non-object', () => {
        expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
        expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
        expect(normalizeSettings('junk')).toEqual(DEFAULT_SETTINGS);
        expect(normalizeSettings(42)).toEqual(DEFAULT_SETTINGS);
    });

    it('keeps valid stored v2 values', () => {
        const s = normalizeSettings({
            renameTrigger: 'edit',
            noticeLevel: 'errors',
            maxFilenameLength: 80,
            ignoreFolders: ['templates'],
            includeFolders: ['_inbox'],
            excludePatterns: ['^tmp'],
            nameTemplate: '{{date}} {{h1}}',
            collisionStrategy: 'number',
            allowCaseOnlyRename: false,
            editDebounceMs: 5000,
            fileOpenDebounceMs: 250,
            skipIfFrontmatterLock: false,
        });
        expect(s.renameTrigger).toBe('edit');
        expect(s.noticeLevel).toBe('errors');
        expect(s.maxFilenameLength).toBe(80);
        expect(s.ignoreFolders).toEqual(['templates']);
        expect(s.includeFolders).toEqual(['_inbox']);
        expect(s.excludePatterns).toEqual(['^tmp']);
        expect(s.nameTemplate).toBe('{{date}} {{h1}}');
        expect(s.collisionStrategy).toBe('number');
        expect(s.allowCaseOnlyRename).toBe(false);
        expect(s.editDebounceMs).toBe(5000);
        expect(s.fileOpenDebounceMs).toBe(250);
        expect(s.skipIfFrontmatterLock).toBe(false);
    });

    it('handles the v0.5.0 fields (onboardingShown, preserveOldNameAsAlias)', () => {
        expect(DEFAULT_SETTINGS.onboardingShown).toBe(false);
        expect(DEFAULT_SETTINGS.preserveOldNameAsAlias).toBe(false);
        expect(normalizeSettings({ onboardingShown: true }).onboardingShown).toBe(true);
        expect(normalizeSettings({ preserveOldNameAsAlias: true }).preserveOldNameAsAlias).toBe(true);
        expect(normalizeSettings({ onboardingShown: 'yes' }).onboardingShown).toBe(false);
    });

    it('falls back to defaults for invalid enum values', () => {
        const s = normalizeSettings({ renameTrigger: 'nope', noticeLevel: 'loud', collisionStrategy: 'x' });
        expect(s.renameTrigger).toBe(DEFAULT_SETTINGS.renameTrigger);
        expect(s.noticeLevel).toBe(DEFAULT_SETTINGS.noticeLevel);
        expect(s.collisionStrategy).toBe(DEFAULT_SETTINGS.collisionStrategy);
    });

    it('clamps or rejects debounce values', () => {
        expect(normalizeSettings({ fileOpenDebounceMs: -5 }).fileOpenDebounceMs).toBe(
            DEFAULT_SETTINGS.fileOpenDebounceMs,
        );
        expect(normalizeSettings({ fileOpenDebounceMs: 999999 }).fileOpenDebounceMs).toBe(60000);
        expect(normalizeSettings({ editDebounceMs: '2' }).editDebounceMs).toBe(
            DEFAULT_SETTINGS.editDebounceMs,
        );
        expect(normalizeSettings({ editDebounceMs: 0 }).editDebounceMs).toBe(0);
    });

    it('falls back for a non-string nameTemplate', () => {
        expect(normalizeSettings({ nameTemplate: 7 }).nameTemplate).toBe('{{h1}}');
    });

    it('sanitises corrupt includeFolders / excludePatterns arrays', () => {
        expect(normalizeSettings({ includeFolders: 'nope' }).includeFolders).toEqual([]);
        expect(normalizeSettings({ includeFolders: [' a ', 7, ''] }).includeFolders).toEqual(['a']);
        expect(normalizeSettings({ excludePatterns: 'nope' }).excludePatterns).toEqual(
            DEFAULT_SETTINGS.excludePatterns,
        );
        expect(normalizeSettings({ excludePatterns: ['^x$', 3, ''] }).excludePatterns).toEqual(['^x$']);
    });

    it('keeps excludePatterns verbatim — trimming would change regex semantics', () => {
        // '^ ' means "starts with a space"; trimming it to '^' would match EVERYTHING.
        expect(normalizeSettings({ excludePatterns: ['^ '] }).excludePatterns).toEqual(['^ ']);
        expect(normalizeSettings({ excludePatterns: ['   '] }).excludePatterns).toEqual([]);
    });

    describe('v1 → v2 migration', () => {
        it('maps renameOnFileOpen to renameTrigger', () => {
            expect(normalizeSettings({ renameOnFileOpen: true }).renameTrigger).toBe('file-open');
            expect(normalizeSettings({ renameOnFileOpen: false }).renameTrigger).toBe('manual');
        });

        it('renameTrigger wins over the legacy key when both exist', () => {
            expect(
                normalizeSettings({ renameOnFileOpen: false, renameTrigger: 'edit' }).renameTrigger,
            ).toBe('edit');
        });

        it('maps showNoticeOnRename to noticeLevel', () => {
            expect(normalizeSettings({ showNoticeOnRename: true }).noticeLevel).toBe('all');
            expect(normalizeSettings({ showNoticeOnRename: false }).noticeLevel).toBe('off');
            expect(
                normalizeSettings({ showNoticeOnRename: true, noticeLevel: 'errors' }).noticeLevel,
            ).toBe('errors');
        });

        it('ignores the meaningless v1 skipIfFrontmatterLock=false (feature did not exist)', () => {
            const s = normalizeSettings({ renameOnFileOpen: true, skipIfFrontmatterLock: false });
            expect(s.skipIfFrontmatterLock).toBe(true);
        });

        it('preserves an explicit v2 skipIfFrontmatterLock=false', () => {
            const s = normalizeSettings({ renameTrigger: 'manual', skipIfFrontmatterLock: false });
            expect(s.skipIfFrontmatterLock).toBe(false);
        });
    });

    it('rejects non-positive or non-numeric maxFilenameLength', () => {
        expect(normalizeSettings({ maxFilenameLength: -5 }).maxFilenameLength).toBe(150);
        expect(normalizeSettings({ maxFilenameLength: '80' }).maxFilenameLength).toBe(150);
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
        expect(s.excludePatterns).not.toBe(DEFAULT_SETTINGS.excludePatterns);
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

describe('parseExcludePatterns', () => {
    it('splits on newlines and drops whitespace-only lines, keeping patterns verbatim', () => {
        expect(parseExcludePatterns('^\\d{4}$\n\n^tmp\n   \n')).toEqual(['^\\d{4}$', '^tmp']);
        expect(parseExcludePatterns('^ ')).toEqual(['^ ']);
    });

    it('returns empty array for empty input', () => {
        expect(parseExcludePatterns('')).toEqual([]);
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
