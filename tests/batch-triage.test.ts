import { describe, expect, it } from 'vitest';
import {
    classifyBatchItem,
    groupBatchItems,
    type BatchTriageItem,
} from '../src/batch-triage';

describe('classifyBatchItem', () => {
    it('keeps rename, collision, skip, and error outcomes distinct', () => {
        expect(classifyBatchItem({ skipped: 'none', newName: 'Ready' }, false)).toBe('rename');
        expect(classifyBatchItem({ skipped: 'none', newName: 'Ready' }, true)).toBe('conflict');
        expect(classifyBatchItem({ skipped: 'collision', newName: 'Taken' }, false)).toBe('conflict');
        expect(classifyBatchItem({ skipped: 'no-h1', newName: null }, false)).toBe('skipped');
        expect(
            classifyBatchItem({ skipped: 'none', newName: null, error: new Error('read failed') }, false),
        ).toBe('error');
    });
});

describe('groupBatchItems', () => {
    it('returns non-empty groups in review priority order', () => {
        type TestItem = BatchTriageItem & { from: string };
        const groups = groupBatchItems<TestItem>([
            { from: 'skip.md', status: 'skipped' },
            { from: 'conflict.md', status: 'conflict' },
            { from: 'ready.md', status: 'rename' },
            { from: 'error.md', status: 'error' },
        ]);

        expect(groups.map((group) => [group.status, group.items.map((item) => item.from)])).toEqual([
            ['rename', ['ready.md']],
            ['conflict', ['conflict.md']],
            ['error', ['error.md']],
            ['skipped', ['skip.md']],
        ]);
    });
});
