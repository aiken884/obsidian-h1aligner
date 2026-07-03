/**
 * filename.ts — H1 text -> safe cross-platform Obsidian filename.
 *
 * Algorithm (per Aiken Q3 拍板 + PPLX Q4 cross-platform research):
 *
 *   1. NFC normalisation                            (preserve Chinese / emoji)
 *   2. Strip C0/DEL control chars EXCEPT tab/LF/CR  (let those be collapsed)
 *   3. Replace illegal chars `\ / : * ? " < > |` (Windows) plus `# ^ [ ]`
 *      (break Obsidian links) with the configured replacement char.
 *      The replacement char itself is cleaned first (never illegal, max one
 *      code point) and applied via the function form of String.replace so
 *      `$&`-style templates are never expanded.
 *   4. trim leading/trailing whitespace             (Q3.1 = true)
 *   5. Collapse repeated whitespace -> single space (covers tab/LF/CR)
 *   6. Strip leading dots & trailing dots/spaces
 *      (Windows refuses both; macOS strips trailing too)
 *   7. Append `_` to a Windows reserved-name stem (CON, PRN, AUX, NUL,
 *      COM1-9, LPT1-9 — case-insensitive, also when followed by a dot,
 *      e.g. `AUX.notes` -> `AUX_.notes`)
 *   8. Truncate to maxLength code points            (Q3.4 = 150)
 *   9. Truncate to maxBytes UTF-8 bytes (default 251 so base + '.md' fits the
 *      255-byte NAME_MAX shared by APFS, ext4/f2fs and NTFS; 0 disables)
 *  10. Re-guard the reserved-name stem in case truncation recreated one
 */
export interface SanitizeOpts {
    trimWhitespace: boolean;
    replaceIllegalCharacters: boolean;
    illegalReplacementChar: string;
    maxLength: number;
    /**
     * Max UTF-8 bytes for the base name; 0 disables the byte cap.
     * Default 251 leaves room for a '.md' extension within 255 bytes.
     */
    maxBytes?: number;
}

export const DEFAULT_SANITIZE_OPTS: SanitizeOpts = {
    trimWhitespace: true,
    replaceIllegalCharacters: true,
    illegalReplacementChar: ' ',
    maxLength: 150,
    maxBytes: 251,
};

// Windows-illegal `\ / : * ? " < > |` + Obsidian link-breaking `# ^ [ ]`.
const ILLEGAL_CHARS = /[\\/:*?"<>|#^[\]]/g;
// Separators alone — replaced unconditionally (they would change the path).
const PATH_SEPARATORS = /[\\/]/g;
// Strip C0 control chars + DEL, but KEEP tab (0x09), LF (0x0A), CR (0x0D)
// so they can be collapsed as whitespace in step 5.
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const MULTI_WHITESPACE = /\s+/g;
const LEADING_DOTS = /^\.+/;
const TRAILING_DOT_OR_SPACE = /[.\s]+$/;
// Reserved stem: the whole name, or the part before the first dot.
const WINDOWS_RESERVED_STEM = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?=\.|$)/i;

/**
 * Make a user-supplied replacement character safe to use:
 * never an illegal/control char, at most one code point.
 * Non-string input falls back to a space; a fully-cleaned-away
 * input becomes '' (i.e. illegal chars are deleted).
 */
export function cleanReplacementChar(raw: unknown): string {
    if (typeof raw !== 'string') return ' ';
    const cleaned = raw.replace(ILLEGAL_CHARS, '').replace(CONTROL_CHARS, '');
    const first = Array.from(cleaned)[0];
    return first ?? '';
}

function guardReservedStem(s: string): string {
    return s.replace(WINDOWS_RESERVED_STEM, (m) => m + '_');
}

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

    // 3. Replace illegal chars (function form: no $-template expansion).
    //    Path separators are structural — no filesystem accepts them in a
    //    file name — so they are replaced even when the toggle is off.
    const repl = cleanReplacementChar(opts.illegalReplacementChar);
    if (opts.replaceIllegalCharacters) {
        s = s.replace(ILLEGAL_CHARS, () => repl);
    } else {
        s = s.replace(PATH_SEPARATORS, () => repl);
    }

    // 4. trim
    if (opts.trimWhitespace) {
        s = s.trim();
    }

    // 5. Collapse repeated whitespace
    s = s.replace(MULTI_WHITESPACE, ' ');

    // 6. Strip leading dots (re-trimming whitespace they may have hidden)
    //    and trailing dots/spaces
    let prev;
    do {
        prev = s;
        s = s.replace(LEADING_DOTS, '');
        if (opts.trimWhitespace) s = s.replace(/^\s+/, '');
    } while (s !== prev);
    s = s.replace(TRAILING_DOT_OR_SPACE, '');

    // 7. Windows reserved name guard (stem-aware: AUX and AUX.notes)
    s = guardReservedStem(s);

    // 8. Length cap on code-point boundary
    if (opts.maxLength > 0) {
        const cps = Array.from(s);
        if (cps.length > opts.maxLength) {
            s = cps.slice(0, opts.maxLength).join('');
            // Trailing dots/spaces are invalid on Windows regardless of the
            // trimWhitespace setting — same unconditional rule as step 6.
            s = s.replace(TRAILING_DOT_OR_SPACE, '');
        }
    }

    // 9. Byte cap on code-point boundary (255-byte NAME_MAX on APFS/ext4/NTFS)
    const maxBytes = opts.maxBytes ?? 251;
    if (maxBytes > 0) {
        const enc = new TextEncoder();
        if (enc.encode(s).length > maxBytes) {
            const cps = Array.from(s);
            while (cps.length > 0 && enc.encode(cps.join('')).length > maxBytes) {
                cps.pop();
            }
            s = cps.join('');
            s = s.replace(TRAILING_DOT_OR_SPACE, '');
        }
    }

    // 10. Truncation may have recreated a reserved stem (e.g. 'AUXy' -> 'AUX').
    //     Appending '_' must not bust the caps — drop a code point instead
    //     (the shortened stem is no longer reserved: 'AUX' -> 'AU').
    if (WINDOWS_RESERVED_STEM.test(s)) {
        const enc = new TextEncoder();
        const overLength = opts.maxLength > 0 && Array.from(s).length + 1 > opts.maxLength;
        const overBytes = maxBytes > 0 && enc.encode(s + '_').length > maxBytes;
        if (overLength || overBytes) {
            s = Array.from(s).slice(0, -1).join('');
        }
        s = guardReservedStem(s);
    }

    return s;
}
