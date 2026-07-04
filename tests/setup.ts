// Pure modules use window.* timers (Obsidian popout-window guideline);
// Node has no window, so alias it to globalThis for the test run.
if (typeof (globalThis as Record<string, unknown>).window === 'undefined') {
    (globalThis as Record<string, unknown>).window = globalThis;
}
export {};
