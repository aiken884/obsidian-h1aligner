import { describe, it, expect } from 'vitest';
import { ActivityLog, formatActivityEntry, formatActivityText } from '../src/activity-log';

describe('ActivityLog', () => {
    it('records entries with the newest first', () => {
        const log = new ActivityLog(10);
        log.record({ ts: 1, path: 'a.md', source: 'file-open', outcome: 'same-name' });
        log.record({ ts: 2, path: 'b.md', source: 'manual', outcome: 'renamed', newName: 'B' });
        const entries = log.entries();
        expect(entries.length).toBe(2);
        expect(entries[0].path).toBe('b.md');
        expect(entries[0].newName).toBe('B');
        expect(entries[1].outcome).toBe('same-name');
    });

    it('caps the buffer, dropping the oldest entries', () => {
        const log = new ActivityLog(3);
        for (let i = 0; i < 5; i++) {
            log.record({ ts: i, path: `f${i}.md`, source: 'file-open', outcome: 'no-h1' });
        }
        const entries = log.entries();
        expect(entries.length).toBe(3);
        expect(entries[0].path).toBe('f4.md');
        expect(entries[2].path).toBe('f2.md');
    });

    it('entries() returns a copy, not the internal buffer', () => {
        const log = new ActivityLog(5);
        log.record({ ts: 1, path: 'a.md', source: 'edit', outcome: 'renamed', newName: 'A' });
        const a = log.entries();
        a.pop();
        expect(log.entries().length).toBe(1);
    });

    it('size reflects the current count', () => {
        const log = new ActivityLog(5);
        expect(log.size).toBe(0);
        log.record({ ts: 1, path: 'a.md', source: 'batch', outcome: 'collision' });
        expect(log.size).toBe(1);
    });
});

describe('formatActivityEntry / formatActivityText', () => {
    const time = (ts: number): string => `T${ts}`;

    it('formats a renamed entry with and without a detail', () => {
        expect(
            formatActivityEntry({ ts: 1, path: 'a.md', source: 'manual', outcome: 'renamed', newName: 'Alpha' }, 'T1'),
        ).toBe('T1  [manual]  a.md  → Alpha');
        expect(
            formatActivityEntry(
                { ts: 1, path: 'a.md', source: 'edit', outcome: 'renamed', newName: 'Alpha', detail: '+2 tags' },
                'T1',
            ),
        ).toBe('T1  [edit]  a.md  → Alpha (+2 tags)');
    });

    it('formats a non-renamed entry with and without a detail', () => {
        expect(formatActivityEntry({ ts: 2, path: 'b.md', source: 'file-open', outcome: 'no-h1' }, 'T2')).toBe(
            'T2  [file-open]  b.md  (no-h1)',
        );
        expect(
            formatActivityEntry({ ts: 2, path: 'b.md', source: 'batch', outcome: 'error', detail: 'boom' }, 'T2'),
        ).toBe('T2  [batch]  b.md  (error: boom)');
    });

    it('joins entries with newlines in the order given (newest first from the log)', () => {
        const log = new ActivityLog();
        log.record({ ts: 1, path: 'a.md', source: 'file-open', outcome: 'renamed', newName: 'Alpha' });
        log.record({ ts: 2, path: 'b.md', source: 'manual', outcome: 'no-h1' });
        expect(formatActivityText(log.entries(), time)).toBe(
            'T2  [manual]  b.md  (no-h1)\nT1  [file-open]  a.md  → Alpha',
        );
    });

    it('returns an empty string for no entries', () => {
        expect(formatActivityText([], time)).toBe('');
    });
});
