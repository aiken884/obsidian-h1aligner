import { describe, it, expect } from 'vitest';
import { ActivityLog } from '../src/activity-log';

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
