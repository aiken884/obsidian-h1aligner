import { describe, it, expect } from 'vitest';
import { noticeFor } from '../src/notice';
import type { RenameOutcome } from '../src/rename-service';

const renamed: RenameOutcome = { skipped: 'none', newName: 'New Title' };
const noH1: RenameOutcome = { skipped: 'no-h1', newName: null };
const failed: RenameOutcome = { skipped: 'none', newName: null, error: new Error('disk full') };

describe('noticeFor', () => {
    describe("automatic renames, level 'off'", () => {
        it('is silent for everything', () => {
            expect(noticeFor(renamed, false, 'off')).toBeNull();
            expect(noticeFor(noH1, false, 'off')).toBeNull();
            expect(noticeFor(failed, false, 'off')).toBeNull();
        });
    });

    describe("automatic renames, level 'errors'", () => {
        it('reports only errors', () => {
            expect(noticeFor(failed, false, 'errors')).toBe('H1Aligner error: disk full');
            expect(noticeFor(renamed, false, 'errors')).toBeNull();
            expect(noticeFor(noH1, false, 'errors')).toBeNull();
        });
    });

    describe("automatic renames, level 'all'", () => {
        it('reports errors and successes but stays quiet on skips', () => {
            expect(noticeFor(failed, false, 'all')).toBe('H1Aligner error: disk full');
            expect(noticeFor(renamed, false, 'all')).toBe('H1Aligner: renamed → New Title');
            expect(noticeFor(noH1, false, 'all')).toBeNull();
        });
    });

    describe('manual command (always reports, regardless of level)', () => {
        it('reports success, skip reasons, and errors at every level', () => {
            expect(noticeFor(renamed, true, 'off')).toBe('H1Aligner: renamed → New Title');
            expect(noticeFor(noH1, true, 'off')).toBe('H1Aligner: skipped (no-h1)');
            expect(noticeFor(failed, true, 'off')).toBe('H1Aligner error: disk full');
            const locked: RenameOutcome = { skipped: 'locked', newName: null };
            expect(noticeFor(locked, true, 'off')).toBe('H1Aligner: skipped (locked)');
        });
    });
});
