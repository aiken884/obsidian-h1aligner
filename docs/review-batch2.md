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
