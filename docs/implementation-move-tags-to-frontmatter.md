# Implementation Document: Move Tags to Frontmatter (Experimental)

Date: 2026-08-07　Status: **Complete, deployed (not yet released)**
Based on: `docs/design-move-tags-to-frontmatter.md` (consensus version)

## Completion Status Summary (2026-08-07)

- Implementation + 33-agent adversarial review (all 23 confirmed items fixed) + 14-scenario
  live testing (discovered and fixed 2 additional real bugs: an external-link tag exclusion
  gap, and the activity log missing the tag summary when renamed)
- Additional live testing: edit-trigger skip guard (real keyboard timing), batch apply with
  real click-through application (not dry-run)
- README/CHANGELOG updated with an Experimental section
- 293 unit tests, 20 E2E tests, all passing; committed + pushed to `origin/main`
  (`f5d20ad..4a538e3`, 10 commits), **no version tag applied, not yet released** — the feature
  is disabled by default, deployed to ObsidianTestVault and the main ObsidianVault for ongoing
  local testing
- Logged to RemaGraph (`mem-20260807-002`, project `obsidian-h1aligner`)
- **2026-08-08 additional testing:** fast-check property-based tests
  (`tests/tag-mover.property.test.ts`, 19 invariants) + Stryker mutation testing
  (`src/tag-mover.ts`, see `docs/mutation-testing-tag-mover.md` for details). This process
  uncovered and fixed 2 additional real bugs: the hash-stripping regex only removed one `#`
  and left a residual, and an unanchored regex could incorrectly delete a `#` in the middle
  of a string. Unit tests 293→326, 326 tests + 20 E2E all passing
- **2026-08-08 CodeGraph project-wide health check + adversarial verification**: found 5 real
  gaps, all fixed — the ignore-list textarea silently failed on newline input (added
  `parseTagsToIgnoreForMove`, now supporting both commas and newlines), batch apply bypassed
  the recentlyEdited typing-in-progress guard (added, matching the other trigger paths), the
  main.ts decision layer (typing-in-progress guard + activity formatting) had zero test
  coverage (extracted into a pure function `src/tag-move-policy.ts` + unit tests + 3 new e2e
  scenarios), and `lastEditAt` was changed to a `WeakMap<TFile, number>` to avoid unbounded
  growth. Along the way, also fixed 3 pre-existing fake-stub defects in the e2e test tooling
  itself (rename clearing the body content, rename incorrectly clearing the cache,
  `vault.process` not stubbed). Unit tests 326→340, e2e 20→25 scenarios, all passing
- When formally releasing, follow `RELEASING.md`: `npm version` → push tag → publish draft
  release

## pplx Round-2 Revision Highlights

1. **Rollback (adopted, Round 2 major)**: The order — delete body content first, then write
   frontmatter — must not be reversed (writing frontmatter shifts the offsets of the entire
   body, invalidating all staleness verification). However, if step 2 fails, the tags already
   deleted in step 1 would be lost → added best-effort rollback: preserve the original text
   before step 1; if `processFrontMatter` fails, restore via `vault.process` — the callback
   verifies that "current content === step 1's output" before restoring; if it doesn't match
   (externally edited in the meantime), abandon the restoration and log it.
2. **fm.tag/fm.tags priority (adopted, Round 2 critical)**: `existing = fm.tags !== undefined
   ? fm.tags : fm.tag`; when both exist simultaneously, `tags` is used as the base and `tag`
   is ignored and left untouched (Obsidian's official parseFrontMatterTags only recognizes
   `/^tags$/i`). Items that are neither strings nor finite numbers (including nested arrays)
   are filtered out.
3. **Staleness failure semantics (adopted, Round 2 critical)**: On verification failure → the
   entire tag entry is skipped, with no partial modification made (this is how the
   implementation already behaves; now made explicit).
4. **allowTagMove propagation (partially adopted, Round 2 critical)**: Defaults to true; the
   edit-trigger check is centralized at a single pass-through point in main.ts
   `triggerRename` (the sole entry point for all automatic triggers), guaranteed by tests.
5. **Other adopted items**: The `%%` heuristic performs only plain-text line slicing, not
   syntax parsing; the comment `type` is a compatibility assumption for the current version
   (added a test for missing sections); remove-tag whitelist is [space, tab, U+3000], NBSP is
   not removed; batch `tagCount` is a dry-run estimate; i18n `{count}` is an integer; turning
   off the master toggle does not clear sub-setting values (it only stops rendering them);
   added a mixed-scenario integration test (inline+frontmatter+ignore+edit skip) and a parser
   exclusion-zone verification test.

