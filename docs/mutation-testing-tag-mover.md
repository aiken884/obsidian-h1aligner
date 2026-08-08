# Mutation testing notes — src/tag-mover.ts

Date: 2026-08-08

## Results

Stryker (`npm run test:mutation`) reports **94.65%** for `src/tag-mover.ts`
(177/187 killed, 10 survived). After manually applying each "survived" mutant
directly to the source code one by one and running `tag-mover.test.ts` +
`tag-mover.property.test.ts` + `tag-move-integration.test.ts` to verify, the
**ground truth** is: of the 187 mutants, **8 are genuinely semantically
equivalent and cannot be killed by any test**; the remaining **179 are all
killed by the tests** (including 2 that Stryker itself misreported as
survived — the span-containment predicate in `movableTags` being a tautology,
and the finite-number-check predicate in `mergeTagsIntoList` being a
tautology; after manually applying the mutation directly, the tests do in
fact fail, proving the tests are effective — it's just that Stryker's
`perTest` coverage analysis produces false negatives when property tests with
fast-check random seeds are involved, since the coverage snapshot varies from
run to run). The true achievable ceiling = 179/187 ≈ **95.72%**, and the test
suite has already reached this ceiling.

## 8 Equivalent Mutants (Unkillable, Confirmed by Manual Source Verification)

Not using mutant IDs (not guaranteed to be stable across runs); described by
code location instead:

1. The `if (tags.length === 0) return [];` at the start of `movableTags` —
   removing this line changes nothing, since `[].filter(...)` already
   returns `[]`; the behavior is identical.
2. The fallback array content of `?? []` in `(cache.sections ?? [])` — this
   is immediately followed by `.filter(s => s.type === 'comment')`, so any
   fallback content of the wrong shape gets filtered out by this filter
   anyway; it makes no difference what array content is substituted.
3. `prev = from > 0 ? text.charAt(from - 1) : ''` in `applyBodyTagRemoval` —
   JavaScript's `String.charAt()` already safely returns `''` for any
   out-of-range index (including negative ones), so this ternary is
   mathematically redundant (kept for readability, not for necessary logic).
   The same applies to `next = to < text.length ? text.charAt(to) : ''`.
   This pair produces 4 mutants in total (one each for `>`/`>=` and
   `<`/`<=`).
4. Removing the `+` quantifier from `existing.split(/[,\s]+/)` in
   `mergeTagsIntoList` — the empty strings produced by the split get
   filtered out by the `if (!cleaned) return` inside `push()`, so the final
   set of non-empty tokens is unchanged.
5. The condition `existing == null ? [] : [existing]` in
   `mergeTagsIntoList` always evaluates to `false` (always takes the
   `[existing]` branch) — when `existing` is genuinely null/undefined,
   `[existing]` becomes `[null]`, but the type guard in the subsequent loop
   (which only accepts strings or finite numbers) safely skips it, leaving
   the final output unchanged.

## Appeared Once, Subsequently Confirmed as a Genuine Bug and Fixed

If the `^` anchor is removed from the regex used inside `normalizeTagName`
and `mergeTagsIntoList` to strip the leading `#` (`/^#+/` → `/#+/`), it will
incorrectly delete a `#` in the "middle" of a string (e.g. `'a#b'` gets
wrongly turned into `'ab'`). This mutant appeared in one Stryker run; manual
verification confirmed it was a genuine bug (all 80 existing tests passed,
and none of them caught it). A regression test has since been added: both
`normalizeTagName('a#b')` and `mergeTagsIntoList(['a#b'], [])` must leave the
`#` untouched.

## Notes for Re-running

- `.stryker-tmp/` must be kept empty (`ignorePatterns` already excludes the
  `.codegraph` directory, which contains a socket file; Stryker cannot copy a
  socket when building its sandbox, and would crash outright otherwise).
- If a given run reports more survived mutants than this record, **manually
  apply that mutant to the source code first and run the tests to confirm
  whether it is truly uncaught** — do not trust Stryker's coverage analysis
  outright, since it has been confirmed to produce false negatives
  (misreporting mutants as survived when the tests are in fact effective) in
  property test scenarios (fast-check random seeds).
- The `break` threshold in `stryker.conf.json` is set to 0 (informational
  only, does not block CI), for the same reason above — it is unreasonable
  to use a score that fluctuates randomly as a hard gate.
