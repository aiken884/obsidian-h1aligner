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

        it('skips an empty-after-trim H1 and uses a later non-empty cached H1', () => {
            const cache = {
                headings: [
                    { level: 1, heading: '   ', position: {} },
                    { level: 1, heading: 'Real Title', position: {} },
                ],
            };
            const r = extractFirstH1(cache as any);
            expect(r.h1).toBe('Real Title');
            expect(r.source).toBe('cache');
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

        it('accepts tab between # and text (CommonMark)', () => {
            expect(extractFirstH1(null, '#\tTabbed').h1).toBe('Tabbed');
        });
    });

    describe('BOM handling', () => {
        it('strips a leading UTF-8 BOM before scanning', () => {
            expect(extractFirstH1(null, '﻿# Title\nbody').h1).toBe('Title');
        });

        it('still skips frontmatter when the file starts with a BOM', () => {
            const c = '﻿---\n# TODO add tags\ntitle: foo\n---\n# Real Title\n';
            expect(extractFirstH1(null, c).h1).toBe('Real Title');
        });

        it('does not mistake a YAML comment for an H1 in a BOM-prefixed file without body H1', () => {
            const c = '﻿---\n# TODO add tags\ntitle: foo\n---\nplain body\n';
            expect(extractFirstH1(null, c).h1).toBeNull();
        });
    });

    describe('code fence edge cases (CommonMark)', () => {
        it('recognises fences indented 1-3 spaces', () => {
            const c = ' ```\n# Hidden\n ```\n# Real\n';
            expect(extractFirstH1(null, c).h1).toBe('Real');
            const c3 = '   ~~~\n# Hidden\n   ~~~\n# Real\n';
            expect(extractFirstH1(null, c3).h1).toBe('Real');
        });

        it('does not close a backtick fence with a tilde line', () => {
            const c = '```\n~~~\n```\n# Real Title\n';
            expect(extractFirstH1(null, c).h1).toBe('Real Title');
        });

        it('does not treat a tilde line inside a backtick fence as opening a new fence', () => {
            const c = '```\n~~~\n# fake\n~~~\n```\n# Real\n';
            expect(extractFirstH1(null, c).h1).toBe('Real');
        });

        it('requires the closing fence to be at least as long as the opener', () => {
            const c = '````\n```\n# hidden\n````\n# Real\n';
            expect(extractFirstH1(null, c).h1).toBe('Real');
        });

        it('does not close a fence with a line that has an info string', () => {
            const c = '```\n```js\n# hidden\n```\n# Real\n';
            expect(extractFirstH1(null, c).h1).toBe('Real');
        });
    });

    describe('ATX closing-sequence conformance (CommonMark)', () => {
        it('keeps a # glued to the end of the text (# C# stays C#)', () => {
            expect(extractFirstH1(null, '# C#').h1).toBe('C#');
        });

        it('keeps an embedded # followed by text (# issue #42)', () => {
            expect(extractFirstH1(null, '# issue #42').h1).toBe('issue #42');
        });

        it('still strips a space-separated closing sequence', () => {
            expect(extractFirstH1(null, '# Title ##').h1).toBe('Title');
        });

        it('treats a closing-sequence-only line (# #) as an empty heading and keeps scanning', () => {
            expect(extractFirstH1(null, '# #\n\n# Real Title\n').h1).toBe('Real Title');
            expect(extractFirstH1(null, '# ##\n').h1).toBeNull();
        });
    });

    describe('frontmatter terminator (Obsidian dialect)', () => {
        it("does not treat YAML document-end '...' as closing frontmatter", () => {
            const c = '---\ntitle: x\n...\n# TODO clean this up\n---\n\nbody\n';
            expect(extractFirstH1(null, c).h1).toBeNull();
        });
    });

    describe('edge cases', () => {
        it('exposes hasFrontmatterLock for the content-fallback lock check', async () => {
            const { hasFrontmatterLock } = await import('../src/heading');
            expect(hasFrontmatterLock('---\nh1aligner-lock: true\n---\nbody')).toBe(true);
            expect(hasFrontmatterLock('---\nh1aligner-lock: "true"\n---\n')).toBe(true);
            expect(hasFrontmatterLock('﻿---\nh1aligner-lock: true\n---\n')).toBe(true);
            expect(hasFrontmatterLock('---\nh1aligner-lock: false\n---\n')).toBe(false);
            expect(hasFrontmatterLock('---\ntitle: x\n---\nh1aligner-lock: true')).toBe(false);
            expect(hasFrontmatterLock('no frontmatter\nh1aligner-lock: true')).toBe(false);
            expect(hasFrontmatterLock('---\n  h1aligner-lock: true\n---\n')).toBe(false);
            expect(hasFrontmatterLock('')).toBe(false);
        });

        it('returns none when both inputs are missing', () => {
            expect(extractFirstH1(null, undefined).source).toBe('none');
            expect(extractFirstH1(undefined, undefined).source).toBe('none');
        });

        it('returns none for empty content', () => {
            expect(extractFirstH1(null, '').source).toBe('none');
        });
    });
});