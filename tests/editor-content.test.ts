import { describe, it, expect } from 'vitest';
import { getEditorContent } from '../src/editor-content';

const file = { path: 'notes/a.md' };
const leaf = (path: string | null, value: string) => ({
    view: path === null ? {} : { file: { path }, editor: { getValue: () => value } },
});
const appWith = (leaves: unknown[]) => ({ workspace: { getLeavesOfType: () => leaves } }) as any;

describe('getEditorContent', () => {
    it('returns the buffer of the leaf showing the file', () => {
        const app = appWith([leaf('notes/b.md', 'B'), leaf('notes/a.md', 'A buffer')]);
        expect(getEditorContent(app, file as any)).toBe('A buffer');
    });
    it('returns undefined when the file is not open', () => {
        expect(getEditorContent(appWith([leaf('notes/b.md', 'B')]), file as any)).toBeUndefined();
        expect(getEditorContent(appWith([]), file as any)).toBeUndefined();
    });
    it('ignores leaves whose view has no file/editor (not yet loaded)', () => {
        expect(getEditorContent(appWith([leaf(null, '')]), file as any)).toBeUndefined();
    });
});
