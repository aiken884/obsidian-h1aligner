/**
 * activity-log.ts — session ring buffer of rename decisions (pure, no
 * obsidian import). Answers "why wasn't this file renamed?" without
 * telemetry: entries live in memory only and die with the session.
 */
export type ActivitySource = 'file-open' | 'edit' | 'leave' | 'manual' | 'batch' | 'undo';

export interface ActivityEntry {
    ts: number;
    path: string;
    source: ActivitySource;
    /** 'renamed' or a RenameSkipReason or 'error'. */
    outcome: string;
    newName?: string;
    detail?: string;
}

/**
 * One line of the activity view: `time  [source]  path  result`. Shared by the
 * modal rows and the Copy button so the copied text can never drift from what
 * is on screen. `detail` also carries the experimental tag-move summary
 * ('+N tags') on a successful rename — it must not be dropped.
 */
export function formatActivityEntry(e: ActivityEntry, time: string): string {
    const result =
        e.outcome === 'renamed'
            ? `→ ${e.newName}${e.detail ? ' (' + e.detail + ')' : ''}`
            : `(${e.outcome}${e.detail ? ': ' + e.detail : ''})`;
    return `${time}  [${e.source}]  ${e.path}  ${result}`;
}

/** Entries in the order given (the log hands them newest first), one per line. */
export function formatActivityText(
    entries: readonly ActivityEntry[],
    formatTime: (ts: number) => string,
): string {
    return entries.map((e) => formatActivityEntry(e, formatTime(e.ts))).join('\n');
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
