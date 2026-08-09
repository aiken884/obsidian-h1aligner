import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
    normalizeTagName,
    mergeTagsIntoList,
    applyBodyTagRemoval,
    type InlineTag,
} from '../src/tag-mover';

/**
 * Property-based invariants for the experimental tag-move core. Example-based
 * tests (tag-mover.test.ts) cover known edge cases; these verify the GLOBAL
 * contracts across arbitrary input, the way filename.property.test.ts does
 * for the sanitiser.
 */
const RUNS = { numRuns: 300 };

// ---------------------------------------------------------------------------
// normalizeTagName
// ---------------------------------------------------------------------------

describe('normalizeTagName invariants (fast-check)', () => {
    const anyText = fc.string({ maxLength: 200 });

    it('is idempotent — normalizing twice equals normalizing once', () => {
        fc.assert(
            fc.property(anyText, (s) => {
                const once = normalizeTagName(s);
                expect(normalizeTagName(once)).toBe(once);
            }),
            RUNS,
        );
    });

    it('never leaves a leading # (documented contract)', () => {
        fc.assert(
            fc.property(anyText, (s) => {
                expect(normalizeTagName(s).startsWith('#')).toBe(false);
            }),
            RUNS,
        );
    });

    it('never throws for any string input', () => {
        fc.assert(
            fc.property(anyText, (s) => {
                expect(typeof normalizeTagName(s)).toBe('string');
            }),
            RUNS,
        );
    });
});

// ---------------------------------------------------------------------------
// mergeTagsIntoList
// ---------------------------------------------------------------------------

// Arbitrary "existing" frontmatter shapes: string, array of mixed junk,
// number, null/undefined — covers every branch of the documented contract
// (string | array | number | absent) plus adversarial junk that must be
// filtered, never thrown on.
const junkArrayItem = fc.oneof(
    fc.string({ maxLength: 20 }),
    fc.double({ noNaN: true }),
    fc.constant(null),
    fc.constant(undefined),
    fc.boolean(),
    fc.array(fc.string({ maxLength: 5 }), { maxLength: 2 }), // nested array — must be filtered
    fc.dictionary(fc.string({ maxLength: 5 }), fc.string({ maxLength: 5 })),
);
const existingValueGen = fc.oneof(
    fc.string({ maxLength: 50 }),
    fc.array(junkArrayItem, { maxLength: 8 }),
    fc.double({ noNaN: true }),
    fc.constant(null),
    fc.constant(undefined),
    junkArrayItem,
);
const incomingGen = fc.array(fc.string({ maxLength: 30 }), { maxLength: 8 });

describe('mergeTagsIntoList invariants (fast-check)', () => {
    it('never throws for any existing shape and any incoming array', () => {
        fc.assert(
            fc.property(existingValueGen, incomingGen, (existing, incoming) => {
                expect(() => mergeTagsIntoList(existing, incoming)).not.toThrow();
            }),
            RUNS,
        );
    });

    it('output has no duplicates under normalizeTagName (case-insensitive dedup)', () => {
        fc.assert(
            fc.property(existingValueGen, incomingGen, (existing, incoming) => {
                const out = mergeTagsIntoList(existing, incoming);
                const keys = out.map(normalizeTagName);
                expect(new Set(keys).size).toBe(keys.length);
            }),
            RUNS,
        );
    });

    it('no output entry starts with # (documented contract)', () => {
        fc.assert(
            fc.property(existingValueGen, incomingGen, (existing, incoming) => {
                const out = mergeTagsIntoList(existing, incoming);
                for (const t of out) expect(t.startsWith('#')).toBe(false);
            }),
            RUNS,
        );
    });

    it('never grows beyond existing+incoming count — can only shrink via dedup', () => {
        fc.assert(
            fc.property(existingValueGen, incomingGen, (existing, incoming) => {
                const out = mergeTagsIntoList(existing, incoming);
                // A scalar string existing value is split on comma/whitespace
                // (legacy frontmatter compat), so it can expand into several
                // entries — mirror that exact split to compute a true upper bound.
                const existingCount = Array.isArray(existing)
                    ? existing.length
                    : typeof existing === 'string'
                        ? existing.split(/[,\s]+/).length
                        : existing == null
                            ? 0
                            : 1;
                expect(out.length).toBeLessThanOrEqual(existingCount + incoming.length);
            }),
            RUNS,
        );
    });

    it('every non-empty existing or incoming tag survives by normalized key — no silent data loss', () => {
        fc.assert(
            fc.property(existingValueGen, incomingGen, (existing, incoming) => {
                const out = mergeTagsIntoList(existing, incoming);
                const outKeys = new Set(out.map(normalizeTagName));
                const existingStrings: string[] = [];
                if (Array.isArray(existing)) {
                    for (const e of existing) if (typeof e === 'string') existingStrings.push(e);
                } else if (typeof existing === 'string') {
                    existingStrings.push(...existing.split(/[,\s]+/));
                }
                for (const t of [...existingStrings, ...incoming]) {
                    const key = normalizeTagName(t);
                    if (key.length === 0) continue; // cleans to empty — legitimately dropped
                    expect(outKeys.has(key)).toBe(true);
                }
            }),
            RUNS,
        );
    });

    it('is idempotent when merging its own output with nothing new', () => {
        fc.assert(
            fc.property(existingValueGen, incomingGen, (existing, incoming) => {
                const out = mergeTagsIntoList(existing, incoming);
                expect(mergeTagsIntoList(out, [])).toEqual(out);
            }),
            RUNS,
        );
    });
});

