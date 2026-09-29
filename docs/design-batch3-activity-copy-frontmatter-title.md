# Design Document: Activity Copy button, frontmatter `title` fallback (batch 3)

Date: 2026-09-30  Status: **Proposed on `feature/0.12.0-batch3` (branched from `feature/0.12.0-batch2`); target release 0.14.0 (after 0.13.0). Not implemented until the PPLX consensus in §10 is recorded.**
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
- **Clipboard write:** `navigator.clipboard.writeText(text)` from the click handler (a user gesture). On failure (API missing or promise rejects) show a notice; **no** `document.execCommand('copy')` fallback (deprecated) and no Node/Electron `clipboard`. The list text stays selectable, so manual copy remains possible.
- **Feedback:** success notice `H1Aligner: copied {count} activity entries`; failure notice `H1Aligner: could not copy to the clipboard`. en / zh-TW / ja.
- **Privacy:** the log contains note paths and new names. It is copied only when the user presses the button; README's privacy paragraph gets one sentence saying so.
- Button uses Obsidian's default button styling; no new CSS unless the layout needs a margin (`styles.css`, class `h1aligner-activity-copy`).

## 5. Feature 8 — frontmatter `title` fallback

- **Setting:** `useFrontmatterTitle: boolean`, default `false`. Name "Use frontmatter title when there is no H1"; desc: "Off: notes without a first H1 are skipped. On: such notes are renamed from the `title` property in their frontmatter. A note that has a first H1 always uses the H1." (en / zh-TW / ja). Placed in the Naming group after the template field. Declarative Settings API, toggle.
- **Field:** fixed `title` (not configurable). Rationale: Obsidian's own default title property; a configurable key adds a second free-text setting and validation for little value. Revisit on demand.
- **Value handling** (pure `normalizeTitleValue(v: unknown): string | null`): only a `string` counts; collapse every whitespace run (including newlines) to one space and trim; empty → `null` (unusable). Arrays, numbers, booleans, objects, null → `null`. (`title: 2025` is a YAML number and is ignored — the conservative choice; the user can quote it.)
- **Source & staleness:** read `cache.frontmatter.title` from `metadataCache`. Unlike the lock (a safety guard, hence its raw-content re-check), a stale title can only yield the *previous* title, and the next `editor-change` / open re-evaluates; an unpopulated cache yields no title and the note is skipped (`no-h1`), the safe direction. Undo remains available.
- **Where:** `RenameService.runRename` — after `extractFirstH1` returns `null` and only when the setting is on, use `normalizeTitleValue(cache?.frontmatter?.title)`; everything downstream (template, sanitize, same-name, collision, rename) is unchanged. `RenameOutcome` gains `nameSource?: 'title'` (absent = H1) so Explain can say where the name came from.
- **Triggers:** unchanged. Editing frontmatter fires `editor-change`, so the `edit`/`both` triggers pick it up through the existing debounce; `leave`/`file-open`/manual work as before.
- **Interactions:** alias-preserve and tag-move are independent (they write `aliases`/`tags`, never `title`). Lock/scope/exclude/pause as in invariant 5. Batch/folder preview rows are unchanged (they show `from → to`); `batchSettingsFingerprint` includes the new key.
- **Explain (batch 2 feature):** would-rename from a title says so: `H1Aligner: {path} would be renamed → {name} (from the frontmatter title)`. The `no-h1` skip text is unchanged.
- **Settings plumbing (first new setting since batch 1; two known silent-failure traps):** the key must be added to `H1AlignerSettings`, `DEFAULT_SETTINGS`, `normalizeSettings` (boolean check, wrong type → default), `batchSettingsFingerprint`, `getSettingDefinitions`, and `setControlValue` (case + `saveSettings`). Two regression tests: (1) every `DEFAULT_SETTINGS` key survives `normalizeSettings` when set to a non-default valid value; (2) every settings-tab control key changes `plugin.settings` via `setControlValue`.
- **Mobile:** nothing platform-specific; the toggle uses the same declarative control as the others.

## 6. i18n (en / zh-TW / ja)

New keys (placeholders identical across locales): `activity.copy`, `activity.copied` (`{count}`), `activity.copyFailed`, `set.fmTitle.name`, `set.fmTitle.desc`, `explain.wouldRenameFromTitle` (`{path}`, `{name}`).

## 7. Tests

- Unit: `formatActivityEntry`/`formatActivityText` (renamed with/without detail, skipped with/without detail, order, empty); `normalizeTitleValue` (string, padded, multi-line, empty, whitespace-only, array, number, boolean, object, null/undefined); `runRename` with the setting on/off × H1 present/absent × title valid/invalid (H1 wins; off → `no-h1`; empty-after-sanitize with H1 does not fall back; template `{{date}} {{h1}}` uses the title; collision/same-name unchanged); `normalizeSettings` boolean handling; fingerprint changes with the setting; the two settings-plumbing regression tests; Explain wording for a title-sourced rename; i18n key parity (existing test).
- E2E against production `main.js`: Copy with `navigator.clipboard` succeeding (text equals the modal rows, success notice), rejecting and missing (failure notice, no throw); title fallback rename via manual command and via `edit` trigger with the setting on, skip with it off; the setting persisting through `setControlValue` → `saveData` → `loadSettings`; Explain says "from the frontmatter title". The harness fakes are modelled on `navigator.clipboard.writeText` (Promise<void>) as typed in the DOM lib.
- Mobile checklist (`docs/MOBILE-TESTING.md`, from #20): Copy on device (paste elsewhere), title fallback on/off, setting survives an Obsidian restart, loading 0.12.0's `data.json` into the batch-3 build.

## 8. Branch and CHANGELOG convention

0.13.0 (batch 2) is released from `main`; batch 3 then syncs with `git merge origin/main`. A section inserted next to `## Unreleased` conflicts with the release commit that renames that heading (verified with a scratch merge). Convention for batch 3: **do not touch `CHANGELOG.md`, `package.json`, `manifest.json`, `versions.json`** on this branch; keep the 0.14.0 notes in `docs/changelog-batch3-draft.md` and move them into a new `## Unreleased` section of `CHANGELOG.md` in the first commit after syncing the 0.13.0 release. README feature/setting text is edited normally; its test-count lines are updated on this branch too (a mechanical conflict on those lines at sync time is resolved by taking batch 3's numbers).

## 9. Non-goals

- `KeyedDebouncer` clock injection: pure refactor with no user-visible effect; the existing debounce tests use fake timers; excluded from 0.14.0 to keep the release small. Recorded as remaining tech debt.
- A configurable title property name; treating numbers as titles; a new template token; changing the `no-h1` skip wording; copying in formats other than plain text; a fallback `document.execCommand` clipboard path.

## 10. Decision log

(Filled after PPLX review.)
