# Review request: H1Aligner 0.13.0 (batch 2) pre-release decisions — round 1

You are reviewing design decisions for **H1Aligner**, an Obsidian community plugin (id `heading-aligner`, public repo `aiken884/obsidian-h1aligner`) that renames a note's file to match its first H1. The last public release is 0.12.0. Branch `feature/0.12.0-batch2` is the 0.13.0 candidate and adds three read-only diagnostics: **Explain this note** (command), an **out-of-scope count** in the vault-wide dry-run preview modal, and a folder right-click **Preview renames in this folder** (same modal, limited to that folder's descendants).

A read-only multi-agent review found the issues below. Please review each proposed decision.

## Constraints (must hold)

- Explain / preview are strictly read-only; they never write files or settings.
- Scope rules (pure function `scopeOutReason(path, basename, scope)`), in order: (1) ignore folders → `ignored` (skipped by automatic AND manual rename); (2) include-folders whitelist miss → `not-included` (automatic skips; the manual command still renames); (3) basename exclude regex → `excluded-pattern` (automatic skips; manual still renames).
- **Invalid exclude-pattern draft = global pause.** If the user's exclude-pattern *draft* in settings contains an invalid regex, the previous valid rules stay active, but automatic, manual and batch-apply renames are all paused until it is fixed (manual shows "fix the invalid exclude pattern first"; the batch modal shows a warning and disables Apply). Released in 0.10.0.
- UI strings exist in en, zh-TW, ja. Obsidian guideline: sentence case, no plugin name in command names (notices may start with "H1Aligner:").
- No ESLint overrides; `minAppVersion` stays 1.13.0.
- Any decision that changes released 0.12.0 behavior is flagged for the maintainer's later review and marked **Changed** in CHANGELOG.

## Current Explain copy (en)

- ignored: `H1Aligner: {path} is in an ignored folder — automatic and manual rename both skip it.`
- not-included: `H1Aligner: {path} is outside the include-folders whitelist — automatic rename skips it; the manual command can still rename it.`
- excluded-pattern: `H1Aligner: {path} matches an exclude-filename pattern — automatic rename skips it; the manual command can still rename it.`
- would rename: `H1Aligner: {path} would be renamed → {name}`
- skip: `H1Aligner: {path} would not be renamed ({reason})` — reason e.g. "locked", "no H1", "already matches", "name collision"
- error: `H1Aligner: could not explain {path}: {message}`

Current logic: compute `scopeOutReason`; if out of scope, return the scope message without a dry run; otherwise run a read-only dry run of the rename and report would-rename / skip / error.

## Decision 1 (major, A-M1): Explain ignores the invalid-pattern pause

Bug: with an invalid exclude-pattern draft saved, Explain still says "would be renamed → X" or "the manual command can still rename it", but every rename path is actually paused.

**Proposal:** check the pause **first** (same order as the real rename path, which checks the pause before anything else). When paused, skip scope/dry-run and return a new kind `paused` with a new string:

- en: `H1Aligner: renaming is paused until the invalid exclude pattern in settings is fixed — {path} will not be renamed automatically, manually, or by batch apply.`
- zh-TW: `H1Aligner：設定中的排除規則有無效項目，改名已暫停 — 修正之前，{path} 不會被自動、手動或批次套用改名。`
- ja: `H1Aligner：設定の除外パターンに無効なものがあるため、リネームは一時停止中です — 修正するまで {path} は自動・手動・一括適用のいずれでもリネームされません。`

Alternative considered: keep the normal explanation and append "(renaming is currently paused …)". Rejected because the normal explanation is computed with the *old* active rules; once the draft is fixed the new rules may give a different answer, so the appended explanation could be wrong.

## Decision 2 (minor, A-O4): locked (or otherwise non-renamable) note outside include/exclude scope

Bug: for `not-included` / `excluded-pattern`, Explain says "the manual command can still rename it", but for a locked note (or one with no H1, or already matching) the manual command actually skips it.

**Proposal:** for `not-included` / `excluded-pattern` only, also run the read-only dry run (the dry run does not apply scope; it is exactly what the manual command would do). If it would rename, keep the current text. If it would skip, use new strings:

