import { describe, expect, it, vi } from 'vitest';
import { explainNote } from '../src/explain-note';
import { countOutOfScope, isInScope, isUnderFolder, scopeOutReason } from '../src/scope';

const base = {
    ignoreFolders: [] as string[],
    includeFolders: [] as string[],
    excludePatterns: [] as string[],
};

describe('scopeOutReason', () => {
    it('returns ignored before include/exclude (ignore beats include)', () => {
        const s = {
            ...base,
            ignoreFolders: ['_inbox/private'],
            includeFolders: ['_inbox'],
            excludePatterns: ['^skip$'],
        };
        expect(scopeOutReason('_inbox/private/x.md', 'x', s)).toBe('ignored');
        expect(isInScope('_inbox/private/x.md', 'x', s)).toBe(false);
    });

    it('returns not-included when the whitelist is on and the path misses it', () => {
        const s = { ...base, includeFolders: ['notes'] };
        expect(scopeOutReason('other/a.md', 'a', s)).toBe('not-included');
        expect(scopeOutReason('notes/a.md', 'a', s)).toBe(null);
    });

    it('returns excluded-pattern for a matching basename', () => {
        const s = { ...base, excludePatterns: ['^\\d{4}-\\d{2}-\\d{2}$'] };
        expect(scopeOutReason('daily/2026-07-03.md', '2026-07-03', s)).toBe('excluded-pattern');
        expect(scopeOutReason('notes/hello.md', 'hello', s)).toBe(null);
    });
});

describe('explainNote', () => {
    it('explains an ignored note without needing a dry-run', () => {
        const result = explainNote({
            path: '.trash/old.md',
            basename: 'old',
            scopeOut: 'ignored',
            dryRun: null,
        });
        expect(result.kind).toBe('out-of-scope');
        expect(result.text).toContain('.trash/old.md');
        expect(result.text.toLowerCase()).toMatch(/ignored/);
        expect(result.text.toLowerCase()).toMatch(/manual/);
    });

    it('explains include-miss and exclude-pattern as automatic-only skips', () => {
        const miss = explainNote({
            path: 'other/a.md',
            basename: 'a',
            scopeOut: 'not-included',
            dryRun: null,
        });
        expect(miss.kind).toBe('out-of-scope');
        expect(miss.text).toMatch(/manual command can still rename/i);

        const excl = explainNote({
            path: 'daily/2026-07-03.md',
            basename: '2026-07-03',
            scopeOut: 'excluded-pattern',
            dryRun: null,
        });
        expect(excl.kind).toBe('out-of-scope');
        expect(excl.text).toMatch(/manual command can still rename/i);
    });

    it('reports would-rename from the dry-run basename', () => {
        const result = explainNote({
            path: 'notes/old.md',
            basename: 'old',
            scopeOut: null,
            dryRun: { skipped: 'none', newName: 'Better Title' },
        });
        expect(result.kind).toBe('would-rename');
        expect(result.text).toContain('notes/old.md');
        expect(result.text).toContain('Better Title');
    });

    it('reports locked and no-H1 using the shared skip-reason copy', () => {
        const locked = explainNote({
            path: 'notes/locked.md',
            basename: 'locked',
            scopeOut: null,
            dryRun: { skipped: 'locked', newName: null },
        });
        expect(locked.kind).toBe('skip');
        expect(locked.text).toContain('Frontmatter lock');

        const noH1 = explainNote({
            path: 'notes/empty.md',
            basename: 'empty',
            scopeOut: null,
            dryRun: { skipped: 'no-h1', newName: null },
        });
        expect(noH1.kind).toBe('skip');
        expect(noH1.text).toContain('No first H1');
    });

    it('does not invent a write: dryRun is only read', () => {
        const spy = vi.fn();
        const dryRun = {
            skipped: 'none' as const,
            newName: 'X',
            get error() {
                spy();
                return undefined;
            },
        };
        explainNote({
            path: 'a.md',
            basename: 'a',
            scopeOut: 'ignored',
            dryRun,
        });
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('countOutOfScope', () => {
    it('equals files that fail the existing isInScope filter and excludes them from in-scope', () => {
        const scope = {
            ignoreFolders: ['.trash'],
            includeFolders: ['notes'],
            excludePatterns: ['^skip-me$'],
        };
        const files = [
            { path: 'notes/keep.md', basename: 'keep', extension: 'md' },
            { path: 'notes/skip-me.md', basename: 'skip-me', extension: 'md' },
            { path: '.trash/gone.md', basename: 'gone', extension: 'md' },
            { path: 'other/out.md', basename: 'out', extension: 'md' },
            { path: 'notes/pic.png', basename: 'pic', extension: 'png' },
        ];
        const inScope = files.filter(
            (f) => f.extension === 'md' && isInScope(f.path, f.basename, scope),
        );
        const out = countOutOfScope(files, scope);
        expect(inScope.map((f) => f.path)).toEqual(['notes/keep.md']);
        expect(out).toBe(3);
        expect(out).toBe(
            files.filter((f) => f.extension === 'md' && !isInScope(f.path, f.basename, scope))
                .length,
        );
    });
});

describe('isUnderFolder', () => {
    it('includes descendants and rejects string-prefix siblings', () => {
        expect(isUnderFolder('notes/a.md', 'notes')).toBe(true);
        expect(isUnderFolder('notes/sub/a.md', 'notes')).toBe(true);
        expect(isUnderFolder('notes-old/a.md', 'notes')).toBe(false);
        expect(isUnderFolder('other/a.md', 'notes')).toBe(false);
    });

    it('treats empty, /, and . as the whole vault', () => {
        expect(isUnderFolder('a.md', '')).toBe(true);
        expect(isUnderFolder('notes/a.md', '/')).toBe(true);
        expect(isUnderFolder('notes/a.md', '.')).toBe(true);
    });
});
