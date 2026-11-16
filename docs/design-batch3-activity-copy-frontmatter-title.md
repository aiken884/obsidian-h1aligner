# Design Document: Activity Copy button, frontmatter `title` fallback (batch 3)

Date: 2026-09-30  Status: **PPLX consensus reached in round 3 (§10); implemented on `feature/0.12.0-batch3` (features 7 and 8 done; adversarial review done, see `docs/review-batch3.md`; on-device testing MOBILE-TESTING #20–#23 still pending — required before bumping the version) (branched from `feature/0.12.0-batch2`); target release 0.14.0 (after 0.13.0).**
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
- **Source & freshness (revised 2026-11-16b after Mac on-device #22): the open editor's buffer, else the disk — never `metadataCache`.** Real Obsidian (Mac, 1.15.1) timeline with `edit` trigger and the default 2000 ms debounce, 4/4 trials: `editor-change` @2–3 ms → **plugin rename @2005–2007 ms** → Obsidian autosave `vault.modify` @2008–2013 ms → `metadataCache` `changed` @2008–2014 ms. The plugin's debounce expires *before the file is saved*, so both the cache and the **disk** still hold the previous title at rename time; the 2026-11-16 first fix (`vault.read`) therefore could not help the edit trigger (it only helps when the autosave has already run, e.g. a 3000 ms debounce). Now: when the setting is on and the cache has no usable H1, `runRename` takes one content snapshot — `getEditorContent(file)` (the `MarkdownView.editor.getValue()` of any markdown leaf showing that file, via `workspace.getLeavesOfType('markdown')`, duck-typed; injected into `RenameService` as a constructor function) and, only if the file is not open in an editor, `vault.read` (disk). That one snapshot serves the H1 scan, the lock re-check and the title. The title is parsed with Obsidian's `parseYaml` (leading `---` block, same dialect as the lock scan; parse error / non-mapping → no title). An unreadable file yields no title (`no-h1`, no write). Other paths (cache has a usable H1, or setting off) are unchanged and never touch the editor. Not yet device-verified: that the buffer is really ahead of disk/cache at debounce time in every case (#22 on Mac, 2000/1000/500 ms, open and not open). A residual, pre-existing asymmetry is left as is: a stale cache that *still lists* an H1 the file no longer has keeps the H1 path on the cached heading, as in 0.12/0.13.
- **Where:** `RenameService.runRename` — after `extractFirstH1` returns `null` and only when the setting is on, use `extractFrontmatterTitle(content, parseYaml)` (then `normalizeTitleValue`); everything downstream (template, sanitize, same-name, collision, rename) is unchanged. `RenameOutcome` gains `nameSource?: 'title'` (absent = H1) so Explain can say where the name came from.
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
- The freshness tests (revised 2026-11-16b): (a) cache AND disk hold the previous title, the editor buffer the new one → renames to the new title (the real #22 timeline); (b) file not open in an editor, disk newer than the cache → the disk title (as 288054f); (c) the buffer is not consulted when the cache has a usable H1 or the setting is off; (d) the lock check uses the same buffer snapshot; (e) the cache has a title the content lacks → `no-h1`; (f) a read failure → `no-h1`, no write; (g) `extractFrontmatterTitle` unit cases (BOM/CRLF, no/unclosed block, parser throws, non-mapping, non-string); (h) `getEditorContent` unit cases (leaf matches by path, not open, view not loaded). E2E against the production bundle: editor-change with disk and cache stale but the editor buffer new → one rename to the new title; not open → disk. The fakes cannot prove real Obsidian's ordering; that is #22 on device. The test YAML parser is a simplification (comments, single quotes, block scalars, dates, syntax errors, duplicate keys are device-verified).
- Clipboard E2E asserts the **exact** copied string (a fixed clock/locale so the timestamp text is known, newest-first order, `\n` joins), not merely equality with the rendered rows.
- Unit / integration additions from review: a title-sourced rename whose result equals the current filename returns `same-name` (no second rename, no repeated activity entry); stale-title and unpopulated-cache cases for manual and edit paths; title fallback + alias-preserve + tag-move together under the `edit` trigger produce exactly one rename and no reprocessing loop; batch **and** folder preview are both invalidated by the new setting.
- Mobile checklist (`docs/MOBILE-TESTING.md`, from #20): Copy on device (paste elsewhere), title fallback on/off, setting survives an Obsidian restart, loading 0.12.0's `data.json` into the batch-3 build.

## 8. Branch and CHANGELOG convention

0.13.0 (batch 2) is released from `main`; batch 3 then syncs with `git merge origin/main`. A section inserted next to `## Unreleased` conflicts with the release commit that renames that heading (verified with a scratch merge). Convention for batch 3: **do not touch `CHANGELOG.md`, `package.json`, `manifest.json`, `versions.json`** on this branch; keep the 0.14.0 notes in `docs/changelog-batch3-draft.md` (under version control, opening with the intended `## Unreleased` heading, clearly marked as a draft) and move them into a new `## Unreleased` section of `CHANGELOG.md` in the first commit after syncing the 0.13.0 release. README feature/setting text is edited normally; its test-count lines are updated on this branch too (a mechanical conflict on those lines at sync time is resolved by taking batch 3's numbers).

## 9. Non-goals

- `KeyedDebouncer` clock injection: pure refactor with no user-visible effect; the existing debounce tests use fake timers; excluded from 0.14.0 to keep the release small. Recorded as remaining tech debt.
- A configurable title property name; treating numbers as titles; a new template token; changing the `no-h1` skip wording; copying in formats other than plain text; a fallback `document.execCommand` clipboard path.

## 10. Decision log

### Round 1 (2026-09-30)

`docs/pplx/2026-09-30-batch3-design-r1-request.md` → `-r1.md` (Sonar, ≤3 tool calls). Verdict **revise** — 3 blocking (all addressed above): (1) cache-only freshness argument → replaced by the per-path parity policy plus stale/unpopulated tests; (2) harness fake cannot prove mobile clipboard → mobile support is claimed only after the on-device check; (3) same-name/loop invariant to be demonstrated → tests added. PPLX's claim that Obsidian's submission page forces `isDesktopOnly` for `navigator.clipboard` was **checked against the page** and is a misreading (the page lists them as Web API alternatives to Node/Electron); no manifest change. Round 2 (`-r2-request.md` → `-r2.md`, Sonar no tools): verdict revise, 2 blocking, both about the stale-title claim — the wording "the next evaluation corrects" was too strong, so §5 now states the accepted behavior explicitly (rename from the previous title is possible and not reversed until the next evaluation; Undo available; parity with the H1 path) and §7 pins the stale → rename → fresh → re-rename sequence and the edit-trigger ordering. Non-blocking: exact-string clipboard assertion adopted. Round-1 non-blocking suggestions adopted: neutral failure notice, direct synchronous call, snapshot/order, `\s` definition, draft changelog under version control, distinct wording for empty-H1 vs no-H1, integration test with alias + tag mover, both previews invalidated. Clock injection out of scope: PPLX agrees.

### Round 3 (2026-09-30)

`-r3-request.md` → `-r3.md` (Sonar, no tools): verdict **approve**, no blocking. Consensus reached. Non-blocking, adopted: the on-device check is a release gate for the edit-trigger ordering assumption (if real Obsidian orders the frontmatter-only edit and the cache update differently, the freshness policy is revisited); the accepted stale-title behavior is stated in user-facing text (README and the setting description mention that a rename uses the cached title and Undo reverts it).

### Revision 2026-11-16 (Mac on-device #22)

Aiken approved the fix. Finding: with `edit` trigger and 2000 ms debounce, a frontmatter-only title edit was renamed from the previous title in 4/4 trials (rename at ~2005 ms, `metadataCache` changed 3–7 ms later; the debounce and Obsidian's autosave expire together) and nothing re-evaluated afterwards. The round-1/2 "accepted stale-title behavior" (decision B4) is withdrawn: the title is now parsed from the file's current content (`vault.read` + `parseYaml`), so the freshness of the cache no longer matters for titles. The H1 path is untouched. Also from the same Mac run: the activity list had `user-select: none`, so the README's "select by hand" fallback did not work on desktop; the list now carries `h1aligner-activity-list` with `user-select: text`.

### Revision 2026-11-16b (Mac #22: disk-only read is not enough)

Mac measured the full timeline (see §5): the plugin renames @2005–2007 ms, *before* Obsidian's autosave (@2008–2013 ms), so the disk is still old at that moment, not only the cache. 288054f's `vault.read` could not fix the edit trigger, and its unit/E2E fakes (`read()` returning the latest content) hid that. Approved fix (Aiken): prefer the open editor's buffer, fall back to the disk when the note is not open; the content source is an injected function; the fakes now model "disk old, cache old, buffer new". User-facing text (CHANGELOG, README, setting description) is deliberately conservative until device verification passes. Also: `vitest.config.ts` alias uses `fileURLToPath` (paths with spaces/non-ASCII), and the test YAML parsers are labelled as simplified.

### Decisions

| # | Decision | Final |
|---|---|---|
| B1 | Copy format | plain text, row text as displayed, newest first, `\n`-joined; shared pure formatter |
| B2 | Clipboard | `navigator.clipboard.writeText` directly in the click handler; neutral failure notice; no `execCommand`; mobile support claimed only after device check; manifest unchanged |
| B3 | Title key / values | fixed `title`; strings only; `\s` runs collapsed; H1 always wins; empty-H1 stays `empty-after-sanitize` |
| B4 | Title freshness | **revised 2026-11-16b:** open editor buffer, else disk (`vault.read`), parsed with `parseYaml`; never the cache; stale-title rename no longer accepted (was: cache only, parity with H1 path; 2026-11-16 disk-only was insufficient) |
| B5 | Setting | `useFrontmatterTitle`, default off, all six plumbing places + two regression tests; included in `batchSettingsFingerprint` |
| B6 | Branch convention | batch 3 leaves CHANGELOG/package/manifest/versions untouched; notes in `docs/changelog-batch3-draft.md` |
| B7 | Scope | clock injection excluded (tech debt) |

Changes to released 0.12.0 behavior: none (feature is opt-in, default off).
