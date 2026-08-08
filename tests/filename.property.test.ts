import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sanitizeFileName, DEFAULT_SANITIZE_OPTS } from '../src/filename';

/**
 * Property-based invariants for the 11-step sanitisation algorithm.
 * Example-based tests cover known edge cases; these verify the GLOBAL
 * contracts that the rename service depends on for every possible input.
 */
const ILLEGAL = /[\\/:*?"<>|#^[\]]/;
// C0 (+ DEL) and C1 control blocks. `anyText` below uses fast-check's
// 'binary' unit, which samples code units across 0x00-0xFF — including the
// C1 range 0x80-0x9F — so this invariant would have caught Bug B (C1
// control chars surviving stripControlChars) if it had checked for it.
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/;
const RESERVED_STEM = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
const utf8len = (s: string) => new TextEncoder().encode(s).length;

const anyText = fc.string({ maxLength: 400, unit: 'binary' });
const RUNS = { numRuns: 500 };
// Combining marks used to regression-test Bug A (NFC idempotency): each can
// canonically compose with an arbitrary preceding base character, which is
// exactly the case the fix's re-normalize-after-replacement step must catch.
const COMBINING_CHARS = ['\u0301', '\u030a', '\u0308', '\u0300'] as const; // acute, ring above, diaeresis, grave
// Latin base letters known to have a canonical NFC composition with each of
// the COMBINING_CHARS above (e.g. 'a' + U+030A -> '\u00e5'). Random `anyText`
// bytes rarely land on one of these specific letters immediately before an
// illegal char, so a pure fuzz test over `anyText` alone almost never
// exercises the composable case fast-check would need to catch Bug A. These
// two tests instead splice a guaranteed base+illegal pair into fuzzed
// prefix/suffix text so the composable adjacency is always present.
const COMPOSABLE_BASES = ['a', 'e', 'i', 'o', 'u', 'n', 'c', 'y'] as const;
const ILLEGAL_SAMPLE = ['\\', '/', ':', '*', '?', '"', '<', '>', '|', '#', '^', '[', ']'] as const;

describe('sanitizeFileName invariants (fast-check)', () => {
    it('never emits illegal or control characters (default opts)', () => {
        fc.assert(
            fc.property(anyText, (s) => {
                const out = sanitizeFileName(s);
                expect(out).not.toMatch(ILLEGAL);
                expect(out).not.toMatch(CONTROL);
            }),
            RUNS,
        );
    });

    it('always fits the byte budget: utf8(out) <= maxBytes when maxBytes > 0', () => {
        fc.assert(
            fc.property(anyText, fc.integer({ min: 1, max: 300 }), (s, maxBytes) => {
                const out = sanitizeFileName(s, { ...DEFAULT_SANITIZE_OPTS, maxBytes });
                expect(utf8len(out)).toBeLessThanOrEqual(maxBytes);
            }),
            RUNS,
        );
    });

    it('always fits the code-point cap: cps(out) <= maxLength when maxLength > 0', () => {
        fc.assert(
            fc.property(anyText, fc.integer({ min: 1, max: 200 }), (s, maxLength) => {
                const out = sanitizeFileName(s, { ...DEFAULT_SANITIZE_OPTS, maxLength });
                expect(Array.from(out).length).toBeLessThanOrEqual(maxLength);
            }),
            RUNS,
        );
    });

    it('never starts with a dot and never ends with a dot or space', () => {
        fc.assert(
            fc.property(anyText, (s) => {
                const out = sanitizeFileName(s);
                if (out.length > 0) {
                    expect(out[0]).not.toBe('.');
                    expect(/[.\s]$/.test(out)).toBe(false);
                }
            }),
            RUNS,
        );
    });

    it('never emits a Windows reserved-name stem', () => {
        fc.assert(
            fc.property(anyText, (s) => {
                const out = sanitizeFileName(s);
                expect(RESERVED_STEM.test(out)).toBe(false);
            }),
            RUNS,
        );
    });

    it('is idempotent: sanitize(sanitize(x)) === sanitize(x) (default opts)', () => {
        fc.assert(
            fc.property(anyText, (s) => {
                const once = sanitizeFileName(s);
                expect(sanitizeFileName(once)).toBe(once);
            }),
            RUNS,
        );
    });

    it('never splits a surrogate pair (output is valid UTF-16)', () => {
        fc.assert(
            fc.property(anyText, (s) => {
                const out = sanitizeFileName(s);
                // A lone surrogate round-trips through UTF-8 as U+FFFD.
                expect(new TextDecoder().decode(new TextEncoder().encode(out))).toBe(out);
            }),
            RUNS,
        );
    });

    it('output is always NFC-normalised (default opts)', () => {
        fc.assert(
            fc.property(anyText, (s) => {
                const out = sanitizeFileName(s);
                expect(out).toBe(out.normalize('NFC'));
            }),
            RUNS,
        );
    });

    // Bug A regression: a combining illegalReplacementChar (e.g. a combining
    // ring/acute) spliced in during illegal-char replacement can canonically
    // compose with the base character right before it. Step 1's NFC pass
    // runs before that splice, so without a second normalize pass afterward,
    // the first call's output is left un-composed while a second call's
    // isn't — i.e. sanitize(sanitize(x)) !== sanitize(x). These two
    // invariants — NFC output and idempotency — must hold for ANY combining
    // replacement char, not just the space default covered above.
    it('output is always NFC-normalised, even with a combining illegalReplacementChar', () => {
        fc.assert(
            fc.property(anyText, fc.constantFrom(...COMBINING_CHARS), (s, combining) => {
                const opts = { ...DEFAULT_SANITIZE_OPTS, illegalReplacementChar: combining };
                const out = sanitizeFileName(s, opts);
                expect(out).toBe(out.normalize('NFC'));
            }),
            RUNS,
        );
    });

    it('is idempotent even with a combining illegalReplacementChar', () => {
        fc.assert(
            fc.property(anyText, fc.constantFrom(...COMBINING_CHARS), (s, combining) => {
                const opts = { ...DEFAULT_SANITIZE_OPTS, illegalReplacementChar: combining };
                const once = sanitizeFileName(s, opts);
                const twice = sanitizeFileName(once, opts);
                expect(twice).toBe(once);
            }),
            RUNS,
        );
    });

    // Same two invariants, but with a guaranteed composable base+illegal
    // adjacency spliced into fuzzed surrounding text (see COMPOSABLE_BASES
    // comment above) so the composition case is reliably exercised on every
    // run, not left to chance the way the two tests above are.
    it('output is always NFC-normalised for a guaranteed composable base+illegal pair', () => {
        fc.assert(
            fc.property(
                anyText,
                anyText,
                fc.constantFrom(...COMPOSABLE_BASES),
                fc.constantFrom(...ILLEGAL_SAMPLE),
                fc.constantFrom(...COMBINING_CHARS),
                (prefix, suffix, base, illegal, combining) => {
                    const opts = { ...DEFAULT_SANITIZE_OPTS, illegalReplacementChar: combining };
                    const s = `${prefix}${base}${illegal}${suffix}`;
                    const out = sanitizeFileName(s, opts);
                    expect(out).toBe(out.normalize('NFC'));
                },
            ),
            RUNS,
        );
    });

    it('is idempotent for a guaranteed composable base+illegal pair', () => {
        fc.assert(
            fc.property(
                anyText,
                anyText,
                fc.constantFrom(...COMPOSABLE_BASES),
                fc.constantFrom(...ILLEGAL_SAMPLE),
                fc.constantFrom(...COMBINING_CHARS),
                (prefix, suffix, base, illegal, combining) => {
                    const opts = { ...DEFAULT_SANITIZE_OPTS, illegalReplacementChar: combining };
                    const s = `${prefix}${base}${illegal}${suffix}`;
                    const once = sanitizeFileName(s, opts);
                    const twice = sanitizeFileName(once, opts);
                    expect(twice).toBe(once);
                },
            ),
            RUNS,
        );
    });
});
