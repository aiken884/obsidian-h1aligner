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
pplx_tokens: 12370
pplx_latency_sec: 14.40
---

# PPLX Agent API Output

## Query

# Review request: H1Aligner batch 3 design — round 1

You are reviewing a design for **H1Aligner**, an Obsidian community plugin (id `heading-aligner`, public repo `aiken884/obsidian-h1aligner`) that renames a note's file to match its first H1. 0.12.0 is released; 0.13.0 (batch 2: Explain this note, out-of-scope count, folder what-if preview) is being prepared; the design below is batch 3 (0.14.0). `minAppVersion` is 1.13.0 (Obsidian desktop and mobile).

Please review the whole design document below. Specific questions:

1. **Clipboard (please use web search, at most 3 lookups):** Is `navigator.clipboard.writeText` reliably available and permitted from a button click handler in an Obsidian plugin on desktop (Electron), iOS and Android (mobile WebView)? Known failure modes (permissions, focus, secure context)? Is "notice on failure, no `document.execCommand` fallback" acceptable, or should a fallback be added? Are there Obsidian-specific guidelines (community plugin review) about clipboard use?
2. **Frontmatter title:** the value-handling rules (strings only, whitespace collapsed, numbers ignored), reading from `metadataCache` without a raw-content re-check (argument in §5), fixed key `title`, H1-always-wins, and the Explain wording. Any hole in the invariants (§2)? Any interaction with the tag mover / alias features or with the `edit` trigger that could cause rename loops or surprising renames?
3. **Branch / CHANGELOG convention (§8):** a scratch merge showed that inserting a section next to `## Unreleased` conflicts with the release commit that renames that heading. Is keeping the 0.14.0 notes in a draft file until after syncing 0.13.0 a sound convention, or is there a better low-risk one?
4. **Scope:** is excluding the `KeyedDebouncer` clock-injection refactor from 0.14.0 reasonable?

Constraints: no ESLint overrides; no Node/Electron-only APIs; UI text in en / zh-TW / ja; sentence case; everything opt-in stays off by default; any decision changing released 0.12.0 behavior is flagged for maintainer review (this design changes none).

Answer in this format: `verdict: approve | revise`; **blocking issues**; **non-blocking suggestions** (including three-language wording); and a list of **API facts you verified vs. could not verify** (say which is which — do not assert unverified facts).

---

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

## Search queries triggered

- Obsidian plugin developer clipboard navigator.clipboard writeText clipboard API
- navigator.clipboard.writeText Electron renderer secure context permissions user gesture
- WKWebView navigator.clipboard.writeText iOS Android WebView clipboard API user gesture permissions
## Output

verdict: revise

## Blocking issues

1. **The fallback’s cache-only premise is not a sufficient safety argument.** A missing or stale metadata cache can make a rename skip or use an old title, but “the next editor-change / open re-evaluates” does not guarantee recovery: the relevant event may not occur, and the old title may still be cached when it does. Undo helps only if the user notices and acts. Before approving automatic title-based renames, define how cache readiness and freshness are established for each rename path—or make the feature’s safety contract explicit and provide a reliable way to correct an unintended rename. Add tests for a stale title and an unpopulated cache, including manual and edit-trigger paths. Do not add a raw-content parser casually; instead verify the actual Obsidian metadata-cache lifecycle and choose a bounded policy.

2. **The planned mobile Copy E2E test does not establish mobile clipboard support.** A harness fake proves only that the code handles a Promise-shaped API. The search results support using `navigator.clipboard` rather than Node/Electron APIs, but do not establish reliable availability or behavior in Obsidian’s iOS and Android WebViews. Keep the runtime feature detection and failure notice; require device testing before claiming mobile support. Calling `writeText` directly and synchronously in the click handler is appropriate. There is no demonstrated need for a deprecated `execCommand` fallback; a manual-copy path is available. The failure notice should not imply whether the API is absent, permission-denied, or rejected.

3. **The title fallback needs an explicit policy for trimmed titles that normalize to the current filename.** Idempotence is stated, but test coverage should verify that a title-sourced rename whose normalized/template output already matches the filename returns `same-name`, without repeated activity or a rename loop—especially when an edit trigger processes frontmatter written by other features. This is likely covered by shared downstream logic, but the invariant should be demonstrated, not assumed.

## Non-blocking suggestions

