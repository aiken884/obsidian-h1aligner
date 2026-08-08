# Design Document: Move Tags to Frontmatter (Experimental)

Date: 2026-08-07  Status: **Complete, deployed (unreleased)** — consensus version; execution status is tracked
in the summary at the top of `docs/implementation-move-tags-to-frontmatter.md`
Target version: H1Aligner (community id `heading-aligner`) v0.9.0 and later

## 1. Feature Overview

During the rename flow, optionally move hashtags found in the note body into the frontmatter `tags` property.
Single-purpose, touching only the bytes that need to change: it does not reformat, does not touch timestamps,
and does not modify anything unrelated to tags.

**Disabled by default, and marked as an experimental feature.** Rationale: depending on the selected mode,
this feature can modify the note body — the first time this plugin's changes extend beyond "filename +
frontmatter" — and the operation is irreversible.

## 2. Decision Log (Finalized Item-by-Item with Aiken)

| # | Decision Point | Conclusion |
|---|--------|------|
| 1 | Handling of body hashtags | Three-way option (keep / strip `#` / remove entirely), default **keep** |
| 2 | Trigger semantics | Runs whenever the rename flow executes (including skip cases like `same-name`, `no-h1`); files that are `locked` or excluded by scope are left untouched |
| 3 | Edit trigger | Tag migration is **skipped** (prevents an incomplete tag from being moved when typing pauses for 2 seconds) |
| 4 | Undo scope | v1 only restores the filename (current behavior); the note body is backstopped by Obsidian's File Recovery; recorded in the activity log |
| 5 | Batch preview | Each row is annotated with a "+N tags" count |
| 6 | CJK-contaminated tags (`#重點。`) | Moved as-is; not renamed or skipped |
| 7 | Default value and positioning | Off by default; labeled "Experimental" in the UI and README (explicitly requested by Aiken) |

## 3. Technical Foundation (Backed by Research, Not Assumptions)

Findings from three lines of research (the official `obsidian.d.ts`, empirical decompilation of Obsidian
1.13.4, and a survey of community solutions):

1. **Tags are sourced from the `metadataCache` official parser, not a hand-rolled regex.**
   `cache.tags: TagCache[]` contains the precise start/end offsets for each inline tag;
   a `#` inside a code block, inline code, URL, frontmatter, math block, or HTML comment
   never produces a tag at the parser level. Every existing community solution (Linter,
   yaml-my-hashtags) hand-rolls a regex and runs into pitfalls (Linter #1535, an open
   issue about false positives on pure numbers).
2. **`cache.tags` does not include frontmatter tags** (frontmatter tags live only in
   `cache.frontmatter` and are read via `parseFrontMatterTags`, which always returns
   them prefixed with `#`).
3. **`Vault.process()`** is the officially documented atomic read-modify-write API;
   **`FileManager.processFrontMatter`** is internally `vault.process`, atomic at the
   same level, but it re-serializes the entire frontmatter block (YAML comments are
   lost, single-line arrays become block lists) — this plugin's alias feature already
   exhibits this behavior, so this stays consistent with it, and it is disclosed in the
   README.
4. **Cache-staleness guard (an official pattern)**: inside the `process()` callback,
   each tag is verified with `data.slice(start.offset, end.offset) === tag`; if it
   doesn't match, that tag is skipped. Deletions proceed from the end of the file
   toward the beginning to avoid offset drift.
5. **Three categories of tags exist in the cache but must not be moved.** The
   "non-movable regions" are precisely defined as follows, with the determination
   centralized in a single function, `movableTags()` (adopted per the pplx review):
   - **Heading lines**: the tag's `start.line` equals the line of any
     `cache.headings[].position` (headings are single-line; removing a tag inside an
     H1 would change the H1 → the next rename would change the filename again,
     causing a self-triggering loop)
   - **Link ranges**: the tag's offset range falls within any `cache.links[].position`
     range
   - **Block comments**: the tag's offset range falls within any
     `cache.sections[]` entry where `type === 'comment'`
   - **Inline `%%…%%`**: if an odd number of `%%` precede the tag on the same line →
     skip. This is a heuristic that errs conservatively (it can only over-skip, never
     over-move); multi-line `%%` blocks are already covered by the block-comment rule
     above.

