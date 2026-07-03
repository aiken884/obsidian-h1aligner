/**
 * debounce.ts — per-key debounce scheduler (pure, no obsidian import,
 * vitest-loadable with fake timers). Used by main.ts to coalesce
 * file-open bursts per file path.
 */
export class KeyedDebouncer {
    private readonly timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    constructor(private readonly delayMs: number) {}

    /** (Re)start the timer for `key`; only the latest callback fires. */
    schedule(key: string, fn: () => void): void {
        const existing = this.timers.get(key);
        if (existing !== undefined) clearTimeout(existing);
        this.timers.set(
            key,
            setTimeout(() => {
                this.timers.delete(key);
                fn();
            }, this.delayMs),
        );
    }

    cancel(key: string): void {
        const t = this.timers.get(key);
        if (t !== undefined) {
            clearTimeout(t);
            this.timers.delete(key);
        }
    }

    cancelAll(): void {
        for (const t of this.timers.values()) clearTimeout(t);
        this.timers.clear();
    }
}
