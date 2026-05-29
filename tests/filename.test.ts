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
            const r = sanitizeFileName(emojis, { ...DEFAULT_SANITIZE_OPTS, maxLength: 80 });
            const cps = Array.from(r);
            expect(cps.length).toBe(80);
            expect(cps.every((c) => c === '🚀')).toBe(true);
        });

        it('honours custom maxLength', () => {
            expect(sanitizeFileName('abcdefghij', { ...DEFAULT_SANITIZE_OPTS, maxLength: 5 })).toBe('abcde');
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