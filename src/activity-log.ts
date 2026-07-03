/**
 * activity-log.ts — session ring buffer of rename decisions (pure, no
 * obsidian import). Answers "why wasn't this file renamed?" without
 * telemetry: entries live in memory only and die with the session.
 */
export type ActivitySource = 'file-open' | 'edit' | 'manual' | 'batch' | 'undo';

export interface ActivityEntry {
    ts: number;
    path: string;
    source: ActivitySource;
    /** 'renamed' or a RenameSkipReason or 'error'. */
    outcome: string;
    newName?: string;
    detail?: string;
}

export class ActivityLog {
    private readonly buffer: ActivityEntry[] = [];

    constructor(private readonly cap = 200) {}

    record(entry: ActivityEntry): void {
        this.buffer.push(entry);
        if (this.buffer.length > this.cap) this.buffer.shift();
    }

    /** Newest first. Returns a copy. */
    entries(): ActivityEntry[] {
        return [...this.buffer].reverse();
    }

    get size(): number {
        return this.buffer.length;
    }
}
