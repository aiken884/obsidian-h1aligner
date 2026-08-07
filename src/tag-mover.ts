/**
 * tag-mover.ts — pure logic for the experimental "Move tags to frontmatter"
 * feature. Deliberately does not import Obsidian (batch-triage.ts pattern) so
 * the safety-critical filtering, dedup and body-rewrite rules stay unit-testable.
 *
 * Data source contract: candidates come from Obsidian's metadataCache
 * (cache.tags), never from a self-written regex — the official parser already
 * excludes code blocks, URLs, frontmatter and math, and carries exact offsets.
 */

export interface TagLoc {
    line: number;
    col: number;
    offset: number;
}
export interface TagPos {
    start: TagLoc;
    end: TagLoc;
}
export interface InlineTag {
    tag: string;
    position: TagPos;
}
/** Structural subset of Obsidian's CachedMetadata that this module reads. */
export interface CacheLike {
    tags?: InlineTag[];
    headings?: { position: TagPos }[];
    links?: { position: TagPos }[];
    sections?: { type: string; position: TagPos }[];
}

export type BodyTagRemovalMode = 'remove-hash' | 'remove-tag';

/** Case-fold + NFC-normalize a name for comparison (shared with filenames). */
export function foldName(name: string): string {
    try { name = name.normalize('NFC'); } catch { /* no Intl normalize */ }
    return name.toLowerCase();
}

/**
 * Canonical tag-name normalization, shared by the ignore-list match and the
 * frontmatter dedup so the two can never disagree: strip one leading '#',
 * trim, then fold. Nested tags keep their '/' and compare by full name.
 */
export function normalizeTagName(s: string): string {
    return foldName(s.replace(/^#/, '').trim());
}

/**
 * Filter cache tags down to the ones that are safe to move. A tag is
 * excluded when it sits in a span whose text this feature must not touch:
 * a heading line (editing the H1 would re-trigger the rename that invoked
 * us), a link's range, a block comment section, or — heuristically — after
 * an odd number of '%%' on its own line (inline comment; errs toward
 * skipping, never toward moving). Ignore-list entries are also dropped.
 */
export function movableTags(cache: CacheLike, bodyText: string, ignore: string[]): InlineTag[] {
    const tags = cache.tags ?? [];
    if (tags.length === 0) return [];
    const ignoreSet = new Set(ignore.map(normalizeTagName).filter((s) => s.length > 0));
    const headingLines = new Set((cache.headings ?? []).map((h) => h.position.start.line));
    const excludedSpans: TagPos[] = [
        ...(cache.links ?? []).map((l) => l.position),
        ...(cache.sections ?? [])
            .filter((s) => s.type === 'comment')
            .map((s) => s.position),
    ];
    const lines = bodyText.split('\n');
    return tags.filter((t) => {
        if (headingLines.has(t.position.start.line)) return false;
        if (
            excludedSpans.some(
                (s) =>
                    t.position.start.offset >= s.start.offset &&
                    t.position.end.offset <= s.end.offset,
            )
        ) {
            return false;
        }
        const line = lines[t.position.start.line];
        if (typeof line === 'string') {
            const before = line.slice(0, t.position.start.col);
            const pct = (before.match(/%%/g) ?? []).length;
            if (pct % 2 === 1) return false;
        }
        return !ignoreSet.has(normalizeTagName(t.tag));
    });
}

/**
 * Merge inline tag names into an existing frontmatter tags value.
 * `existing` may be a string, an array, a number (YAML parses bare 2025 as a
 * number), or absent. Dedup is via normalizeTagName; the first-seen casing
 * wins; output is always a plain string[] without '#'.
 */
export function mergeTagsIntoList(existing: unknown, incoming: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (raw: string): void => {
        const cleaned = raw.replace(/^#/, '').trim();
        if (!cleaned) return;
        const key = normalizeTagName(cleaned);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(cleaned);
    };
    const existingArr = Array.isArray(existing) ? existing : existing == null ? [] : [existing];
    for (const e of existingArr) {
        if (typeof e === 'string') push(e);
        else if (typeof e === 'number' && Number.isFinite(e)) push(String(e));
    }
    for (const t of incoming) push(t);
    return out;
}

export interface BodyRemovalResult {
    text: string;
    applied: number;
    /** Tags whose cached offsets no longer matched the file (stale cache). */
    skippedStale: number;
}

/**
 * Rewrite the note body for the remove-hash / remove-tag modes.
 *
 * Safety invariants: candidates are processed strictly from the end of the
 * file toward the start (so earlier offsets stay valid after each splice),
 * and every candidate is verified against the CURRENT text before touching
 * it — a mismatch means the cache was stale, so that tag is skipped and
 * counted rather than blindly sliced.
 */
export function applyBodyTagRemoval(
    data: string,
    candidates: InlineTag[],
    mode: BodyTagRemovalMode,
): BodyRemovalResult {
    const sorted = [...candidates].sort(
        (a, b) => b.position.start.offset - a.position.start.offset,
    );
    let text = data;
    let applied = 0;
    let skippedStale = 0;
    for (const c of sorted) {
        const from = c.position.start.offset;
        const to = c.position.end.offset;
        if (text.slice(from, to) !== c.tag) {
            skippedStale++;
            continue;
        }
        if (mode === 'remove-hash') {
            text = text.slice(0, from) + text.slice(from + 1);
        } else {
            // Swallow exactly one preceding space-like character (never a
            // newline — line structure is preserved), matching Linter.
            let cut = from;
            const prev = text.charAt(cut - 1);
            if (prev === ' ' || prev === '\t' || prev === '　') cut--;
            text = text.slice(0, cut) + text.slice(to);
        }
        applied++;
    }
    return { text, applied, skippedStale };
}
