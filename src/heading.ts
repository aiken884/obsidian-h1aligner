import type { CachedMetadata } from 'obsidian';

/**
 * heading.ts — First-H1 extraction.
 *
 * Behaviour (per Aiken Q1 拍板 A1):
 *   - Strategy A (preferred): first *usable* (non-empty after trim) level-1
 *     heading from `MetadataCache.headings`. Covers Setext H1 for free because
 *     Obsidian's parser normalises both ATX and Setext into the cache.
 *     Empty-after-trim H1s are skipped, matching Strategy B's keep-scanning rule.
 *   - Strategy B (fallback): linear scan of raw markdown when the cache has no
 *     usable H1. ATX `# ` ONLY — Setext NOT parsed manually (per Q1).
 *
 * Scan conformance notes (CommonMark):
 *   - A leading UTF-8 BOM is stripped before scanning (Windows tool exports).
 *   - Code fences may be indented 0-3 spaces; a fence closes only on a line of
 *     the same fence character, at least as long as the opener, with nothing
 *     but whitespace after it. Backtick openers whose info string contains a
 *     backtick are not fences.
 *   - An ATX closing sequence must be separated from the text by a space/tab,
 *     so `# C#` yields `C#`, while `# Title ###` yields `Title`.
 */
export type HeadingSource = 'cache' | 'scan' | 'none';

export interface HeadingExtractionResult {
    h1: string | null;
    source: HeadingSource;
}

const FRONTMATTER_FENCE = /^---\s*$/;
// Obsidian's frontmatter dialect closes ONLY on '---' (not YAML's '...').
const FRONTMATTER_END = /^---\s*$/;
// Opening/closing code fence: 0-3 leading spaces, run of ≥3 backticks or
// tildes, then the (possibly empty) info string.
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
// ATX H1: 0-3 leading spaces, `#` NOT followed by another `#`, whitespace,
// heading text, then an OPTIONAL closing `#` run that must be preceded by
// whitespace (CommonMark), then trailing whitespace.
const ATX_H1 = /^ {0,3}#(?!#)[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
// A line that is only `#` + closing sequence (`# #`, `# ##`) is an EMPTY
// heading per CommonMark — treated like `#` alone: keep scanning.
const ATX_H1_EMPTY = /^ {0,3}#(?!#)([ \t]+#+)?[ \t]*$/;

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
                // Empty after trim — keep looking at later cached H1s,
                // mirroring Strategy B's keep-scanning behaviour.
            }
        }
    }

    // Strategy B — linear scan (ATX only, per Q1)
    if (typeof content === 'string' && content.length > 0) {
        const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
        const lines = text.split(/\r?\n/);
        let fence: { char: string; len: number } | null = null;
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

            // Fenced code blocks
            const f = line.match(FENCE_LINE);
            if (fence) {
                const closes =
                    f !== null &&
                    f[1][0] === fence.char &&
                    f[1].length >= fence.len &&
                    f[2].trim() === '';
                if (closes) fence = null;
                continue;
            }
            if (f) {
                // Backtick openers may not contain a backtick in the info string.
                if (!(f[1][0] === '`' && f[2].includes('`'))) {
                    fence = { char: f[1][0], len: f[1].length };
                    continue;
                }
            }

            if (ATX_H1_EMPTY.test(line)) {
                // Empty H1 (`#`, `# #`, `# ##`) — keep scanning.
                continue;
            }
            const m = line.match(ATX_H1);
            if (m) {
                const t = m[1].trim();
                if (t) {
                    return { h1: t, source: 'scan' };
                }
                // Empty H1 — keep scanning (might find a non-empty later).
            }
        }
    }

    return { h1: null, source: 'none' };
}