- **Clipboard and review guidance:** The search found Obsidian’s submission requirements explicitly listing `navigator.clipboard.readText()` and `writeText()` among APIs that require `isDesktopOnly: true`. That appears incompatible with the stated mobile target. Verify the current requirement with maintainers or the plugin-review process before shipping; do not silently change the manifest. The same search also found Obsidian documentation recommending the Web API over Node clipboard APIs. A user-clicked write-only action with no network use is a reasonable design, but the search did not verify actual iOS/Android Obsidian behavior or guarantee that every desktop Electron context is a secure context.
- **Clipboard implementation:** Catch both a missing `navigator.clipboard`/`writeText` and promise rejection; invoke the API before any asynchronous work in the handler, to preserve transient user activation. The proposed behavior—notice on failure and no `execCommand` fallback—is acceptable if documented as best-effort and the manual-selection option is usable. Consider ensuring copied rows and displayed rows use the same snapshot/order if entries can change while the modal is open.
- **Frontmatter details:** Fixed key `title`, strings-only handling, whitespace normalization, and H1 precedence are coherent. Consider specifying exactly which whitespace characters are collapsed, and whether Unicode whitespace is included. Keep the “empty H1 does not fall back” behavior prominent in tests and Explain/skip wording so the distinction from “no usable H1” is not surprising.
- **Interactions:** The stated independence from aliases and tag movement is plausible if those features only write their own properties. Add an integration test in which title fallback, alias preservation, and tag movement run together under the `edit` trigger, confirming that writes do not cause repeated renames. Ensure the trigger’s own file-modification handling does not reprocess the note indefinitely. The fingerprint addition is important; verify both batch and folder preview invalidation.
- **CHANGELOG:** A draft file until the 0.13.0 release is synced is a sound, low-risk convention if the draft is clearly marked and the first post-sync commit moves it into `CHANGELOG.md`. To reduce loss or ambiguity, keep the draft under version control and include the intended heading/date in it. An alternative is to append batch 3 notes under a separate, stable heading that the release commit does not rename, but that may leave the changelog ordering less clear; the proposed draft convention is preferable to knowingly conflict-prone edits.
- **Scope:** Excluding clock injection is reasonable. It is tech debt with no user-visible effect, and the existing fake-timer tests reduce the urgency.
- **Three-language wording:** Keep sentence case and make all three locales distinguish “no H1” from “an H1 that is empty after sanitizing.” For the setting, say plainly that the fallback applies only when there is no usable first H1, and that a present first H1 takes precedence. For copy failure, prefer a neutral equivalent of “Could not copy to clipboard” rather than implying a permission cause. Preserve `{count}`, `{path}`, and `{name}` exactly across en / zh-TW / ja. “From the frontmatter title” should be natural in each locale, not a literal translation that suggests the note content was edited.

## API facts verified vs. could not verify

**Verified from the web search results:**
- Obsidian’s submission-requirements page lists `navigator.clipboard.readText()` and `navigator.clipboard.writeText()` as APIs requiring `isDesktopOnly: true`.
- Obsidian developer guidance found in the search results recommends `navigator.clipboard` APIs instead of Node/Electron clipboard modules.
- The Clipboard API is limited to secure contexts, and `writeText` can be rejected when access is not permitted; user activation is relevant to clipboard writes.
- Electron’s current documentation says renderer code should use the Web Clipboard API rather than direct Electron clipboard access.
- These findings support a direct, click-initiated Web API call with caught failures, but do not prove reliable operation in every target environment.

**Not verified:**
- That `navigator.clipboard.writeText` is consistently present and succeeds in Obsidian desktop across supported versions/configurations.
- That it is available and succeeds in Obsidian’s iOS and Android WebViews, or that Obsidian’s hosting context satisfies the secure-context and focus/permission requirements in all cases.
- The exact current community-plugin-review interpretation of the desktop-only requirement for a plugin that uses clipboard **write** but is intended to support mobile. The cited page’s listing is clear, but its practical application to this particular optional, user-initiated use should be confirmed with maintainers/reviewers.
- The actual Obsidian metadata-cache freshness/readiness guarantees relevant to `cache.frontmatter.title` for manual, open, and edit-trigger renames.

## Citations

- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard
- https://docs.obsidian.md/community-directory/submission-requirements-for-plugins
- https://deepwiki.com/obsidianmd/obsidian-developer-docs/2.2-plugin-guidelines-and-best-practices
- https://deepwiki.com/obsidianmd/obsidian-developer-docs/2.6-mobile-development
- https://community.obsidian.md/plugins/gemmanotes
- https://docs.w3cub.com/dom/clipboard/writetext.html
- https://clipboardinspector.com/blog/clipboard-api-mobile-browsers/
- https://www.mironsoft.de/en/blog/javascript-clipboard-api-copy-paste-without-execcommand
- https://community.obsidian.md/plugins/mq
- https://community.obsidian.md/plugins/redirect-link-https-to-local
- https://community.obsidian.md/plugins/ai-agent-panel
- https://community.obsidian.md/plugins/sillage
- https://raw.githubusercontent.com/electron/electron/main/docs/breaking-changes.md
- https://developer.adobe.com/xd/uxp/uxp/reference-js/Global%20Members/Data%20Transfers/Clipboard/
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/clipboard
