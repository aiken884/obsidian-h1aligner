import { describe, it, expect } from 'vitest';
import { extractFirstH1 } from '../src/heading';

describe('extractFirstH1', () => {
    describe('cache strategy (Q1: Setext via cache for free)', () => {
        it('returns first H1 from cache', () => {
            const cache = {
                headings: [{ level: 1, heading: 'Hello World', position: {} }],
            };
            const r = extractFirstH1(cache as any);
            expect(r.h1).toBe('Hello World');
            expect(r.source).toBe('cache');
        });

        it('walks past H2/H3 to find first H1', () => {
            const cache = {
                headings: [
                    { level: 2, heading: 'Sub', position: {} },
                    { level: 3, heading: 'Subsub', position: {} },
                    { level: 1, heading: 'Main', position: {} },
                ],
            };
            expect(extractFirstH1(cache as any).h1).toBe('Main');
        });

        it('trims whitespace from cache H1', () => {
            const cache = { headings: [{ level: 1, heading: '  Padded  ', position: {} }] };
            expect(extractFirstH1(cache as any).h1).toBe('Padded');
        });

        it('returns null when H1 is whitespace-only', () => {
            const cache = { headings: [{ level: 1, heading: '   ', position: {} }] };
            expect(extractFirstH1(cache as any).h1).toBeNull();
        });

        it('handles empty cache.headings array', () => {
            expect(extractFirstH1({ headings: [] } as any).h1).toBeNull();
        });

        it('prefers cache over scan when both provide an H1', () => {
            const cache = { headings: [{ level: 1, heading: 'FromCache', position: {} }] };
            const r = extractFirstH1(cache as any, '# FromScan');
            expect(r.h1).toBe('FromCache');
            expect(r.source).toBe('cache');
        });
    });

    describe('scan strategy (ATX only per Q1)', () => {
        it('finds ATX H1 in plain content', () => {
            const r = extractFirstH1(null, '# Title\nbody');
            expect(r.h1).toBe('Title');
            expect(r.source).toBe('scan');
        });

        it('ignores H2 lines', () => {
            expect(extractFirstH1(null, '## Not me\n# Me\n').h1).toBe('Me');
        });

        it('skips YAML frontmatter', () => {
            const c = '---\ntitle: foo\ntags: [a, b]\n---\n# Real Title\n';
            expect(extractFirstH1(null, c).h1).toBe('Real Title');
        });

        it('skips fenced code blocks (backtick)', () => {
            const c = '```\n# Not a heading\n```\n# Real Heading\n';
            expect(extractFirstH1(null, c).h1).toBe('Real Heading');
        });

        it('skips fenced code blocks (tilde)', () => {
            const c = '~~~\n# Not a heading\n~~~\n# Real Heading\n';
            expect(extractFirstH1(null, c).h1).toBe('Real Heading');
        });

        it('strips trailing # decoration', () => {
            expect(extractFirstH1(null, '# Title #').h1).toBe('Title');
            expect(extractFirstH1(null, '# Title ###').h1).toBe('Title');
        });

        it('accepts 0-3 leading spaces (ATX rule)', () => {
            expect(extractFirstH1(null, '# OK').h1).toBe('OK');
            expect(extractFirstH1(null, '   # OK').h1).toBe('OK');
        });

        it('rejects 4+ leading spaces (becomes code block per CommonMark)', () => {
            expect(extractFirstH1(null, '    # NotHeading').h1).toBeNull();
        });

        it('returns null when no H1 is found', () => {
            expect(extractFirstH1(null, '## Only H2\nbody\n').h1).toBeNull();
        });

        it('handles Chinese H1', () => {
            expect(extractFirstH1(null, '# 中文標題').h1).toBe('中文標題');
        });

        it('handles emoji in H1', () => {
            expect(extractFirstH1(null, '# Title 🚀 ok').h1).toBe('Title 🚀 ok');
        });

        it('handles CRLF line endings', () => {
            expect(extractFirstH1(null, '# Title\r\nbody\r\n').h1).toBe('Title');
        });

        it('handles trailing whitespace on H1 line', () => {
            expect(extractFirstH1(null, '# Title   \n').h1).toBe('Title');
        });
    });

    describe('edge cases', () => {
        it('returns none when both inputs are missing', () => {
            expect(extractFirstH1(null, undefined).source).toBe('none');
            expect(extractFirstH1(undefined, undefined).source).toBe('none');
        });

        it('returns none for empty content', () => {
            expect(extractFirstH1(null, '').source).toBe('none');
        });
    });
});