import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { sanitizeFileName, DEFAULT_SANITIZE_OPTS } from '../src/filename';

/**
 * Property-based invariants for the 10-step sanitisation algorithm.
 * Example-based tests cover known edge cases; these verify the GLOBAL
 * contracts that the rename service depends on for every possible input.
 */
const ILLEGAL = /[\\/:*?"<>|#^[\]]/;
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const RESERVED_STEM = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
const utf8len = (s: string) => new TextEncoder().encode(s).length;

const anyText = fc.string({ maxLength: 400, unit: 'binary' });
const RUNS = { numRuns: 500 };

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
});
