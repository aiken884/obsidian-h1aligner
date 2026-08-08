/**
 * tag-move-policy.ts — pure decision/formatting logic for the experimental
 * tag-move feature's wiring layer in main.ts. Extracted so the "typing in
 * progress" guard and activity-log formatting are unit-testable without
 * booting a full Obsidian instance (main.ts itself stays a thin shell,
 * exercised only by the E2E smoke test against the built bundle).
 */

/**
 * Whether an automatic rename may collect inline tags. False while the note
 * is actively being typed in (source === 'edit') or was edited within the
 * last editDebounceMs — this check applies uniformly across EVERY trigger
 * source that can fire a mutating rename (file-open, leave, manual, batch),
 * not just 'edit', so a half-typed #tag is never moved regardless of which
 * path fired the rename.
 */
export function computeAllowTagMove(
    source: string,
    lastEditAtMs: number | undefined,
    editDebounceMs: number,
    now: number,
): boolean {
    if (source === 'edit') return false;
    if (lastEditAtMs === undefined) return true;
    return now - lastEditAtMs >= editDebounceMs;
}

/** Activity-log detail string for the experimental tag move ('+N tags (M stale)'). */
export function formatTagMoveDetail(
    moved: number | undefined,
    stale: number | undefined,
): string | undefined {
    if (!moved && !stale) return undefined;
    const base = `+${moved ?? 0} tags`;
    return stale && stale > 0 ? `${base} (${stale} stale)` : base;
}
