---
title: "PPLX Agent API Output"
type: knowledge
status: draft
date_created: 2026-09-30
date_modified: 2026-09-30
project: "PPLX Agent API 整合"
tags:
  - research
pplx_endpoint: agent
pplx_model: perplexity/sonar
pplx_preset:
pplx_task_type: research
pplx_rigour: standard
pplx_tokens: 3899
pplx_latency_sec: 5.34
---

# PPLX Agent API Output

## Query

# Review request: H1Aligner batch 3 design — round 2 (revised)

Round 1 verdict was `revise` with 3 blocking issues (freshness argument for reading `cache.frontmatter.title`; harness fake cannot prove mobile clipboard support; demonstrate the same-name/no-loop invariant). The revised design is below; §10 maps each round-1 point to its change. One factual correction: you reported that Obsidian's submission-requirements page lists `navigator.clipboard.writeText()` as requiring `isDesktopOnly: true`. The page was re-read: it lists `navigator.clipboard.readText()/writeText()` as the **Web API alternatives** to Node/Electron clipboard modules; it does not say they force desktop-only. Please treat that as settled unless you have a direct quote to the contrary.

Please answer in the same format: `verdict: approve | revise`; **blocking issues** (only things that would make the design wrong or unsafe); non-blocking suggestions; and which facts you verified vs. could not. Do not repeat round-1 points that are addressed.

---

# Design Document: Activity Copy button, frontmatter `title` fallback (batch 3)

Date: 2026-09-30  Status: **Revised after PPLX round 1 (§10); proposed on `feature/0.12.0-batch3` (branched from `feature/0.12.0-batch2`); target release 0.14.0 (after 0.13.0). Not implemented until the PPLX consensus in §10 is recorded.**
Companions: `docs/design-batch2-explain-oos-folder-preview.md`, `docs/design-lock-command-undo-button-tag-notice.md` §1 roadmap.

## 1. Overview

| # | Feature | Why |
|---|---|---|
| 7 | **Copy** button in the activity modal | The session activity log answers "why wasn't this renamed?" but can only be read on screen; a bug report or a note needs the text. |
| 8 | Frontmatter **`title`** as a fallback source when a note has no usable H1 (opt-in) | Many notes keep their title in frontmatter and have no `# H1`; today they are always skipped as `no-h1`. |
| — | `KeyedDebouncer` clock injection (tech debt) | **Not included** — see §9. |

Both features are additive; with the new setting off (default) and the Copy button unused, behavior is identical to 0.13.0.

## 2. Invariants that must not be violated

1. H1 wins: when the note has a usable H1, the frontmatter title is never consulted.
2. The fallback is **off by default** and changes nothing until the user turns it on.
3. Never write the note's content because of this feature: title fallback only chooses the *filename*; it never edits `title` or any frontmatter (tag mover and alias features keep their own write rules).
4. Idempotent: after a rename from a title, a second pass yields `same-name`.
5. Lock, ignore/include/exclude scope, daily-note protection, collision policy, Undo and the invalid-exclude-draft pause apply to a title-based rename exactly as to an H1-based one.
6. A rename preview (batch / folder) must be invalidated by the new setting (`batchSettingsFingerprint`), or an old preview would apply under stale settings.
7. Copy is user-initiated, read-only, and never sends data anywhere except the system clipboard (no network, no telemetry).
8. No ESLint overrides; `minAppVersion` stays 1.13.0; no Node/Electron-only APIs.

## 3. Shared policy (do not fork)

- "No usable H1" is exactly the existing condition: `extractFirstH1` returns `h1 === null` (no H1, or only empty H1s). An H1 that exists but sanitizes to empty is still `empty-after-sanitize` — the title is **not** used then (H1 wins, invariant 1).
- The title substitutes for `{{h1}}` in the name template. No new template token.

## 4. Feature 7 — Copy button

- `ActivityModal` gets a **Copy** button (below the title, above the list) shown only when there are entries (the empty state already returns early).
- **Format:** plain text, one line per entry, newest first — exactly the row text the modal already renders (`time  [source]  path  result`), joined with `\n`. The row formatter moves to a pure function in `activity-log.ts` (`formatActivityEntry`, `formatActivityText`) shared by the modal and the button, so the copied text can never drift from what is on screen. Time uses the same `toLocaleTimeString()` as the rows (locale-following, local time).
- **Clipboard write:** `navigator.clipboard.writeText(text)` called directly and synchronously in the click handler (preserves user activation; the text is a snapshot taken at that moment, so it equals the rows on screen). Both a missing `navigator.clipboard`/`writeText` and a rejected promise are caught and show the same neutral failure notice (no guess at the cause); **no** `document.execCommand('copy')` fallback (deprecated) and no Node/Electron `clipboard`. The list text stays selectable, so manual copy remains possible.
- **Feedback:** success notice `H1Aligner: copied {count} activity entries`; failure notice `H1Aligner: could not copy to the clipboard`. en / zh-TW / ja.
- **Support claim:** the code is feature-detected and best-effort. Mobile support is claimed only after the on-device check (MOBILE-TESTING) passes; if it fails on a platform, the README says so instead. Verified against Obsidian's *Submission requirements* page: it lists `navigator.clipboard.readText()`/`writeText()` as the **Web API alternatives** to Node/Electron clipboard modules (recommended for mobile compatibility), not as APIs that force `isDesktopOnly`; `manifest.json` stays as is.
- **Privacy:** the log contains note paths and new names. It is copied only when the user presses the button; README's privacy paragraph gets one sentence saying so.
- Button uses Obsidian's default button styling; no new CSS unless the layout needs a margin (`styles.css`, class `h1aligner-activity-copy`).

