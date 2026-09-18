# Design Document: Explain this note, out-of-scope batch count, folder what-if preview (batch 2)

Date: 2026-09-16  Status: **Implemented on `feature/0.12.0-batch2`; internal testing pending (not a public release).**
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
- Build `scopeOutReason` with the same `scopeSettings()` as `shouldProcess` (config dir always ignored).
- If out of scope: **do not** call `renameFromH1`. Notice text:
  - ignored → automatic **and** manual skip
  - not-included / excluded-pattern → automatic skip; **manual command can still rename**
- If in scope: `renameFromH1(file, { dryRun: true })`. Map skip reasons through `describeSkipReason`. Would-rename uses the proposed basename. Errors use the error message. Never call without `dryRun: true`.
- Pure helper `explainNote({ path, basename, scopeOut, dryRun })` → `{ kind, text }` so tests do not mock the unit under test.

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

## 7. i18n (en / zh-TW / ja)

New keys (placeholders must match across locales):

- `cmd.explain`
- `menu.previewFolder`
- `explain.ignored`, `explain.notIncluded`, `explain.excludedPattern` (`{path}`)
- `explain.wouldRename` (`{path}`, `{name}`)
- `explain.skip` (`{path}`, `{reason}`)
- `explain.error` (`{path}`, `{message}`)
- `batch.outOfScope` (`{count}`)

## 8. Tests

- Unit: `scopeOutReason` order (ignore beats include; exclude after include); `isInScope` still matches today's cases.
- Unit: `explainNote` for in-scope would-rename, locked, ignored, exclude-pattern, no-H1; ignored path does not need a dry-run object.
- Unit: out-of-scope count equals files that fail the existing scope filter; those files are not in the in-scope list.
- Unit: `isUnderFolder` prefix-safety.
- E2E against production `main.js`: explain command does not push `_renameCalls`; batch modal shows out-of-scope copy; folder menu preview lists only descendants.

## 9. Non-goals

Public 0.13.0; batch 3; debounce clock injection; on-device iPhone/Android as a **release** gate for this branch.
