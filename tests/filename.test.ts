import { describe, it, expect } from 'vitest';
import { sanitizeFileName, DEFAULT_SANITIZE_OPTS } from '../src/filename';

describe('sanitizeFileName', () => {
    it('passes plain ASCII through unchanged', () => {
        expect(sanitizeFileName('Hello World')).toBe('Hello World');
    });

    describe('Windows-illegal character replacement (Q3.2 + Q3.3)', () => {
        it('replaces all 9 illegal chars with space', () => {
            expect(sanitizeFileName('a:b*c?d"e<f>g|h')).toBe('a b c d e f g h');
        });

        it('replaces backslash and forward slash', () => {
            expect(sanitizeFileName('a/b\\c')).toBe('a b c');
        });

        it('honours custom replacement char', () => {
            const r = sanitizeFileName('a:b', { ...DEFAULT_SANITIZE_OPTS, illegalReplacementChar: '_' });
            expect(r).toBe('a_b');
        });

        it('skips replacement when disabled', () => {
            const r = sanitizeFileName('a:b', { ...DEFAULT_SANITIZE_OPTS, replaceIllegalCharacters: false });
            expect(r).toBe('a:b');
        });
    });

    describe('Obsidian-illegal characters (# ^ [ ])', () => {
        it('replaces # ^ [ ] which break Obsidian links', () => {
            expect(sanitizeFileName('a#b^c[d]e')).toBe('a b c d e');
        });

        it('handles an H1 that is an inline tag', () => {
            expect(sanitizeFileName('Note #project')).toBe('Note project');
        });

        it('handles wikilink-style brackets', () => {
            expect(sanitizeFileName('[[linked]] idea')).toBe('linked idea');
        });

        it('keeps them when replacement is disabled', () => {
            const r = sanitizeFileName('a#b', { ...DEFAULT_SANITIZE_OPTS, replaceIllegalCharacters: false });
            expect(r).toBe('a#b');
        });
    });

    describe('replacement character safety', () => {
        it('drops an illegal replacement char instead of reintroducing it', () => {
            const r = sanitizeFileName('a:b', { ...DEFAULT_SANITIZE_OPTS, illegalReplacementChar: '/' });
            expect(r).toBe('ab');
        });

        it('drops a backslash replacement char', () => {
            const r = sanitizeFileName('a:b', { ...DEFAULT_SANITIZE_OPTS, illegalReplacementChar: '\\' });
            expect(r).toBe('ab');
        });

        it('caps a multi-character replacement to its first character', () => {
            const r = sanitizeFileName('x:y', { ...DEFAULT_SANITIZE_OPTS, illegalReplacementChar: '--' });
            expect(r).toBe('x-y');
        });

        it('does not expand $-replacement templates', () => {
            const r = sanitizeFileName('x:y', { ...DEFAULT_SANITIZE_OPTS, illegalReplacementChar: '$&' });
            expect(r).toBe('x$y');
        });

        it('falls back to space for non-string replacement', () => {
            const r = sanitizeFileName('a:b', { ...DEFAULT_SANITIZE_OPTS, illegalReplacementChar: 7 as any });
            expect(r).toBe('a b');
        });
    });

    describe('whitespace handling (Q3.1)', () => {
        it('trims leading/trailing whitespace', () => {
            expect(sanitizeFileName('  Padded  ')).toBe('Padded');
        });

        it('collapses multiple internal whitespace to single space', () => {
            expect(sanitizeFileName('a    b   c')).toBe('a b c');
        });

        it('handles tabs and newlines as whitespace', () => {
            expect(sanitizeFileName('a\tb\nc')).toBe('a b c');
        });
    });

    describe('control characters', () => {
        it('strips NUL and C0 control chars', () => {
            expect(sanitizeFileName('a\x00b\x1Fc')).toBe('abc');
        });

        it('strips DEL (0x7F)', () => {
            expect(sanitizeFileName('a\x7Fb')).toBe('ab');
        });
    });

    describe('leading/trailing dots and spaces (cross-platform)', () => {
        it('strips leading dots (no hidden files)', () => {
            expect(sanitizeFileName('.hidden')).toBe('hidden');
            expect(sanitizeFileName('..foo')).toBe('foo');
        });

        it('strips trailing dots (Windows refuses)', () => {
            expect(sanitizeFileName('foo.')).toBe('foo');
            expect(sanitizeFileName('foo...')).toBe('foo');
        });

        it('strips trailing dots and spaces together', () => {
            expect(sanitizeFileName('foo. ')).toBe('foo');
            expect(sanitizeFileName('foo .')).toBe('foo');
        });

        it('re-trims whitespace exposed by stripping leading dots', () => {
            expect(sanitizeFileName('... draft')).toBe('draft');
            expect(sanitizeFileName('. . .draft')).toBe('draft');
        });

        it('strips trailing dots after truncation even with trimWhitespace off', () => {
            const opts = { ...DEFAULT_SANITIZE_OPTS, trimWhitespace: false, maxLength: 5 };
            expect(sanitizeFileName('abcd.efgh', opts)).toBe('abcd');
            expect(sanitizeFileName('abcd efgh', opts)).toBe('abcd');
        });
    });

    describe('path separators are structural (never depend on the toggle)', () => {
        const noReplace = { ...DEFAULT_SANITIZE_OPTS, replaceIllegalCharacters: false };

        it('replaces / and \\ even when replaceIllegalCharacters is off', () => {
            expect(sanitizeFileName('a/b', noReplace)).toBe('a b');
            expect(sanitizeFileName('a\\b', noReplace)).toBe('a b');
        });

        it('still leaves other illegal chars alone when the toggle is off', () => {
            expect(sanitizeFileName('a:b', noReplace)).toBe('a:b');
        });
    });

    describe('Windows reserved names', () => {
        it('appends underscore for reserved names (uppercase)', () => {
            expect(sanitizeFileName('CON')).toBe('CON_');
            expect(sanitizeFileName('PRN')).toBe('PRN_');
            expect(sanitizeFileName('AUX')).toBe('AUX_');
            expect(sanitizeFileName('NUL')).toBe('NUL_');
        });

        it('appends underscore for reserved names (case-insensitive)', () => {
            expect(sanitizeFileName('con')).toBe('con_');
            expect(sanitizeFileName('Con')).toBe('Con_');
        });

        it('handles COM1-9 and LPT1-9', () => {
            expect(sanitizeFileName('COM1')).toBe('COM1_');
            expect(sanitizeFileName('COM9')).toBe('COM9_');
            expect(sanitizeFileName('LPT1')).toBe('LPT1_');
            expect(sanitizeFileName('LPT9')).toBe('LPT9_');
        });

        it('does NOT mangle non-reserved similar names', () => {
            expect(sanitizeFileName('CONsider')).toBe('CONsider');
            expect(sanitizeFileName('CONS')).toBe('CONS');
            expect(sanitizeFileName('COM')).toBe('COM');
            expect(sanitizeFileName('COM10')).toBe('COM10');
            expect(sanitizeFileName('LPT')).toBe('LPT');
        });

        it('never exceeds maxLength when the post-truncation guard would append', () => {
            const r = sanitizeFileName('AUXES', { ...DEFAULT_SANITIZE_OPTS, maxLength: 3 });
            expect(Array.from(r).length).toBeLessThanOrEqual(3);
            expect(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(r)).toBe(false);
        });

        it('guards reserved stems followed by a dot (AUX.notes)', () => {
            expect(sanitizeFileName('AUX.notes')).toBe('AUX_.notes');
            expect(sanitizeFileName('con.backup')).toBe('con_.backup');
        });

        it('does NOT mangle names merely containing a reserved word', () => {
            expect(sanitizeFileName('AUXnotes')).toBe('AUXnotes');
            expect(sanitizeFileName('notes.AUX')).toBe('notes.AUX');
        });
    });

    describe('length cap (Q3.4 = 150)', () => {
        it('truncates to default 150 chars', () => {
            const long = 'a'.repeat(200);
            expect(sanitizeFileName(long).length).toBe(150);
        });

        it('preserves shorter strings', () => {
            expect(sanitizeFileName('short').length).toBe(5);
        });

        it('truncates on code-point boundary (preserves surrogate pairs)', () => {
            const emojis = '🚀'.repeat(100);
            const r = sanitizeFileName(emojis, { ...DEFAULT_SANITIZE_OPTS, maxLength: 80, maxBytes: 0 });
            const cps = Array.from(r);
            expect(cps.length).toBe(80);
            expect(cps.every((c) => c === '🚀')).toBe(true);
        });

        it('honours custom maxLength', () => {
            expect(sanitizeFileName('abcdefghij', { ...DEFAULT_SANITIZE_OPTS, maxLength: 5 })).toBe('abcde');
        });
    });

    describe('filesystem byte limit (255-byte NAME_MAX on APFS/ext4/NTFS-UTF8)', () => {
        const utf8len = (s: string) => new TextEncoder().encode(s).length;

        it('caps the default output at 251 bytes so base + ".md" fits in 255', () => {
            const r = sanitizeFileName('中'.repeat(150));
            expect(utf8len(r)).toBeLessThanOrEqual(251);
            expect(utf8len(r + '.md')).toBeLessThanOrEqual(255);
            // 83 CJK chars * 3 bytes = 249 ≤ 251; 84 would be 252
            expect(Array.from(r).length).toBe(83);
        });

        it('never splits a surrogate pair at the byte boundary', () => {
            const r = sanitizeFileName('🚀'.repeat(100));
            expect(utf8len(r)).toBeLessThanOrEqual(251);
            expect(Array.from(r).every((c) => c === '🚀')).toBe(true);
        });

        it('honours a custom maxBytes budget', () => {
            const r = sanitizeFileName('中'.repeat(150), { ...DEFAULT_SANITIZE_OPTS, maxBytes: 30 });
            expect(utf8len(r)).toBeLessThanOrEqual(30);
            expect(Array.from(r).length).toBe(10);
        });

        it('leaves short names untouched', () => {
            expect(sanitizeFileName('中文檔名')).toBe('中文檔名');
        });

        it('maxBytes: 0 disables the byte cap', () => {
            const r = sanitizeFileName('中'.repeat(150), { ...DEFAULT_SANITIZE_OPTS, maxBytes: 0 });
            expect(Array.from(r).length).toBe(150);
        });
    });

    describe('Unicode preservation', () => {
        it('preserves Chinese characters', () => {
            expect(sanitizeFileName('中文檔名')).toBe('中文檔名');
        });

        it('preserves Japanese characters', () => {
            expect(sanitizeFileName('日本語')).toBe('日本語');
        });

        it('preserves emoji', () => {
            expect(sanitizeFileName('hello 🚀 world')).toBe('hello 🚀 world');
        });

        it('preserves accented characters via NFC', () => {
            // NFC composed 'é' should pass through
            expect(sanitizeFileName('café')).toBe('café');
        });
    });

    describe('defensive behaviour', () => {
        it('returns empty string for non-string input', () => {
            // @ts-expect-error testing runtime safety
            expect(sanitizeFileName(null)).toBe('');
            // @ts-expect-error testing runtime safety
            expect(sanitizeFileName(undefined)).toBe('');
        });

        it('handles empty input', () => {
            expect(sanitizeFileName('')).toBe('');
        });

        it('handles all-illegal input (becomes empty)', () => {
            // All illegal chars → replaced with spaces → trimmed → empty
            expect(sanitizeFileName('<<<>>>')).toBe('');
        });
    });
});