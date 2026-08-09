import { describe, it, expect } from 'vitest';
import { describeSkipReason } from '../src/skip-reason';
import type { RenameSkipReason } from '../src/rename-service';

describe('describeSkipReason', () => {
    it('maps every real RenameSkipReason to its localized batch.reason.* text, not the raw enum value', () => {
        const cases: Array<[RenameSkipReason, string]> = [
            ['no-h1', 'No first H1'],
            ['locked', 'Frontmatter lock'],
            ['case-only', 'Case-only rename is disabled'],
            ['collision', 'Target filename already exists'],
            ['empty-after-sanitize', 'Filename is empty after sanitising'],
            ['same-name', 'Already matches the first H1'],
            ['in-progress', 'Already being renamed'],
        ];
        for (const [reason, expected] of cases) {
            expect(describeSkipReason(reason)).toBe(expected);
            // The bug this guards against: the raw enum string leaking through.
            expect(describeSkipReason(reason)).not.toBe(reason);
        }
    });

    it("falls back to the raw value for 'none' (not a real skip reason, no mapping exists)", () => {
        expect(describeSkipReason('none')).toBe('none');
    });
});