- en: `H1Aligner: {path} is outside the include-folders whitelist — automatic rename skips it, and the manual command would also skip it ({reason}).` (and the same shape for "matches an exclude-filename pattern")
- zh-TW: `H1Aligner：{path} 不在僅套用白名單內 — 自動改名會跳過，手動指令也會跳過（{reason}）。` / `H1Aligner：{path} 符合排除檔名 pattern — 自動改名會跳過，手動指令也會跳過（{reason}）。`
- ja: analogous.

If the dry run errors, fall back to the existing scope text (the scope fact is still true). `ignored` stays as is (no dry run).

## Decision 3 (minor, A-O6): batch/folder Apply does not re-check scope

Apply re-runs a fresh dry run per row (H1 changed, lock, collision) and is blocked if any rename-affecting setting changed since the preview (settings fingerprint), but it does not re-check scope for each file. A note *moved* into an ignored folder between preview and Apply could still be renamed. This is pre-existing since 0.12.0 (the vault-wide preview), not introduced by batch 2.

**Proposal:** do **not** change Apply in 0.13.0 (it would change released 0.12.0 behavior and needs its own review). Instead, fix the CHANGELOG claim "Apply still only acts on in-scope rename items" to: "Apply still acts only on the preview's Rename rows (scope as of the preview), re-checking each row with a fresh dry run." Record the gap as a known limitation for a later release.

## Decision 4 (minor, A-O7): out-of-scope line in the folder preview

The modal's line `{count} note(s) are outside the current folder/pattern filters (not listed below).` can be read as "outside this folder" in the folder what-if, and the modal does not say which folder is previewed.

**Proposal:** when the modal is opened from a folder, add a first hint line and use a folder-specific out-of-scope string; the vault-wide copy is unchanged.

- en: `Previewing notes under {folder} only.` and `{count} note(s) in this folder are excluded by the ignore/include/exclude settings (not listed below).`
- zh-TW: `只預覽 {folder} 底下的筆記。` and `這個資料夾中有 {count} 則筆記被忽略／僅套用／排除設定排除（不列在下方）。`
- ja: `{folder} 以下のノートのみをプレビューしています。` and `このフォルダ内の {count} 件のノートは除外／対象フォルダ／除外パターン設定の対象外です（下には表示しません）。`

## Decision 5 (minor, A-O1): tag normalizer contract bug (experimental tag-move feature, since 0.11.0)

`normalizeTagName` and `mergeTagsIntoList` document "output never starts with '#'", implemented as `s.trim().replace(/^#+/, '').trim()`. Input `'# #'` → `'#'` (after the first strip and trim, another `#` appears). A property test (idempotence / no leading `#`) fails randomly in CI when fast-check hits this. **Proposal:** strip leading `#` and whitespace together: `s.replace(/^[\s#]+/, '').trim()`, plus example tests for `'# #'` → `''` and `'# #foo'` → `'foo'`. Treat as a **Fix** (restores the documented contract; only pathological inputs change), not a behavior change needing maintainer review.

## Decision 6 (minor, A-O2): make lint warnings fail CI

`npm run lint` is `eslint src/`; the Obsidian plugin rules for command names / sentence case are warn-level, so CI passes with warnings, while the community Scorecard review may flag them. Release docs already say to run `npm run lint -- --max-warnings 0`. **Proposal:** change the script to `eslint src/ --max-warnings 0` (CI and release workflow both call `npm run lint`), and update the release docs to plain `npm run lint`.

## Decision 7 (minor, A-O3): tag / version consistency in the release workflow

The release workflow runs on any pushed tag and creates a draft release; it never checks that the tag equals the version. **Proposal:** add a first step after checkout that fails unless `tag == manifest.json version == package.json version` and `versions.json` has a key for that tag, e.g. a short `node -e` script reading the three files and `GITHUB_REF_NAME`.

## Please answer in this format

- `verdict: approve | revise` (overall)
- Per decision (1–7): `approve | revise`, with any **blocking issues** (things that would make the change wrong or unsafe) and **non-blocking suggestions** (especially wording of the three-language strings).
- Any **API facts that need verification** (Obsidian API, ESLint CLI behavior, GitHub Actions) — list them explicitly rather than asserting them.
