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
 * frontmatter dedup so the two can never disagree: trim, strip all leading
 * '#'s, trim again, then fold. Trim must come first — a leading space would
 * otherwise defeat the '#' strip and leak '#' into comparisons; stripping
 * ALL leading '#'s (not just one) matters for malformed input like a
 * hand-typed "##tag" in frontmatter — a single strip would leave one behind.
 * Nested tags keep their '/' and compare by full name.
 */
export function normalizeTagName(s: string): string {
    return foldName(s.trim().replace(/^#+/, '').trim());
}

/**
 * Filter cache tags down to the ones that are safe to move. A tag is
 * excluded when it sits in a span whose text this feature must not touch:
 * a heading line (editing the H1 would re-trigger the rename that invoked
 * us), a link's range, a block comment section, or — heuristically — after
 * an odd number of '%%' on its own line (inline comment; errs toward
 * skipping, never toward moving). Ignore-list entries are also dropped.
 */
// Matches inline markdown link syntax '[label](target)' on a single line.
// cache.links only carries links Obsidian resolves within the vault — an
// external URL link never appears there (confirmed against a live vault:
// '[#tag](https://example.com)' produces a tag in cache.tags but no entry
// in cache.links at all) — so link-text exclusion cannot rely on cache.links
// alone. This regex only has to find bracket *spans* to exclude, not tags,
// so it doesn't reintroduce the self-rolled-tag-regex risk this module
// otherwise avoids.
const MD_INLINE_LINK = /\[[^\]\n]*\]\([^)\n]*\)/g;

export function movableTags(cache: CacheLike, bodyText: string, ignore: string[]): InlineTag[] {
    const tags = cache.tags ?? [];
    if (tags.length === 0) return [];
    const ignoreSet = new Set(ignore.map(normalizeTagName).filter((s) => s.length > 0));
    const headingLines = new Set((cache.headings ?? []).map((h) => h.position.start.line));
    const excludedSpans: Array<{ start: number; end: number }> = [
        ...(cache.links ?? []).map((l) => ({
            start: l.position.start.offset,
            end: l.position.end.offset,
        })),
        ...(cache.sections ?? [])
            .filter((s) => s.type === 'comment')
            .map((s) => ({ start: s.position.start.offset, end: s.position.end.offset })),
        ...[...bodyText.matchAll(MD_INLINE_LINK)].map((m) => ({
            start: m.index,
            end: m.index + m[0].length,
        })),
    ];
    const lines = bodyText.split('\n');
    return tags.filter((t) => {
        if (headingLines.has(t.position.start.line)) return false;
        if (
            excludedSpans.some(
                (s) => t.position.start.offset >= s.start && t.position.end.offset <= s.end,
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
        const cleaned = raw.trim().replace(/^#+/, '').trim();
        if (!cleaned) return;
        const key = normalizeTagName(cleaned);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(cleaned);
    };
    // A scalar string is the legacy comma/space-separated form ("a, b") that
    // Obsidian's parseFrontMatterTags splits into multiple tags — splitting
    // here preserves that meaning instead of collapsing it into one bad tag.
    const existingArr = Array.isArray(existing)
        ? existing
        : typeof existing === 'string'
            ? existing.split(/[,\s]+/)
            : existing == null
                ? []
                : [existing];
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
    // Conservative tag-body characters: ASCII alnum/_/- / plus CJK letter
    // ranges (Han ideographs incl. Ext-A, Hiragana, Katakana, Hangul
    // syllables). A fresh-cache tag can never be bordered by one of these
    // (the parser would have absorbed it into the tag), so rejecting them
    // only ever catches stale offsets — e.g. a candidate that now points
    // into a URL, '#tag' extended to '#tagX', or (this feature's own CJK
    // tag support, see movableTags' doc comment and README's "Experimental"
    // section) '#tag' extended to '#tag中文'. CJK support here is not
    // optional: this module treats CJK as first-class tag content
    // (mergeTagsIntoList/applyBodyTagRemoval both round-trip tags like
    // '#重點' verbatim), so a guard that only recognizes ASCII extensions
    // would silently accept a CJK-extended candidate as still fresh.
    // Deliberately EXCLUDES CJK punctuation (e.g. '。', '，', fullwidth
    // marks) — README documents those as tolerated "pollution" inside an
    // already-matched tag, never as boundary-extending characters, so a
    // punctuation mark right after a cached offset must still correctly
    // signal "not extended, safe to act on".
    const TAG_BODY_CHAR =
        /[0-9A-Za-z_/\-぀-ヿ㐀-䶿一-鿿가-힣]/;
    for (const c of sorted) {
        const from = c.position.start.offset;
        const to = c.position.end.offset;
        const prev = from > 0 ? text.charAt(from - 1) : '';
        const next = to < text.length ? text.charAt(to) : '';
        if (
            text.slice(from, to) !== c.tag ||
            prev === '#' ||
            TAG_BODY_CHAR.test(prev) ||
            TAG_BODY_CHAR.test(next)
        ) {
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