## 5. Feature 8 — frontmatter `title` fallback

- **Setting:** `useFrontmatterTitle: boolean`, default `false`. Name "Use frontmatter title when there is no H1"; desc: "Off: notes without a first H1 are skipped. On: such notes are renamed from the `title` property in their frontmatter. A note that has a first H1 always uses the H1." (en / zh-TW / ja). Placed in the Naming group after the template field. Declarative Settings API, toggle.
- **Field:** fixed `title` (not configurable). Rationale: Obsidian's own default title property; a configurable key adds a second free-text setting and validation for little value. Revisit on demand.
- **Value handling** (pure `normalizeTitleValue(v: unknown): string | null`): only a `string` counts; collapse every JavaScript `\s` run (includes newlines and Unicode spaces such as U+00A0/U+3000) to one space and trim; empty → `null` (unusable). Arrays, numbers, booleans, objects, null → `null`. (`title: 2025` is a YAML number and is ignored — the conservative choice; the user can quote it.)
- **Source & freshness (bounded policy = parity with the H1 path):** read `cache.frontmatter.title` from `metadataCache`. The existing H1 path already trusts `cache.headings` (raw content is read only when the cache has no usable H1, or for the lock check), so a title read from the same cache entry has exactly the same freshness profile per path: *manual / file-open / leave* use the cache as of that moment; *edit* waits the edit debounce (default 2 s) after the last change. An unpopulated cache yields no title, so the note is skipped as `no-h1` — the safe direction. A stale cache can at worst produce the *previous* title, which the next evaluation corrects; Undo covers an unnoticed wrong rename. Unlike the lock (a safety guard, hence its raw-content re-check) this is a naming choice, so no raw-content YAML parser is added. The stale and unpopulated cases are pinned by tests (§7).
- **Where:** `RenameService.runRename` — after `extractFirstH1` returns `null` and only when the setting is on, use `normalizeTitleValue(cache?.frontmatter?.title)`; everything downstream (template, sanitize, same-name, collision, rename) is unchanged. `RenameOutcome` gains `nameSource?: 'title'` (absent = H1) so Explain can say where the name came from.
- **Triggers:** unchanged. Editing frontmatter fires `editor-change`, so the `edit`/`both` triggers pick it up through the existing debounce; `leave`/`file-open`/manual work as before.
- **Interactions:** alias-preserve and tag-move are independent (they write `aliases`/`tags`, never `title`). Lock/scope/exclude/pause as in invariant 5. Batch/folder preview rows are unchanged (they show `from → to`); `batchSettingsFingerprint` includes the new key.
- **Explain (batch 2 feature):** would-rename from a title says so: `H1Aligner: {path} would be renamed → {name} (from the frontmatter title)`; the zh-TW / ja strings say the name is *taken from* the title property (not that the note is edited). The `no-h1` skip text is unchanged; a note whose H1 exists but sanitizes to empty keeps `empty-after-sanitize` (distinct from "no usable H1") and is covered by a test.
- **Settings plumbing (first new setting since batch 1; two known silent-failure traps):** the key must be added to `H1AlignerSettings`, `DEFAULT_SETTINGS`, `normalizeSettings` (boolean check, wrong type → default), `batchSettingsFingerprint`, `getSettingDefinitions`, and `setControlValue` (case + `saveSettings`). Two regression tests: (1) every `DEFAULT_SETTINGS` key survives `normalizeSettings` when set to a non-default valid value; (2) every settings-tab control key changes `plugin.settings` via `setControlValue`.
- **Mobile:** nothing platform-specific; the toggle uses the same declarative control as the others.

## 6. i18n (en / zh-TW / ja)

New keys (placeholders identical across locales): `activity.copy`, `activity.copied` (`{count}`), `activity.copyFailed`, `set.fmTitle.name`, `set.fmTitle.desc` (states plainly: applies only when there is no usable first H1; a present first H1 always wins), `explain.wouldRenameFromTitle` (`{path}`, `{name}`).

## 7. Tests

