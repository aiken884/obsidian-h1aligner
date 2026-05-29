/**
 * filename.ts — H1 text -> safe Obsidian filename.
 *
 * Phase 1 MVP algorithm (per Aiken Q3 拍板 + PPLX Q4 cross-platform research):
 *
 *   1. NFC normalisation                            (preserve Chinese / emoji)
 *   2. Strip C0/DEL control chars EXCEPT tab/LF/CR  (let those be collapsed)
 *   3. Replace Windows-illegal `\ / : * ? " < > |`  (Q3.2 = true)
 *      with the configured replacement char         (Q3.3 = 空白)
 *   4. trim leading/trailing whitespace             (Q3.1 = true)
 *   5. Collapse repeated whitespace -> single space (covers tab/LF/CR)
 *   6. Strip leading dots & trailing dots/spaces
 *      (Windows refuses both; macOS strips trailing too)
 *   7. Append `_` if Windows reserved name (CON, PRN, AUX, NUL,
 *      COM1-9, LPT1-9 — case-insensitive)
 *   8. Truncate to maxLength code points            (Q3.4 = 150)
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

const WINDOWS_ILLEGAL = /[\\/:*?"<>|]/g;
// Strip C0 control chars + DEL, but KEEP tab (0x09), LF (0x0A), CR (0x0D)
// so they can be collapsed as whitespace in step 5.
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const MULTI_WHITESPACE = /\s+/g;
const LEADING_DOTS = /^\.+/;
const TRAILING_DOT_OR_SPACE = /[.\s]+$/;
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

export function sanitizeFileName(
    text: string,
    opts: SanitizeOpts = DEFAULT_SANITIZE_OPTS,
): string {
    if (typeof text !== 'string') return '';
    let s = text;

    // 1. NFC
    try { s = s.normalize('NFC'); } catch { /* runtime without Intl normalize */ }

    // 2. Strip control chars (except tab/LF/CR — those become spaces in step 5)
    s = s.replace(CONTROL_CHARS, '');

    // 3. Replace Windows-illegal chars
    if (opts.replaceIllegalCharacters) {
        s = s.replace(WINDOWS_ILLEGAL, opts.illegalReplacementChar);
    }

    // 4. trim
    if (opts.trimWhitespace) {
        s = s.trim();
    }

    // 5. Collapse repeated whitespace
    s = s.replace(MULTI_WHITESPACE, ' ');

    // 6. Strip leading dots, trailing dots/spaces
    s = s.replace(LEADING_DOTS, '').replace(TRAILING_DOT_OR_SPACE, '');

    // 7. Windows reserved name guard
    if (WINDOWS_RESERVED.test(s)) {
        s = s + '_';
    }

    // 8. Length cap on code-point boundary
    if (opts.maxLength > 0) {
        const cps = Array.from(s);
        if (cps.length > opts.maxLength) {
            s = cps.slice(0, opts.maxLength).join('');
            if (opts.trimWhitespace) s = s.replace(TRAILING_DOT_OR_SPACE, '');
        }
    }

    return s;
}