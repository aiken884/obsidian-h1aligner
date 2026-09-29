# Adversarial review: batch 2 (Explain / out-of-scope count / folder what-if)

Date: 2026-09-16
Against: `docs/design-batch2-explain-oos-folder-preview.md`
Branch: `feature/0.12.0-batch2` (version on disk remains 0.12.0)

## Method

Read the design, then the shipped paths: `scopeOutReason` / `isInScope` / `countOutOfScope` / `isUnderFolder`, `explainNote`, `explainActiveFile`, `runBatchPreview`, `BatchPreviewModal`, `file-menu` folder item, unit tests in `tests/explain-note.test.ts`, E2E 14 / 27 / 28. Looked for policy forks, writes on the explain path, apply acting on out-of-scope files, folder preview leaking other directories, command-id prefix, new settings, ESLint overrides.

## Blocking

None remaining.

| Finding | Disposition |
|---|---|
| A second scope policy would drift from `shouldProcess` | **Fixed in design:** `isInScope` is `scopeOutReason(...) === null`; batch and explain use `scopeSettings()`. |
| Explain calling `renameFromH1` without `dryRun` would write | **Fixed:** out-of-scope skips the service; in-scope always `{ dryRun: true }`. E2E 27 asserts `_renameCalls` unchanged. |
| Listing every out-of-scope note as a skipped row | **Fixed:** count only; E2E 14 asserts no `.trash/` rows. Apply still filters `status === 'rename'`. |
| Folder preview using the whole vault | **Fixed:** `isUnderFolder`; E2E 28 asserts `batch/` descendants and not `notes/explain-rename.md`. Apply is the existing re-verify callback. |
| `file-menu` returning early on non-`TFile` would hide the folder item | **Fixed:** `TFolder` handled first. |

## Non-blocking / waived

- E2E 14's out-of-scope sentence depends on earlier scenarios leaving ignored/daily files in the fake vault. Dedicated 27/28 cover explain and folder. **Waived** (still passed on a full run).
- Folder preview of an ignored folder: in-scope list empty, out-of-scope count = all markdown descendants. Correct what-if; no extra copy.
- On-device iPhone/Android for batch 2 is **out of this goal** (internal later).
- Public 0.13.0 is **out of this goal**.

## Commands / i18n

- ids: `explain-active-file` (no plugin-id prefix). Folder action is a menu title, not a command id.
- Names: `Explain this note` / `Preview renames in this folder` — sentence case, no "H1Aligner" in the command name. Notices keep the `H1Aligner:` prefix like the rest of the plugin.
- Keys exist in `en`, `zh-tw`, `ja` with matching `{path}` / `{name}` / `{reason}` / `{message}` / `{count}` placeholders (`tests/i18n.test.ts`).

## Verdict

**Approve for internal testing on this branch.** No remaining blockers against the design.

## 2026-09 re-review (appended; the text above is unchanged)

Re-checked on 2026-09-29 against `082d1d3` by a read-only multi-agent review. The verdict above (approve for internal testing) still holds; it is not a release approval — 0.13.0 still needs `RELEASING.md`'s gate, including MOBILE-TESTING #17–#19 on device.

- **Missed policy fork (major):** with an invalid exclude-pattern draft saved, `triggerRename` pauses automatic and manual renames and the batch preview disables Apply, but `explainActiveFile` did not check `hasInvalidExcludePatterns()`, so Explain still reported "would be renamed → …" or "the manual command can still rename it". Status: **fixed in `1e0d706`** (Explain checks the pause first and reports it; E2E 27b, unit tests). Related: for out-of-scope notes the manual command would also skip (locked, no H1), Explain no longer promises a manual rename — fixed in `0beb1c6` (E2E 27c).
- **F3 evidence overstated:** E2E 14's "no `.trash/` rows" assertion cannot catch out-of-scope files listed as *skipped* (the Skipped group renders counts, not paths); it only catches them appearing as Rename rows. `.trash/` is also hidden from Obsidian's Vault API, so the fixture is not realistic. Status: **fixed in `608f32c`** (E2E 14 asserts the actual count); the on-device fixture now uses a visible ignored folder (`2f00eb1`).
- **N1 only partly holds:** E2E 28 created no files of its own; it relied on files left by scenarios 14, 21 and 27. Status: **fixed in `d36db1a`** (28 builds its own in-folder date-named note and a prefix-sharing sibling folder).
- **Design §8 gap:** no unit test pinned the "exclude after include" order of `scopeOutReason`. Status: **fixed in `608f32c`**.
- **F4 note:** Apply re-verifies H1/lock/collision with a fresh dry run but does not re-check scope; a note moved into an ignored folder after the preview can still be renamed (pre-existing since 0.12.0). Status: **open, documented** — deliberately not changed in 0.13.0 (it would change released behavior); the CHANGELOG now states that Apply acts on the preview's Rename rows as of the preview. Decision D3 in the design doc §10.
- **Copy:** `batch.outOfScope` ("outside the current folder/pattern filters") could read as "outside this folder" in the folder what-if. Status: **fixed in `d36db1a`** (the folder preview names the folder and uses its own count sentence). `t()` substituted placeholders one after another, so a path containing a literal `{name}` / `{reason}` / `{message}` was rewritten in Explain notices. Status: **fixed in `b5114d3`** (single-pass replacement).

Decisions for the fixes above went through PPLX (round 1, all approved); see the design doc's §10 and `docs/pplx/`.
