import { describe, it, expect } from 'vitest';
import { isIgnoredPath } from '../src/ignore';

describe('isIgnoredPath', () => {
    it('matches files under an ignored folder', () => {
        expect(isIgnoredPath('.obsidian/config', ['.obsidian'])).toBe(true);
        expect(isIgnoredPath('.trash/dead.md', ['.obsidian', '.trash'])).toBe(true);
    });

    it('matches the folder path itself', () => {
        expect(isIgnoredPath('.obsidian', ['.obsidian'])).toBe(true);
    });

    it('does NOT match sibling folders sharing the prefix string', () => {
        expect(isIgnoredPath('.obsidianX/f.md', ['.obsidian'])).toBe(false);
        expect(isIgnoredPath('templatesX/f.md', ['templates'])).toBe(false);
    });

    it('tolerates trailing slashes in entries', () => {
        expect(isIgnoredPath('notes/a.md', ['notes/'])).toBe(true);
    });

    it('matches nested paths under the ignored folder', () => {
        expect(isIgnoredPath('templates/sub/deep.md', ['templates'])).toBe(true);
    });

    it('only matches from the vault root, not mid-path', () => {
        expect(isIgnoredPath('sub/notes/a.md', ['notes'])).toBe(false);
    });

    it('skips empty entries and handles empty lists', () => {
        expect(isIgnoredPath('a.md', [])).toBe(false);
        expect(isIgnoredPath('notes/a.md', ['', 'notes'])).toBe(true);
    });
});