- Unit: `formatActivityEntry`/`formatActivityText` (renamed with/without detail, skipped with/without detail, order, empty); `normalizeTitleValue` (string, padded, multi-line, empty, whitespace-only, array, number, boolean, object, null/undefined); `runRename` with the setting on/off × H1 present/absent × title valid/invalid (H1 wins; off → `no-h1`; empty-after-sanitize with H1 does not fall back; template `{{date}} {{h1}}` uses the title; collision/same-name unchanged); `normalizeSettings` boolean handling; fingerprint changes with the setting; the two settings-plumbing regression tests; Explain wording for a title-sourced rename; i18n key parity (existing test).
- E2E against production `main.js`: Copy with `navigator.clipboard` succeeding (text equals the modal rows, success notice), rejecting and missing (failure notice, no throw); title fallback rename via manual command and via `edit` trigger with the setting on, skip with it off; the setting persisting through `setControlValue` → `saveData` → `loadSettings`; Explain says "from the frontmatter title". The harness fakes are modelled on `navigator.clipboard.writeText` (Promise<void>) as typed in the DOM lib.
- Unit / integration additions from review: a title-sourced rename whose result equals the current filename returns `same-name` (no second rename, no repeated activity entry); stale-title and unpopulated-cache cases for manual and edit paths; title fallback + alias-preserve + tag-move together under the `edit` trigger produce exactly one rename and no reprocessing loop; batch **and** folder preview are both invalidated by the new setting.
- Mobile checklist (`docs/MOBILE-TESTING.md`, from #20): Copy on device (paste elsewhere), title fallback on/off, setting survives an Obsidian restart, loading 0.12.0's `data.json` into the batch-3 build.

## 8. Branch and CHANGELOG convention

0.13.0 (batch 2) is released from `main`; batch 3 then syncs with `git merge origin/main`. A section inserted next to `## Unreleased` conflicts with the release commit that renames that heading (verified with a scratch merge). Convention for batch 3: **do not touch `CHANGELOG.md`, `package.json`, `manifest.json`, `versions.json`** on this branch; keep the 0.14.0 notes in `docs/changelog-batch3-draft.md` (under version control, opening with the intended `## Unreleased` heading, clearly marked as a draft) and move them into a new `## Unreleased` section of `CHANGELOG.md` in the first commit after syncing the 0.13.0 release. README feature/setting text is edited normally; its test-count lines are updated on this branch too (a mechanical conflict on those lines at sync time is resolved by taking batch 3's numbers).

## 9. Non-goals

- `KeyedDebouncer` clock injection: pure refactor with no user-visible effect; the existing debounce tests use fake timers; excluded from 0.14.0 to keep the release small. Recorded as remaining tech debt.
- A configurable title property name; treating numbers as titles; a new template token; changing the `no-h1` skip wording; copying in formats other than plain text; a fallback `document.execCommand` clipboard path.

## 10. Decision log

### Round 1 (2026-09-30)

`docs/pplx/2026-09-30-batch3-design-r1-request.md` → `-r1.md` (Sonar, ≤3 tool calls). Verdict **revise** — 3 blocking (all addressed above): (1) cache-only freshness argument → replaced by the per-path parity policy plus stale/unpopulated tests; (2) harness fake cannot prove mobile clipboard → mobile support is claimed only after the on-device check; (3) same-name/loop invariant to be demonstrated → tests added. PPLX's claim that Obsidian's submission page forces `isDesktopOnly` for `navigator.clipboard` was **checked against the page** and is a misreading (the page lists them as Web API alternatives to Node/Electron); no manifest change. Non-blocking suggestions adopted: neutral failure notice, direct synchronous call, snapshot/order, `\s` definition, draft changelog under version control, distinct wording for empty-H1 vs no-H1, integration test with alias + tag mover, both previews invalidated. Clock injection out of scope: PPLX agrees.

## Output

verdict: **revise**

**Blocking issues**

1. **Stale cached titles are not guaranteed to be corrected by the next evaluation.** The design says a stale title can cause a temporary wrong rename that “the next evaluation corrects,” but a rename may move the file and change the cache entry/path used by later evaluations. It may also produce `same-name` on the next pass, leaving the filename derived from the stale title unchanged. The new stale-cache tests should establish the actual behavior end to end, including after rename; otherwise, either avoid renaming from a title when freshness cannot be established or remove the claim that the next evaluation corrects it and define the accepted stale-title behavior explicitly.

2. **The edit-trigger freshness claim needs to be verified for frontmatter-only edits.** The design relies on such edits firing `editor-change` and on the debounced evaluation seeing an updated `cache.frontmatter.title`. The proposed harness tests need to demonstrate both the trigger and the cache update ordering against the production path. If the cache can still lag at evaluation time, the “edit waits 2 s” argument does not establish freshness.

**Non-blocking suggestions**

- State explicitly whether a stale title may legitimately cause a rename that is not automatically reversed. That makes the bounded-cache policy easier for users and future maintainers to understand.
- In the clipboard E2E tests, assert the exact copied string including timestamp formatting and newest-first order, not just equality with the rendered rows; this guards against both paths drifting together if the format changes unintentionally.

**Facts verified vs. could not**

- I treated the correction about Obsidian’s submission-requirements page as settled as requested; I do not have a contrary direct quote.
- The design’s proposed tests are not results. I could not verify the actual metadata-cache update behavior, `editor-change` ordering, post-rename behavior with a stale title, or the mobile clipboard check from this document alone.
