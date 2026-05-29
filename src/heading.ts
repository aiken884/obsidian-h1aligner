/**
 * heading.ts — First-H1 extraction.
 *
 * Phase 1 MVP behaviour (per Aiken Q1 拍板 A1):
 *   - Strategy A (preferred): Read `headings[0]` from `MetadataCache`. This is
 *     free and transparently covers Setext-style H1 (`===` underline) because
 *     Obsidian normalises them in the cache.
 *   - Strategy B (fallback): Linear scan of the raw markdown when the cache is
 *     not yet populated. ATX `# ` only — Setext NOT parsed manually
 *     (per Q1 — Setext only when cache provides it for free).
 *
 * Skeleton: returns `{ h1: null, source: 'none' }` until E2 lands the
 * full implementation.
 */
export type HeadingSource = 'cache' | 'scan' | 'none';

export interface HeadingExtractionResult {
    h1: string | null;
    source: HeadingSource;
}

export function extractFirstH1(
    _cache?: unknown,
    _content?: string,
): HeadingExtractionResult {
    // E2 implementation lands here.
    return { h1: null, source: 'none' };
}