// ---------------------------------------------------------------------------
// applyBodyTagRemoval
// ---------------------------------------------------------------------------

// Characters usable inside a synthetic tag's body — deliberately excludes any
// character the staleness/boundary guard treats specially, so a tag placed
// via buildBody() below is always genuinely fresh (never accidentally stale).
const TAG_CHARS = [
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-/',
    '中', '文', '標', '籤', '重', '點', '狀', '態', '😀', '🎉',
];
const tagNameGen = fc
    .array(fc.constantFrom(...TAG_CHARS), { minLength: 1, maxLength: 12 })
    .map((chars) => '#' + chars.join(''));

// Separator characters guaranteed to satisfy neither the boundary guard's
// TAG_BODY_CHAR class nor the literal '#' check — keeps synthetic tags
// reliably "fresh" so the well-formed generator's core promise holds.
// Fullwidth/CJK punctuation (。，、！？（）) is deliberately excluded here:
// per Obsidian's real tag-matching rule (extracted from the shipped app
// bundle — see the TAG_BODY_CHAR fix in src/tag-mover.ts), none of it is a
// tag boundary — it's valid tag-body content, same as CJK letters. Only
// ASCII '.', ',', '!', '?' and whitespace are genuine separators.
const SEP_CHARS = [
    ' ', '\t', '\n', '　', '.', ',', '!', '?',
];
const sepGen = fc
    .array(fc.constantFrom(...SEP_CHARS), { minLength: 1, maxLength: 4 })
    .map((chars) => chars.join(''));
const optionalSepGen = fc
    .array(fc.constantFrom(...SEP_CHARS), { minLength: 0, maxLength: 4 })
    .map((chars) => chars.join(''));

interface Built {
    body: string;
    candidates: InlineTag[];
}

/**
 * Deterministically places well-separated, genuinely-present tags in a
 * synthetic body, tracking exact line/col/offset per tag — same contract as
 * the tagAt() helper in tag-mover.test.ts, generalized to N random tags.
 * Because every tag is bordered only by SEP_CHARS (never TAG_BODY_CHAR or
 * '#'), every candidate this produces is guaranteed non-stale.
 */
function buildBody(tagNames: string[], leadSep: string, seps: string[], trailSep: string): Built {
    let body = leadSep;
    const candidates: InlineTag[] = [];
    for (let i = 0; i < tagNames.length; i++) {
        const tag = tagNames[i];
        const startOffset = body.length;
        const before = body.slice(0, startOffset);
        const line = (before.match(/\n/g) ?? []).length;
        const col = startOffset - (before.lastIndexOf('\n') + 1);
        body += tag;
        candidates.push({
            tag,
            position: {
                start: { line, col, offset: startOffset },
                end: { line, col: col + tag.length, offset: startOffset + tag.length },
            },
        });
        body += i < tagNames.length - 1 ? seps[i] : trailSep;
    }
    return { body, candidates };
}

const wellFormedGen = fc
    .array(tagNameGen, { minLength: 0, maxLength: 6 })
    .chain((tagNames) =>
        fc.record({
            tagNames: fc.constant(tagNames),
            leadSep: optionalSepGen,
            seps: fc.array(sepGen, { minLength: tagNames.length, maxLength: tagNames.length }),
            trailSep: optionalSepGen,
        }),
    )
    .map(({ tagNames, leadSep, seps, trailSep }) => buildBody(tagNames, leadSep, seps, trailSep));

