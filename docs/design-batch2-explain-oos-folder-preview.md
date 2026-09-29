# Design Document: Explain this note, out-of-scope batch count, folder what-if preview (batch 2)

Date: 2026-09-16  Status: **Implemented on `feature/0.12.0-batch2`; target release 0.13.0. On-device testing (MOBILE-TESTING #17–#19) pending — required before merging to `main` and bumping the version.**
Implementation (2026-09-16): `c0d4961` (features) + docs/review. Gate: lint, build, 443 unit tests, 46 E2E (scenarios 27–28). Adversarial review in `docs/review-batch2.md` — no remaining blockers. On-device TestVault / iPhone / Android for batch 2 is **not done**. Disk version stays **0.12.0**; no `0.13.0` until Aiken says so.
Companion: batch 1 design `docs/design-lock-command-undo-button-tag-notice.md` §1 roadmap.

## 1. Overview

Three diagnostics around *why* a note is or is not renamed. None of them change guard layers, trigger modes, or lock semantics. **No new settings fields.**

| # | Feature | Why |
|---|---|---|
| A | Explain this note | Users (and the author) cannot see *why* a note stays put without reading settings + skip reasons. A read-only command reports the same decision the plugin would make. |
| B | Out-of-scope count in batch preview | Vault-wide dry-run only lists notes that pass `shouldProcess`. Ignored / not-included / exclude-pattern notes vanish, so the modal looks like a smaller vault. Show a **count**, not a row per file. |
| C | Folder context-menu what-if | Same dry-run modal, but the candidate set is markdown files **under that folder** (and descendants). Apply still uses the existing re-verify path. |

## 2. Invariants that must not be violated

Same as batch 1 §2, plus:

- Explain **never** writes, renames, or locks. Dry-run only (`renameFromH1(..., { dryRun: true })`) and only when the note is in scope.
- Ignore still beats include. Manual rename still bypasses include/exclude but **not** ignore.
- Out-of-scope notes are **not** listed as skipped-after-dry-run apply candidates. Apply still only acts on in-scope `rename` items.
- Folder preview still applies ignore/include/exclude **inside** the folder. It does not expand the scope.
- Zero new ESLint overrides. Command **ids** have no plugin-id prefix. Command **names** are sentence case, no "H1Aligner" prefix (notices may keep the `H1Aligner:` prefix like the rest of the product).

## 3. Shared policy (do not fork)

Reuse `isInScope` / ignore / exclude. Add `scopeOutReason(path, basename, scope)` in `scope.ts` with the **same order** as today's `isInScope`:

1. `ignored` — `isIgnoredPath` (including `/` = vault root layer)
2. `not-included` — include whitelist is on and the path is not under any entry
3. `excluded-pattern` — a valid exclude regex matches the basename
4. `null` — in scope

`isInScope` becomes `scopeOutReason(...) === null` so there is one policy.

Folder membership is `isUnderFolder(path, folderPath)`: empty, `/`, or `.` means the whole vault; otherwise `path === folder` or `path.startsWith(folder + '/')`. Do not match a sibling that only shares a string prefix (`notes` vs `notes-old`).

## 4. Feature A — Explain this note

- Command id: `explain-active-file`. Name: `Explain this note`.
- `checkCallback`: active file exists and `extension === 'md'`. **Ignored notes are eligible** — that is the point of the command. Unlike the rename command, do not use `manualEligible`.
- **First**, if the exclude-pattern draft is invalid (`hasInvalidExcludePatterns()`), every rename path is paused: report that (`explain.paused`) and skip scope and the dry run — same order as `triggerRename` (decision D1, §10).
- Build `scopeOutReason` with the same `scopeSettings()` as `shouldProcess` (config dir always ignored).
- If out of scope: **do not** call `renameFromH1`. Notice text:
  - ignored → automatic **and** manual skip
  - not-included / excluded-pattern → automatic skip; **manual command can still rename** — but only if the read-only dry run (which never consults scope, i.e. exactly what the manual command does) would rename; if it would skip (locked, no H1, already matches, collision…) the notice says the manual command would also skip, with the reason (decision D2, §10). A dry-run error keeps the plain scope text.
- If in scope (or not-included / excluded-pattern, see above): `renameFromH1(file, { dryRun: true })`. Map skip reasons through `describeSkipReason`. Would-rename uses the proposed basename. Errors use the error message. Never call without `dryRun: true`.
- Pure helper `explainNote({ path, basename, scopeOut, dryRun, paused })` → `{ kind, text }` so tests do not mock the unit under test.

## 5. Feature B — Out-of-scope count

Vault-wide preview today:

```ts
getMarkdownFiles().filter((f) => this.shouldProcess(f))
```

Keep scanning **only in-scope** files (dry-run + skipped/conflict/error groups unchanged).

Additionally count markdown files in the **candidate set** (whole vault, or folder for feature C) that fail `isInScope`. Pass `outOfScopeCount` into `BatchPreviewModal`. Show a separate sentence when the count is > 0. Do **not** add those files as `skipped` rows (a large ignored tree must not dump thousands of DOM nodes).

`batch.summary` keeps `{renamable} of {total}` where `total` is in-scope items. New string `batch.outOfScope` for the count.

## 6. Feature C — Folder what-if

- `file-menu`: if `file instanceof TFolder`, add **Preview renames in this folder**. Do not add lock/rename items on folders.
- Candidate markdown files: `getMarkdownFiles().filter((f) => isUnderFolder(f.path, folder.path))`. Then split in-scope vs out-of-scope as in §5. Open the same `BatchPreviewModal`. Apply callback is the existing re-verify + `renameFromH1` (not dry-run) path — **no second apply implementation**.
- `openBatchPreview` / `runBatchPreview` take an optional `folderPath`. Vault-wide command passes nothing.
- The modal receives the same `folderPath` (vault-relative, rendered as text). When set it shows a first hint line (`batch.folderScope`) and uses the folder-specific count sentence (`batch.outOfScopeFolder`) so the count cannot be read as "outside this folder" (decision D4, §10). The vault-wide modal is unchanged.

## 7. i18n (en / zh-TW / ja)

New keys (placeholders must match across locales):

- `cmd.explain`
- `menu.previewFolder`
- `explain.ignored`, `explain.notIncluded`, `explain.excludedPattern` (`{path}`)
- `explain.wouldRename` (`{path}`, `{name}`)
- `explain.skip` (`{path}`, `{reason}`)
- `explain.error` (`{path}`, `{message}`)
- `explain.paused` (`{path}`); `explain.notIncludedManualSkip`, `explain.excludedPatternManualSkip` (`{path}`, `{reason}`) — added by the 2026-09 review (§10)
- `batch.outOfScope` (`{count}`); `batch.folderScope` (`{folder}`), `batch.outOfScopeFolder` (`{count}`) — the latter two for the folder preview only

## 8. Tests

- Unit: `scopeOutReason` order (ignore beats include; exclude after include); `isInScope` still matches today's cases.
- Unit: `explainNote` for in-scope would-rename, locked, ignored, exclude-pattern, no-H1; ignored path does not need a dry-run object; `paused` wins over every scope reason and never reads the dry run; include/exclude misses say "manual would also skip" when the dry run skips.
- Unit: out-of-scope count equals files that fail the existing scope filter; those files are not in the in-scope list.
- Unit (`batch-modal.test.ts`): the count line appears only when the count is above zero; the folder preview names the folder and uses the folder-specific count sentence.
- Unit: `isUnderFolder` prefix-safety.
- E2E against production `main.js`: explain command does not push `_renameCalls`; with an invalid exclude-pattern draft it reports the pause, not a would-rename (27b); a locked excluded note says the manual command would also skip (27c); batch modal shows out-of-scope copy; folder menu preview lists only descendants, names the folder, counts the in-folder note the exclude pattern filters out (not listed), and omits a prefix-sharing sibling folder (28).

## 9. Non-goals

Batch 3; debounce clock injection. This document's scope ended at internal testing; releasing this branch as 0.13.0 still goes through `RELEASING.md`'s release-candidate gate, including MOBILE-TESTING #17–#19 on device.

## 10. Decision log (2026-09-29 pre-release review)

A read-only multi-agent review of `082d1d3` found one major issue and several minor ones before 0.13.0. The design-level choices were sent to PPLX (Sonar, no tools) as one request: `docs/pplx/2026-09-29-batch2-prerelease-decisions-r1-request.md`, answer in `-r1.md`. Round 1 returned **approve** for all seven with no blocking issues. PPLX's "facts to verify" were checked locally: ESLint is 10.8.1 and accepts `--max-warnings 0` (also when passed twice, so `npm run lint -- --max-warnings 0` keeps working); the dry run in `rename-service.ts` never consults scope, so it is exactly what the manual command would do; the folder menu passes `TFolder.path` (vault-relative) and `isUnderFolder` is prefix-safe (`batch` does not match `batch-old/`); `versions.json` maps plugin version → `minAppVersion`.

| # | Problem | Options | Decision | Why |
|---|---|---|---|---|
| D1 | Explain ignores the invalid-exclude-draft pause (automatic, manual and batch Apply are paused, Explain still says "would be renamed" / "manual can still rename it"). | (a) check the pause first and return a dedicated `paused` result; (b) keep the normal explanation and append a pause note. | (a). New kind `paused`, key `explain.paused`; no scope check or dry run while paused. | Same order as `triggerRename`. (b) would describe the *old* active rules, which may be wrong once the draft is fixed. |
| D2 | For `not-included` / `excluded-pattern`, "the manual command can still rename it" is wrong for a locked / no-H1 / already-matching note. | (a) keep; (b) also run the read-only dry run and say when manual would skip too. | (b). Keys `explain.notIncludedManualSkip`, `explain.excludedPatternManualSkip`; a dry-run error falls back to the plain scope text. `ignored` unchanged. | The dry run is exactly the manual path, so the sentence becomes true in every case. |
| D3 | Batch / folder Apply re-checks H1, lock and collision but not scope (a note moved into an ignored folder after the preview can still be renamed). Pre-existing since 0.12.0. | (a) re-check scope at Apply; (b) leave Apply unchanged and correct the CHANGELOG claim. | (b) for 0.13.0; known limitation. | (a) changes released 0.12.0 behavior and needs its own review. |
| D4 | The folder preview's out-of-scope line ("outside the current folder/pattern filters") reads as "outside this folder", and the modal does not name the folder. | (a) keep; (b) folder-only hint line plus a folder-specific out-of-scope string. | (b). Keys `batch.folderScope`, `batch.outOfScopeFolder`; the vault-wide modal is unchanged. Folder path is vault-relative and rendered as text. | Removes the ambiguity without touching the released vault-wide copy. |
| D5 | Tag normalizer contract bug (since 0.11.0): `'# #'` → `'#'`, breaking "no leading `#`" and idempotence; the property test fails randomly in CI. | (a) keep; (b) strip leading `#` and whitespace together. | (b), with regression examples. | Restores the documented contract; only malformed inputs change. Listed for maintainer review because it changes released output for those inputs. |
| D6 | Lint warnings (Obsidian command-name / sentence-case rules are warn-level) do not fail CI. | (a) keep; (b) `eslint src/ --max-warnings 0` in the `lint` script. | (b). CI and the release workflow both call `npm run lint`. | Community review flags these; CI should too. |
| D7 | The release workflow never checks that the tag matches the version files. | (a) keep; (b) fail early unless tag = `manifest.json` = `package.json` version and `versions.json[tag]` = `minAppVersion`. | (b), as the first step after checkout. | A mismatched tag would publish a release the plugin loader cannot use. |
