import { describe, it, expect } from 'vitest';
import { computeAllowTagMove, formatTagMoveDetail } from '../src/tag-move-policy';

describe('computeAllowTagMove', () => {
    it('is always false for the edit source, regardless of lastEditAt', () => {
        expect(computeAllowTagMove('edit', undefined, 2000, 100_000)).toBe(false);
        expect(computeAllowTagMove('edit', 0, 2000, 100_000)).toBe(false);
        expect(computeAllowTagMove('edit', 99_000, 2000, 100_000)).toBe(false);
    });

    it('is true for any non-edit source when the file was never edited this session', () => {
        for (const source of ['file-open', 'leave', 'manual', 'batch']) {
            expect(computeAllowTagMove(source, undefined, 2000, 100_000)).toBe(true);
        }
    });

    it('is false while inside the edit-debounce window after the last keystroke', () => {
        // Edited at t=99_000, debounce=2000, now=100_000 → 1000ms elapsed, still inside.
        expect(computeAllowTagMove('file-open', 99_000, 2000, 100_000)).toBe(false);
        expect(computeAllowTagMove('batch', 99_000, 2000, 100_000)).toBe(false);
        expect(computeAllowTagMove('manual', 99_000, 2000, 100_000)).toBe(false);
        expect(computeAllowTagMove('leave', 99_000, 2000, 100_000)).toBe(false);
    });

    it('is true once the edit-debounce window has fully elapsed (inclusive boundary)', () => {
        // now - lastEditAtMs === editDebounceMs exactly → boundary is allowed (>=).
        expect(computeAllowTagMove('file-open', 98_000, 2000, 100_000)).toBe(true);
        expect(computeAllowTagMove('file-open', 97_999, 2000, 100_000)).toBe(true);
    });

    it('applies uniformly to every automatic AND explicit trigger source — not just edit-adjacent ones', () => {
        // The whole point of the adversarial-review fix: 'manual' and 'batch'
        // get the same protection as 'file-open'/'leave', not an exemption.
        const recentEdit = 99_500;
        for (const source of ['file-open', 'leave', 'manual', 'batch']) {
            expect(computeAllowTagMove(source, recentEdit, 2000, 100_000)).toBe(false);
        }
    });
});

describe('formatTagMoveDetail', () => {
    it('returns undefined when nothing moved and nothing was stale', () => {
        expect(formatTagMoveDetail(undefined, undefined)).toBeUndefined();
        expect(formatTagMoveDetail(0, 0)).toBeUndefined();
        expect(formatTagMoveDetail(0, undefined)).toBeUndefined();
    });

    it('formats a plain moved count with no stale suffix', () => {
        expect(formatTagMoveDetail(3, undefined)).toBe('+3 tags');
        expect(formatTagMoveDetail(3, 0)).toBe('+3 tags');
    });

    it('appends the stale count when present', () => {
        expect(formatTagMoveDetail(2, 1)).toBe('+2 tags (1 stale)');
    });

    it('still reports stale-only outcomes (moved=0, stale>0) with an explicit +0', () => {
        expect(formatTagMoveDetail(0, 2)).toBe('+0 tags (2 stale)');
        expect(formatTagMoveDetail(undefined, 2)).toBe('+0 tags (2 stale)');
    });
});