const modeGen = fc.constantFrom<'remove-hash' | 'remove-tag'>('remove-hash', 'remove-tag');

describe('applyBodyTagRemoval invariants (fast-check)', () => {
    it('never throws for arbitrary body/candidates/mode — including malformed offsets', () => {
        fc.assert(
            fc.property(
                fc.string({ maxLength: 300 }),
                fc.array(
                    fc.record({
                        tag: fc.string({ minLength: 1, maxLength: 20 }),
                        position: fc.record({
                            start: fc.record({
                                line: fc.integer({ min: -5, max: 20 }),
                                col: fc.integer({ min: -5, max: 50 }),
                                offset: fc.integer({ min: -50, max: 400 }),
                            }),
                            end: fc.record({
                                line: fc.integer({ min: -5, max: 20 }),
                                col: fc.integer({ min: -5, max: 50 }),
                                offset: fc.integer({ min: -50, max: 400 }),
                            }),
                        }),
                    }),
                    { maxLength: 8 },
                ),
                modeGen,
                (body, candidates, mode) => {
                    expect(() => applyBodyTagRemoval(body, candidates, mode)).not.toThrow();
                },
            ),
            RUNS,
        );
    });

    it('accounts for every candidate exactly once: applied + skippedStale === length', () => {
        fc.assert(
            fc.property(wellFormedGen, modeGen, ({ body, candidates }, mode) => {
                const res = applyBodyTagRemoval(body, candidates, mode);
                expect(res.applied + res.skippedStale).toBe(candidates.length);
            }),
            RUNS,
        );
    });

    it('well-formed, well-separated tags are always applied, never flagged stale', () => {
        fc.assert(
            fc.property(wellFormedGen, modeGen, ({ body, candidates }, mode) => {
                const res = applyBodyTagRemoval(body, candidates, mode);
                expect(res.applied).toBe(candidates.length);
                expect(res.skippedStale).toBe(0);
            }),
            RUNS,
        );
    });

    it('output never grows: text.length <= data.length', () => {
        fc.assert(
            fc.property(wellFormedGen, modeGen, ({ body, candidates }, mode) => {
                const res = applyBodyTagRemoval(body, candidates, mode);
                expect(res.text.length).toBeLessThanOrEqual(body.length);
            }),
            RUNS,
        );
    });

    it('remove-hash removes exactly one character per applied candidate', () => {
        fc.assert(
            fc.property(wellFormedGen, ({ body, candidates }) => {
                const res = applyBodyTagRemoval(body, candidates, 'remove-hash');
                expect(body.length - res.text.length).toBe(res.applied);
            }),
            RUNS,
        );
    });

    it('remove-tag removes each full tag, plus at most one leading space per candidate', () => {
        fc.assert(
            fc.property(wellFormedGen, ({ body, candidates }) => {
                const res = applyBodyTagRemoval(body, candidates, 'remove-tag');
                const totalTagChars = candidates.reduce((n, c) => n + c.tag.length, 0);
                const removed = body.length - res.text.length;
                expect(removed).toBeGreaterThanOrEqual(totalTagChars);
                expect(removed).toBeLessThanOrEqual(totalTagChars + res.applied);
            }),
            RUNS,
        );
    });

    it('re-running on the already-modified text with the same candidates removes nothing more', () => {
        fc.assert(
            fc.property(wellFormedGen, modeGen, ({ body, candidates }, mode) => {
                const first = applyBodyTagRemoval(body, candidates, mode);
                if (first.applied === 0) return; // nothing shifted — offsets are still valid, not under test
                const second = applyBodyTagRemoval(first.text, candidates, mode);
                expect(second.applied).toBe(0);
            }),
            RUNS,
        );
    });

    it('candidate order does not affect the result — internal sort handles any input order', () => {
        fc.assert(
            fc.property(wellFormedGen, modeGen, ({ body, candidates }, mode) => {
                const forward = applyBodyTagRemoval(body, candidates, mode);
                const reversed = applyBodyTagRemoval(body, [...candidates].reverse(), mode);
                expect(reversed).toEqual(forward);
            }),
            RUNS,
        );
    });
});