## Module Breakdown

### New file `src/tag-mover.ts` (pure logic, does not import Obsidian — follows the `batch-triage.ts` pattern)

```ts
// Custom structural types (duck-typed to be compatible with Obsidian's TagCache/Pos structures)
export interface TagPos { start: { line: number; offset: number }; end: { line: number; offset: number } }
export interface InlineTag { tag: string; position: TagPos }
export interface CacheLike {
    tags?: InlineTag[];
    headings?: { position: TagPos }[];
    links?: { position: TagPos }[];
    sections?: { type: string; position: TagPos }[];
}

/** Tag name normalization (shared by ignore-list matching and dedup; adopted from pplx review):
 *  strip leading '#' → trim → foldName (NFC + toLowerCase, imported from rename-service). */
export function normalizeTagName(s: string): string

/** Selects the tags that are movable. Non-movable zones (judged centrally in a single function):
 *  (1) tag.start.line equals the line of any headings[].position;
 *  (2) tag offset range falls within any links[].position range;
 *  (3) tag offset range falls within any sections[] with type==='comment';
 *  (4) an odd number of '%%' appear before the tag on the same line (inline comment heuristic —
 *      only ever over-skips, never over-moves);
 *  (5) normalizeTagName(tag) is in the ignore list (the list is also passed through normalizeTagName). */
export function movableTags(cache: CacheLike, bodyText: string, ignore: string[]): InlineTag[]

/** Merges with deduplication (matched via normalizeTagName). Existing is canonicalized:
 *  string → single-element array, number → String(), other non-string items are filtered out;
 *  first-seen casing is preserved; incoming items have '#' stripped. Returns a new array. */
export function mergeTagsIntoList(existing: unknown, incoming: string[]): string[]

/** Body-content transformation for remove-hash / remove-tag. Candidates are first explicitly
 *  sort((a,b) => b.position.start.offset - a.position.start.offset) (end of file → start of file).
 *  Each is verified individually with data.slice(start,end) === tag (staleness guard); mismatches
 *  are skipped and counted.
 *  remove-tag: if the preceding character is one of [' ', '\t', '　'(U+3000)], that one character
 *  is also removed (newlines are not consumed).
 *  Returns { text, applied, skippedStale }. */
export function applyBodyTagRemoval(
    data: string, candidates: InlineTag[], mode: 'remove-hash' | 'remove-tag',
): { text: string; applied: number; skippedStale: number }
```

### `src/settings.ts`

```ts
export type BodyTagHandling = 'keep' | 'remove-hash' | 'remove-tag';
// Added to H1AlignerSettings:
moveTagsToFrontmatter: boolean;   // default false
bodyTagHandling: BodyTagHandling; // default 'keep'
tagsToIgnoreForMove: string[];    // default []
```
`normalizeSettings`: boolean / enum whitelist / cleanStringArray (follows the existing
defensive pattern; list items have their leading `#` stripped before being stored).

### `src/rename-service.ts`

- `RenameOptions` adds `allowTagMove?: boolean` (defaults to true; the caller passes false
  when triggered by an edit).
- `RenameOutcome` adds `movedTags?: number` (reported for both dry-run and actual execution;
  used for batch annotation and activity logging).
- `runRename`: after the existing return point, before `finally`, on the success path
  (`skipped` being one of `'none' | 'same-name' | 'no-h1' | 'empty-after-sanitize' |
  'case-only' | 'collision'`, i.e. "the process actually ran"; `locked`/`in-progress`
  excluded) calls `maybeMoveTagsToFrontmatter(file, dryRun, allowTagMove)`:

```
private async maybeMoveTagsToFrontmatter(file, dryRun, allow): Promise<number> {
  if (!settings.moveTagsToFrontmatter || !allow) return 0
  cache = metadataCache.getFileCache(file); if (!cache?.tags?.length) return 0
  body  = await vault.cachedRead(file)            // movableTags needs the line text for the %% heuristic
  cands = movableTags(cache, body, settings.tagsToIgnoreForMove)
  if (!cands.length) return 0
  if (dryRun) return cands.length
  if (settings.bodyTagHandling !== 'keep')
    await vault.process(file, d => applyBodyTagRemoval(d, cands, mode).text)   // step 1
    // applied/skippedStale counts are retained for the activity log (moved/skippedStale)
  await fileManager.processFrontMatter(file, fm => {                            // step 2
    merged = mergeTagsIntoList(fm.tags ?? fm.tag, cands.map(c => c.tag))
    fm.tags = merged                                // only tags is written; fm.tag is read-only, never written
  })
  return cands.length
}
// Gap-failure-mode analysis (two-phase safety proof) is in the design doc §5; step 2 uses only
// tag names, not position, merging within its own atomic callback based on the frontmatter as
// it stands at that moment.
```
  Wrapped entirely in try/catch: any failure does console.error + returns 0, without altering
  the rename outcome. Note on ordering: this runs only after the rename (the file's TFile
  already points to the new path; after fileManager.renameFile, the cache still reflects the
  pre-rename content — protected by the verification mechanism in design doc §3.4).

