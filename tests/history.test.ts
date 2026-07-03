import { describe, it, expect } from 'vitest';
import { RenameHistory } from '../src/history';

describe('RenameHistory', () => {
    it('push/pop is LIFO', () => {
        const h = new RenameHistory();
        h.push({ from: 'a.md', to: 'b.md' });
        h.push({ from: 'c.md', to: 'd.md' });
        expect(h.pop()).toEqual({ from: 'c.md', to: 'd.md' });
        expect(h.pop()).toEqual({ from: 'a.md', to: 'b.md' });
        expect(h.pop()).toBeUndefined();
    });

    it('peek does not remove', () => {
        const h = new RenameHistory();
        h.push({ from: 'a.md', to: 'b.md' });
        expect(h.peek()).toEqual({ from: 'a.md', to: 'b.md' });
        expect(h.size).toBe(1);
    });

    it('caps the stack, dropping the oldest entries', () => {
        const h = new RenameHistory(3);
        for (let i = 0; i < 5; i++) h.push({ from: `f${i}`, to: `t${i}` });
        expect(h.size).toBe(3);
        expect(h.pop()).toEqual({ from: 'f4', to: 't4' });
        expect(h.pop()).toEqual({ from: 'f3', to: 't3' });
        expect(h.pop()).toEqual({ from: 'f2', to: 't2' });
    });
});
