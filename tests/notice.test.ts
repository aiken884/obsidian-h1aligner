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
            expect(noticeFor(noH1, true, 'off')).toBe('H1Aligner: skipped (No first H1)');
            expect(noticeFor(failed, true, 'off')).toBe('H1Aligner error: disk full');
            const locked: RenameOutcome = { skipped: 'locked', newName: null };
            expect(noticeFor(locked, true, 'off')).toBe('H1Aligner: skipped (Frontmatter lock)');
        });
    });

    describe('tag-move notice (outcome.movedTags)', () => {
        it("auto, level 'all', same-name skip with movedTags → tagsMoved", () => {
            const outcome: RenameOutcome = { skipped: 'same-name', newName: null, movedTags: 2 };
            expect(noticeFor(outcome, false, 'all')).toBe('H1Aligner: moved 2 tag(s) to frontmatter');
        });

        it("the same outcome stays silent at level 'off' and 'errors'", () => {
            const outcome: RenameOutcome = { skipped: 'same-name', newName: null, movedTags: 2 };
            expect(noticeFor(outcome, false, 'off')).toBeNull();
            expect(noticeFor(outcome, false, 'errors')).toBeNull();
        });

        it("auto, level 'all', successful rename with movedTags → name and tag count", () => {
            const outcome: RenameOutcome = { skipped: 'none', newName: 'New Title', movedTags: 2 };
            const msg = noticeFor(outcome, false, 'all');
            expect(msg).toContain('New Title');
            expect(msg).toContain('+2 tags');
        });

        it('manual command, same-name skip with tags → reason and moved count', () => {
            const outcome: RenameOutcome = { skipped: 'same-name', newName: null, movedTags: 2 };
            const msg = noticeFor(outcome, true, 'off');
            expect(msg).toContain('Already matches the first H1');
            expect(msg).toContain('moved 2');
        });

        it("a non-same-name skip (no-h1) with movedTags at auto 'all' → tagsMoved", () => {
            const outcome: RenameOutcome = { skipped: 'no-h1', newName: null, movedTags: 1 };
            expect(noticeFor(outcome, false, 'all')).toBe('H1Aligner: moved 1 tag(s) to frontmatter');
        });

        it('regression: movedTags undefined or 0 leaves every existing notice string unchanged', () => {
            expect(noticeFor(renamed, false, 'all')).toBe('H1Aligner: renamed → New Title');
            expect(noticeFor({ ...renamed, movedTags: 0 }, false, 'all')).toBe(
                'H1Aligner: renamed → New Title',
            );
            expect(noticeFor(noH1, true, 'off')).toBe('H1Aligner: skipped (No first H1)');
            expect(noticeFor({ ...noH1, movedTags: 0 }, true, 'off')).toBe(
                'H1Aligner: skipped (No first H1)',
            );
            expect(noticeFor(failed, false, 'errors')).toBe('H1Aligner error: disk full');
            expect(noticeFor({ ...failed, movedTags: 0 }, false, 'errors')).toBe(
                'H1Aligner error: disk full',
            );
            const locked: RenameOutcome = { skipped: 'locked', newName: null };
            expect(noticeFor(locked, true, 'off')).toBe('H1Aligner: skipped (Frontmatter lock)');
            expect(noticeFor({ ...locked, movedTags: 0 }, true, 'off')).toBe(
                'H1Aligner: skipped (Frontmatter lock)',
            );
        });
    });
});