### `src/main.ts`

- `triggerRename(file, manual, source)` → `renameFromH1(file, { allowTagMove: source !== 'edit' })`.
- `runBatchPreview`: the dry run already returns `movedTags` → `BatchItem.tagCount`; the apply
  loop's outcome.movedTags is recorded into the activity detail.
- `batchSettingsFingerprint()` incorporates the 3 new settings.

### `src/batch-modal.ts`

`BatchItem` adds `tagCount?: number`; `renderGroup` annotates the row's tail — in keep mode,
`t('batch.tagCount')` (`+{count} tags`, {count} being an integer), and in remove mode,
`t('batch.tagCountBody')` (`+{count} tags (body will be modified)`).
**Shown only in the rename group** (final decision, synced with design doc §6): batch Apply
only processes rename items; showing it for skipped files would imply an action the batch
does not perform, so it is not displayed there.

### `src/settings-tab.ts` — "Experimental" section (heading + 3 controls)

The toggle name includes the `t('settings.experimental')` prefix; the description includes
four warnings (per design §4): body content modification, frontmatter rewriting + YAML
comment removal, triggered only by the rename flow (not live editing), and tag names are not
auto-cleaned; a File Recovery reminder is added; the `bodyTagHandling` dropdown and the
ignore-list textarea are rendered only when the master toggle is on (following the existing
conditional-rendering pattern). Changing any of the new settings → `saveSettings()`.

### `src/i18n.ts` — new keys (added across all three locales: en / zh-tw / ja)

Actual naming (matches the code, per adversarial review fix #23): `set.exp.heading`,
`set.tagmove.name/desc`, `set.tagmove.body.name/desc/keep/removeHash/removeTag`,
`set.tagmove.ignore.name/desc`, `batch.tagCount` (`+{count} tags`), `batch.tagCountBody`
(`+{count} tags (body will be modified)`); `{count}` is an integer.

## Implementation Order (TDD; two parallel tracks)

**Track A**: `tag-mover.ts` pure logic — write `tests/tag-mover.test.ts` first (red), then
implement (green).
**Track B**: `settings.ts` fields + normalize — extend `tests/settings.test.ts` first (red),
then implement (green).
**Merge point C** (after A and B are complete): `rename-service.ts` integration + extend
`tests/rename-service.test.ts` (add a `vault.process` mock to FakeApp) →
`main.ts` / `batch-modal.ts` / `settings-tab.ts` / `i18n.ts`.
**Verification D**: `npm run lint && npx vitest run --coverage && npm run build` all passing.

## Test Checklist (corresponds to design §8)

tag-mover: heading-line exclusion / link-range exclusion / comment-section exclusion /
odd-count inline `%%` exclusion / preserved inside blockquotes (should be moved) /
ignore-list case-insensitivity / nested full names /
merge: string-type existing, number-type existing, case-insensitive dedup preserving
first-seen casing, `#` stripping /
removal: remove-hash strips only `#`, remove-tag also strips the leading whitespace,
offset-verification failure skips that tag while the rest proceed normally,
back-to-front with no offset shifting, CJK `#重點。` left unchanged, emoji tags.
settings: defaults for the 3 fields / fallback on invalid types / enum whitelist / `#`
stripped from the list.
rename-service: zero calls when off / skipped on edit (allowTagMove=false) / not moved when
locked / still moved on same-name / vault.process not called in keep mode / remove-tag calls
process before processFrontMatter (call-order assertion) / processFrontMatter failure does
not affect the rename outcome / dryRun returns movedTags with zero writes.
fingerprint: any new setting change → fingerprint changes.

## Acceptance Criteria

lint: 0 errors; vitest: all passing, coverage not lower than the current baseline; build
produces main.js; manually deployed to `/Users/aikenlin/Documents/ObsidianVault` (local only,
not released).
