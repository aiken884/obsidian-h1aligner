import type { CachedMetadata } from 'obsidian';

/**
 * heading.ts — First-H1 extraction.
 *
 * Phase 1 MVP behaviour (per Aiken Q1 拍板 A1):
 *   - Strategy A (preferred): Read first H1 from `MetadataCache.headings`.
 *     This is free and transparently covers Setext-style H1 because Obsidian's
 *     parser normalises both ATX and Setext into the cache.
 *   - Strategy B (fallback): Linear scan of raw markdown when the cache is not
 *     yet populated. ATX `# ` ONLY — Setext NOT parsed manually (per Q1).
 *
 * Both strategies trim leading/trailing whitespace from the extracted text.
 * Empty post-trim → returns `null` (source 'none').
 */
export type HeadingSource = 'cache' | 'scan' | 'none';

export interface HeadingExtractionResult {
    h1: string | null;
    source: HeadingSource;
}

const FRONTMATTER_FENCE = /^---\s*$/;
const FRONTMATTER_END = /^(---|\.\.\.)\s*$/;
const CODE_FENCE = /^(```|~~~)/;
// ATX H1: 0-3 leading spaces, `#` NOT followed by another `#`, then whitespace,
// then heading text. Optional trailing whitespace + closing `#` sequence.
const ATX_H1 = /^ {0,3}#(?!#)\s+(.+?)\s*#*\s*$/;

export function extractFirstH1(
    cache: CachedMetadata | null | undefined,
    content?: string,
): HeadingExtractionResult {
    // Strategy A — MetadataCache (covers ATX + Setext for free)
    if (cache && cache.headings && cache.headings.length > 0) {
        for (const h of cache.headings) {
            if (h.level === 1 && typeof h.heading === 'string') {
                const text = h.heading.trim();
                if (text) {
                    return { h1: text, source: 'cache' };
                }
                // Found H1 but empty after trim — fall through to scan.
                break;
            }
        }
    }

    // Strategy B — linear scan (ATX only, per Q1)
    if (typeof content === 'string' && content.length > 0) {
        const lines = content.split(/\r?\n/);
        let inCodeFence = false;
        let inFrontmatter = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // YAML frontmatter (only at the very top)
            if (i === 0 && FRONTMATTER_FENCE.test(line)) {
                inFrontmatter = true;
                continue;
            }
            if (inFrontmatter) {
                if (FRONTMATTER_END.test(line)) {
                    inFrontmatter = false;
                }
                continue;
            }

            // Fenced code blocks (``` or ~~~)
            if (CODE_FENCE.test(line)) {
                inCodeFence = !inCodeFence;
                continue;
            }
            if (inCodeFence) continue;

            const m = line.match(ATX_H1);
            if (m) {
                const text = m[1].trim();
                if (text) {
                    return { h1: text, source: 'scan' };
                }
                // Empty H1 — keep scanning (might find a non-empty later).
            }
        }
    }

    return { h1: null, source: 'none' };
}