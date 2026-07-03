import { describe, it, expect } from 'vitest';
import { isInScope } from '../src/scope';

const base = { ignoreFolders: [] as string[], includeFolders: [] as string[], excludePatterns: [] as string[] };

describe('isInScope', () => {
    it('allows everything with empty settings', () => {
        expect(isInScope('notes/a.md', 'a', base)).toBe(true);
    });

    it('respects ignoreFolders', () => {
        const s = { ...base, ignoreFolders: ['.trash'] };
        expect(isInScope('.trash/a.md', 'a', s)).toBe(false);
        expect(isInScope('notes/a.md', 'a', s)).toBe(true);
    });

    describe('includeFolders (whitelist mode)', () => {
        const s = { ...base, includeFolders: ['_inbox', 'projects/active'] };

        it('allows files under an included folder', () => {
            expect(isInScope('_inbox/idea.md', 'idea', s)).toBe(true);
            expect(isInScope('projects/active/x.md', 'x', s)).toBe(true);
        });

        it('blocks files outside every included folder', () => {
            expect(isInScope('notes/a.md', 'a', s)).toBe(false);
            expect(isInScope('_inboxX/a.md', 'a', s)).toBe(false);
        });

        it('ignore wins over include when both match', () => {
            const both = { ...s, ignoreFolders: ['_inbox/private'] };
            expect(isInScope('_inbox/private/x.md', 'x', both)).toBe(false);
        });

        it('tolerates trailing slashes in entries', () => {
            expect(isInScope('_inbox/a.md', 'a', { ...base, includeFolders: ['_inbox/'] })).toBe(true);
        });

        it("treats '/' (or '\\') as the vault ROOT layer — root files only, no subfolders", () => {
            expect(isInScope('a.md', 'a', { ...base, includeFolders: ['/'] })).toBe(true);
            expect(isInScope('notes/a.md', 'a', { ...base, includeFolders: ['/'] })).toBe(false);
            expect(isInScope('a.md', 'a', { ...base, includeFolders: ['\\'] })).toBe(true);
            expect(isInScope('notes/a.md', 'a', { ...base, includeFolders: ['\\'] })).toBe(false);
        });

        it("combines root '/' with named folders", () => {
            const s = { ...base, includeFolders: ['/', 'notes'] };
            expect(isInScope('a.md', 'a', s)).toBe(true);
            expect(isInScope('notes/a.md', 'a', s)).toBe(true);
            expect(isInScope('other/x.md', 'x', s)).toBe(false);
        });

        it('still ignores blank entries without locking out the vault', () => {
            expect(isInScope('notes/a.md', 'a', { ...base, includeFolders: ['  '] })).toBe(true);
        });
    });

    describe('excludePatterns (regex vs basename)', () => {
        it('blocks daily-note basenames with the default pattern', () => {
            const s = { ...base, excludePatterns: ['^\\d{4}-\\d{2}-\\d{2}$'] };
            expect(isInScope('daily/2026-07-03.md', '2026-07-03', s)).toBe(false);
            expect(isInScope('notes/2026 review.md', '2026 review', s)).toBe(true);
        });

        it('matches against the basename, not the full path', () => {
            const s = { ...base, excludePatterns: ['^daily$'] };
            expect(isInScope('daily/x.md', 'x', s)).toBe(true);
        });

        it('skips invalid regex patterns but keeps the valid ones working', () => {
            const s = { ...base, excludePatterns: ['([', '^skipme$'] };
            expect(isInScope('a/ok.md', 'ok', s)).toBe(true);
            expect(isInScope('a/skipme.md', 'skipme', s)).toBe(false);
        });

        it('warns once (not per call) about an invalid pattern', async () => {
            const { vi } = await import('vitest');
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const s = { ...base, excludePatterns: ['(unclosed-' + Math.trunc(1e6 * 0.42)] };
            isInScope('a/x.md', 'x', s);
            isInScope('a/y.md', 'y', s);
            const hits = warn.mock.calls.filter((c) => String(c[0]).includes('unclosed-'));
            expect(hits.length).toBe(1);
            warn.mockRestore();
        });

        it('skips empty pattern entries', () => {
            expect(isInScope('a/x.md', 'x', { ...base, excludePatterns: [''] })).toBe(true);
        });
    });
});
