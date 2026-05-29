/**
 * filename.ts — H1 text → safe Obsidian filename.
 *
 * Phase 1 MVP algorithm (per Aiken Q3 拍板 + PPLX Q4 cross-platform research):
 *   1. trim leading/trailing whitespace             (Q3.1 = true)
 *   2. Unicode NFC normalisation                    (research)
 *   3. Replace Windows-illegal `\ / : * ? " < > |` with 空白 (Q3.2 = true, Q3.3 = 空白)
 *   4. Collapse repeated whitespace to single space (sanity)
 *   5. Strip leading dots and trailing dots/spaces  (Windows + macOS)
 *   6. Append `_` if Windows reserved name (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
 *   7. Truncate to 150 chars on grapheme boundary    (Q3.4 = 150)
 *   8. Preserve Unicode (Chinese / emoji)            (research)
 *
 * Skeleton: identity function — E2 lands the algorithm.
 */
export interface SanitizeOpts {
    trimWhitespace: boolean;
    replaceIllegalCharacters: boolean;
    illegalReplacementChar: string;
    maxLength: number;
}

export const DEFAULT_SANITIZE_OPTS: SanitizeOpts = {
    trimWhitespace: true,
    replaceIllegalCharacters: true,
    illegalReplacementChar: ' ',
    maxLength: 150,
};

export function sanitizeFileName(text: string, _opts: SanitizeOpts = DEFAULT_SANITIZE_OPTS): string {
    // E2 implementation lands here.
    return text;
}