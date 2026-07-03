import { describe, it, expect } from 'vitest';
import { noticeFor } from '../src/notice';
import type { RenameOutcome } from '../src/rename-service';

const renamed: RenameOutcome = { skipped: 'none', newName: 'New Title' };
const noH1: RenameOutcome = { skipped: 'no-h1', newName: null };
const failed: RenameOutcome = { skipped: 'none', newName: null, error: new Error('disk full') };

describe('noticeFor', () => {
    describe('automatic (file-open) renames', () => {
        it('is quiet by default on success', () => {
            expect(noticeFor(renamed, false, false)).toBeNull();
        });

        it('announces success when showNoticeOnRename is on', () => {
            expect(noticeFor(renamed, false, true)).toBe('H1Aligner: renamed → New Title');
        });

        it('is quiet on skips even when showNoticeOnRename is on', () => {
            expect(noticeFor(noH1, false, true)).toBeNull();
        });

        it('is quiet on errors when showNoticeOnRename is off', () => {
            expect(noticeFor(failed, false, false)).toBeNull();
        });

        it('announces errors when showNoticeOnRename is on', () => {
            expect(noticeFor(failed, false, true)).toBe('H1Aligner error: disk full');
        });
    });

    describe('manual command (always reports)', () => {
        it('announces success regardless of the setting', () => {
            expect(noticeFor(renamed, true, false)).toBe('H1Aligner: renamed → New Title');
        });

        it('reports skip reasons', () => {
            expect(noticeFor(noH1, true, false)).toBe('H1Aligner: skipped (no-h1)');
            const collision: RenameOutcome = { skipped: 'collision', newName: 'Taken' };
            expect(noticeFor(collision, true, false)).toBe('H1Aligner: skipped (collision)');
        });

        it('reports errors regardless of the setting', () => {
            expect(noticeFor(failed, true, false)).toBe('H1Aligner error: disk full');
        });
    });
});