## 4. Settings (3 New Settings, All Included in the Batch Fingerprint and `normalizeSettings`)

| Setting | Type | Default | Description |
|------|------|------|------|
| `moveTagsToFrontmatter` | boolean | `false` | Master switch; labeled "Experimental" in the UI heading, with warning text covering: (a) depending on the mode, it can modify the note body; (b) **it rewrites the frontmatter and removes any YAML comments within it**; (c) it only runs when triggered by the rename flow, not during live editing (edit-triggered); (d) it does not automatically clean up punctuation in tag names or rename tags; users are advised to confirm File Recovery is enabled |
| `bodyTagHandling` | `'keep' \| 'remove-hash' \| 'remove-tag'` | `'keep'` | Mirrors the Linter plugin's three-way option; the `remove-tag` description notes the risk of mid-sentence tags |
| `tagsToIgnoreForMove` | string[] | `[]` | Ignore list (without `#`; nested tags are matched by full name) |

**Tag name normalization (a single function, shared by both ignore-list matching and deduplication)**:
`normalizeTagName(s) = foldName(trim after stripping the leading '#')` — i.e., NFC
normalization + `toLowerCase` (reusing the existing `foldName`), preserving the `/`
hierarchy separator. The leading `#` is also stripped when the ignore list is stored.
Tests cover the full combination of `#A/B` / `a/b` / `A/B` / `#a` / `#a/b/c` (adopted
per the pplx review).

## 5. Algorithm (Core Data Flow)

```
End of runRename(file) (after rename runs or is skipped, before the locked/scope exclusion return):
  if (!settings.moveTagsToFrontmatter) return
  if (source === 'edit') return                    // Decision 3
  cache = metadataCache.getFileCache(file)         // rename doesn't clear the cache, so it's usable
  candidates = cache.tags
      .filter(not inside %%comment%%, a heading, or link text)     // cross-checked against position
      .filter(tag name not in tagsToIgnoreForMove)       // case-insensitive
  if (candidates is empty && frontmatter needs no change) return

  // Step 1 (remove-hash / remove-tag modes only):
  candidates.sort((a,b) => b.position.start.offset - a.position.start.offset)  // explicitly tail-to-head
  vault.process(file, (data) => {
    for (tag of candidates):
      if (data.slice(start, end) !== tag.tag) { skippedStale++; continue }  // staleness check + logging
      remove-hash → delete the single '#' character
      remove-tag  → delete [start, end); if the preceding character is [space, tab, or
                    full-width space U+3000], also delete that one character (does not
                    consume newlines, preserving line structure; aligned with and
                    tightened relative to Linter)
    return data'
  })

  // Step 2 (always runs):
  processFrontMatter(file, (fm) => {
    existing = read the current value with parseFrontMatterTags semantics (compatible with
               string/array and singular/plural key current values)
    merged = dedupe(existing ∪ candidate names)     // case-insensitive,
                                                    // preserves the casing of first occurrence, strips '#'
    fm.tags = merged (list format; nested tags written directly as 'a/b')
  })                                               // try/catch; failure does not affect the rename outcome
```

**Trigger branch details (adopted per the pplx review: specified branch-by-branch)**:

| runRename result | Runs tag migration? | Reason |
|---|---|---|
| `none` (an actual rename occurred) | ✅ | Core scenario |
| `same-name` / `case-only` | ✅ | Notes whose filename is already aligned should still have their tags organized (Aiken's Decision 2) |
| `no-h1` / `empty-after-sanitize` / `collision` | ✅ | Tag organization is unrelated to H1 content or naming collisions |
| `locked` | ❌ | Respects the per-file opt-out |
| `in-progress` | ❌ | An operation is already in progress on the same file |
| source = `edit` | ❌ | Aiken's Decision 3 (the caller passes `allowTagMove: false`) |
| `cache === null` | ❌ (logged) | Indexing not yet complete; no regex fallback (adopted per the pplx review) |

**Failure-mode analysis of the gap in the two-step write (response to pplx critical
finding #2 — the rationale for keeping the two-step design)**:
Step 2 (`processFrontMatter`) receives only the candidates' "tag names" as input and
uses no position information at all; within its own atomic callback it merges based
on the frontmatter of the file **as it is at that moment**. So, analyzing each
scenario where an external edit occurs between the two steps:
(a) The body was edited externally → Step 2 is unaffected (it only touches frontmatter);
(b) The frontmatter was edited externally → Step 2 merges on top of the new value,
    correctly;
(c) A tag was deleted externally → that tag is still added to the frontmatter
    (equivalent to keep-mode behavior), which is safe and loses no user data;
(d) A tag that failed the Step 1 staleness check → it remains in the body and is also
    added to the frontmatter (= keep), which is safe.
A single-callback merge approach (manually re-serializing the entire YAML block) was
rejected: the risk of taking on YAML serialization correctness outweighs the
provably safe gap behavior described above.

Error handling: each of the two steps has its own try/catch; any failure is logged
via `console.error` plus the activity log, without turning the rename outcome into an
error (the rename itself already succeeded).
The activity log records the `moved` / `skippedStale` counts (adopted per the pplx
review).

**Frontmatter canonical schema (adopted per the pplx review; revised per adversarial
review)**: on read, both `tags` and `tag` (singular/plural) are normalized to
`string[]` — **strings are split on commas/whitespace** (matching Obsidian's
`parseFrontMatterTags` semantics for legacy `tags: a, b` values, per adversarial
review fix #1), numbers are converted via `String()`, and invalid entries (including
nested arrays) are filtered out; on write, **only `tags: string[]` is written**; the
`tag` key is read-only and left untouched. When both keys are present, `tags` is
treated as the source of truth and the `tag` value is ignored.

## 6. Integration Points

- `settings.ts`: 3 new fields + `DEFAULT_SETTINGS` + defensive validation in
  `normalizeSettings` (follows the existing pattern: wrongly-typed values fall back
  to the default).
- `main.ts`: `batchSettingsFingerprint()` now includes the 3 new settings;
  `triggerRename` passes `source` so the edit case can be detected.
- `rename-service.ts`: added a private tag-migration method, called at the end of
  `runRename`; in dry-run mode it returns the number of tags that would be moved
  (for the batch preview).
- `batch-modal.ts`: row-end annotation — "+N tags" in keep mode, "+N tags (body will
  be modified)" in remove mode (i18n; adopted per the pplx review, to disclose the
  body-editing side effect). **Shown only for the rename group** (decided during
  adversarial review): batch Apply only processes rename items; tag migration for
  skipped files is instead picked up later by an automatic trigger (file-open / leave
  / manual), and the preview does not show actions the batch run will not perform.
- `settings-tab.ts`: an Experimental section (master switch + mode dropdown +
  ignore-list textarea).
- `i18n.ts`: all new strings added (en + zh-TW, following the existing locale
  structure).
- `activity-log.ts`: records the number of tags moved (using the `detail` field of
  the existing record structure).

## 6.5 Known Limitations (Recorded During Adversarial Review)

- **Malformed frontmatter** (a leading `---` with no closing `---`): Obsidian does
  not treat this as frontmatter; `processFrontMatter` inserts a new frontmatter block
  at the top of the file, leaving the original orphaned `---` line behind in the body.
  This is official API behavior, and the experimental feature does not handle it
  specially.
- **Self-link rewriting**: when `renameFile` updates links within the note that
  point to itself, offsets shift; any tag affected in that pass is skipped by the
  staleness guard (counted as stale and logged), and is handled on the next trigger.

## 7. Explicitly Out of Scope (YAGNI)

Automatically fixing contaminated tag names, a tag allowlist mode, undo for body
edits, any parser dependency such as mdast/remark, and write support for the `tag`
(singular) key (read compatibility is sufficient).

## 8. Test Plan (vitest, Using the Existing Harness)

- Position filtering: `%%…%%`, inside a heading, inside link text, a regular
  paragraph, a blockquote (should be moved)
- Staleness: offset verification fails → that tag is skipped, the rest proceed
  normally
- Body-edit results for all three modes (including "delete along with the leading
  whitespace")
- Deduplication: case-insensitive (`#Test` vs. an existing `test`), nested tags,
  compatibility with an existing string-typed `tags: single` in frontmatter
- CJK: `#重點。` is moved as-is; Chinese-language tags, emoji tags
- Ignore list; skipped when source is edit; `locked` files untouched; defensive
  settings normalization
- Fingerprint: changing any of the new settings invalidates the batch preview
