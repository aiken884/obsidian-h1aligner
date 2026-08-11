# Changelog

Published on the Obsidian Community Plugins directory; versioning follows SemVer.

## 0.11.1 — 2026-08-12
- **Fix**: 0.11.0 failed the Obsidian community-plugin directory's automated review and was pulled from the listing ("Uses Obsidian APIs newer than the declared minAppVersion", flagging `SettingGroup#listEl`/`PluginSettingTab#getControlValue`/`SettingTab#refreshDomState` calls in `settings-tab.ts`). Those calls are only ever reached at runtime on Obsidian 1.13.0+ (the version Obsidian itself must be running to call `getSettingDefinitions()` in the first place), so they were safe in practice — but `manifest.json`'s `minAppVersion` still declared `1.8.7`, and the review's static check doesn't reason about runtime reachability, only about what APIs the source references versus what version is declared. (A local ESLint override had been silencing the equivalent warning in this repo's own `npm run lint` for the same reason — masking exactly the mismatch the official review caught. Removed; this repo's policy going forward is that no rule mirroring an external/official check gets locally overridden — see RELEASING.md.)

  Fixed by raising `minAppVersion` to `1.13.0` and removing the `display()` imperative fallback entirely — Obsidian's own docs recommend this once you can afford to drop pre-1.13.0 support, and doing so also closes off the settings-drift risk of maintaining two hand-synced rendering paths. The settings page now has exactly one implementation, the declarative Settings API. Obsidian 1.13.0 shipped 2026-05-28; users on older versions won't be offered this update (they'll stay on 0.10.0, which remains correctly listed as compatible down to 1.8.7).

## 0.11.0 — 2026-08-11
- **Fix**: toggling "Move tags to frontmatter" in the settings page (both mobile and desktop — reported via real-device testing, with a screen recording) reset the settings panel's scroll position to the very top, which is jarring on a page this long. The declarative Settings API's `refreshDomState()` is documented as "cheap: toggles CSS state in place, no re-render," but that evidently doesn't guarantee the scroll position survives in practice; the `display()` fallback for Obsidian < 1.13.0 has the same problem for the more obvious reason that it fully empties and rebuilds the settings container. Both paths now record the scroll offset before the change and restore it afterward, regardless of which re-render path ran or why it moved
- **Fix** (found via a third full-project CodeGraph health check plus adversarial verification, targeting previously-unaudited modules — rename-service.ts's core guard layers, batch-modal.ts/history.ts, i18n/scope/notice.ts — plus a skeptical re-check of every fix from the second round; 6 confirmed findings, all fixed):
  - **High severity**: the `h1aligner-lock: true` frontmatter lock could be silently ignored right after being added. The raw-content re-check that exists specifically to catch a stale metadataCache was gated on "does the cache have a usable H1," which is not a valid proxy for "is the cache's frontmatter fresh" — a note whose H1 didn't change but whose frontmatter was just edited to add the lock kept `cacheHasUsableH1 === true`, skipping the re-check entirely. The raw-content lock re-check now runs whenever the lock setting is on, independent of H1 cache freshness
  - The experimental tag-move feature could still write a stale-skipped tag's name into frontmatter even though nothing was actually removed from the note body for it (the staleness guard added in the second health-check round correctly skipped the body edit, but the separate frontmatter-merge step wasn't told which candidates it had skipped). `applyBodyTagRemoval` now reports exactly which candidates were actually removed, and only those are merged into frontmatter
  - The second round's CJK fix to the tag-move staleness guard was still an incomplete, hand-picked inclusion whitelist. Rewritten to match Obsidian's actual (exclusion-based) tag-matching rule, extracted directly from the shipped app bundle: accented Latin, Cyrillic, Greek, fullwidth forms, and CJK punctuation are all valid Obsidian tag content that a narrower guard would have misjudged as a tag boundary
  - The manual-rename command's "skipped" notification showed the raw internal reason code (e.g. literally `no-h1`, `locked`) instead of localized text, even though the batch-preview modal already had a full localized mapping for the exact same reasons — the two now share one implementation (`skip-reason.ts`) so they can't drift again
  - `undoLastRename`: if the top entry on the undo stack failed its identity check (the file was moved/replaced by something else since), undo got permanently stuck showing "moved," since that single bad entry never left the stack and blocked every older, still-valid entry beneath it. It now discards an identity-mismatched entry and falls through to the next one
  - A bug in this session's own second-round fix: the debounce bookkeeping added to guard against the `both`-mode race re-read the file's live path at fire time instead of the path captured when the timer was scheduled, which could orphan a stale map entry if the file was renamed in between. Now captured once and used consistently
- **Fix** (found via a second full-project CodeGraph health check plus adversarial verification, 12 confirmed findings, all fixed):
  - `leave` trigger mode could rename a note the user had already switched back to: the debounced rename of the note just left uses that note's own path as its timer key, so switching straight back to it before the short delay elapsed didn't cancel it, and it could fire while that note was active again — contradicting the mode's own documented guarantee of never touching the note currently being looked at. The fire-time callback now re-checks that the file is not the currently active one before renaming
  - `both` trigger mode: a file-open event on a note already mid-edit (e.g. refocusing a second pane showing the same note) could replace the long, deliberately generous edit-pause debounce with the much shorter file-open delay, since both sources shared one debounce timer keyed only by file path — risking a rename off a half-typed heading. A file-open-sourced reschedule for a file that already has a pending edit-sourced timer is now ignored, letting the edit debounce decide on its own when the file is safe to rename
  - The declarative settings API's `fileOpenDebounceMs`/`editDebounceMs` handlers had dropped the empty-input guard the old `display()` method carried (`Number('')` evaluates to `0` in JS, so clearing the field could silently save a debounce of 0ms) — restored
  - The declarative settings API's `illegalReplacementChar` and `maxFilenameLength` fields silently transformed what the user typed (cleaning to a single character; clamping to 255) without a way to reflect the corrected value back in the field, unlike `display()`, which explicitly echoes it — both fields now use a custom `render` callback matching `display()`'s existing echo-back behavior
  - The experimental tag-move feature's staleness/boundary check (which detects whether a cached tag was extended since caching, e.g. `#tag` → `#tagX`, before acting on it) used an ASCII-only character class, so a tag extended with CJK content — which this feature explicitly treats as valid, first-class tag content — wasn't detected as stale and could be acted on based on out-of-date cached position data. The character class now also recognizes CJK letters
  - `sanitizeFileName()` wasn't guaranteed to return NFC-normalized output, and wasn't idempotent, when `illegalReplacementChar` is a combining Unicode character (e.g. a combining ring), because the one-time NFC pass ran before the replacement character was spliced in rather than after. NFC normalization is now re-applied after the replacement step
  - `sanitizeFileName()`'s control-character stripping covered the C0 block and DEL but not the C1 block (U+0080–U+009F, e.g. NEL); now stripped as well
  - Closed test-coverage gaps found alongside the above: the declarative settings API had zero test coverage anywhere (new `tests/settings-tab.test.ts`, 29 tests); `onboarding-modal.ts`'s "Manual only" and dismiss-without-choosing paths, and `activity-modal.ts`'s empty-log branch, were never exercised (new `tests/onboarding-modal.test.ts`, `tests/activity-modal.test.ts`); the batch-apply race guards (H1-edited-between-preview-and-apply, mid-loop/pre-open staleness aborts, failed-item counter) and `undoLastRename`'s NFC/case-insensitive sibling-occupancy scan had no coverage — the latter because the e2e harness's fake `TFolder` never populated `.children`, now fixed to live-compute it like real Obsidian. E2E scenarios went from 25 to 29, unit tests from 340 to 388
- **Fix**: Corrected `minAppVersion` from 1.8.0 to 1.8.7 — the `getLanguage()` API introduced in 0.9.0 (replacing localStorage) actually requires Obsidian 1.8.7; the previous value of 1.8.0 would let users on Obsidian 1.8.0–1.8.6 mistakenly believe the plugin was compatible and install or update to a version that would break immediately. Retroactively corrected the existing 0.9.0 and 0.10.0 entries in `versions.json` as well (this file is read live by the Obsidian installer, so the fix takes effect without publishing a new release); `manifest.json` was also updated for use in the next release (no new release is being published this time, and the already-published 0.10.0 release assets are left untouched to avoid breaking their build provenance attestation)
- The settings page now uses Obsidian 1.13.0+'s official declarative Settings API (`getSettingDefinitions`/`getControlValue`/`setControlValue`): all 19 settings fields plus the live preview block have been fully migrated, and the `moveTagsToFrontmatter` toggle's sub-field visibility now uses `refreshDomState()` (no longer a full-page re-render, preserving scroll position and focus). The original `display()` method is fully preserved, unchanged, and serves as the fallback path for Obsidian < 1.13.0 (this plugin's minAppVersion is 1.8.7, see the fix above); Obsidian only calls one or the other, so the two paths never run simultaneously. `devDependencies.obsidian` was upgraded accordingly to `^1.13.1` (type definitions only — does not affect minAppVersion or actual runtime requirements)
- Added an experimental feature, **Move tags to frontmatter** (disabled by default): when a rename runs, it can optionally consolidate `#tag`s from the note body into the frontmatter `tags` property. Three options for handling the leftover in-body text (keep it / strip the hash / remove entirely); consolidation only happens when the rename flow actually fires, and never while typing (edit-triggered). The tag source trusts Obsidian's official `metadataCache` (no hand-rolled regex), correctly excludes tags inside headings/links/comments, and skips invalid tags such as purely numeric ones. The batch preview annotates applicable rows with the move count; the activity log records move and stale-skip statistics. The settings page's "Experimental" section has a clear risk warning below its heading (copy polished across all three languages via pplx). See the README's "Experimental" section for details
- Strengthened tests: added `tests/tag-mover.property.test.ts` (fast-check property-based, 19 invariants, 300 random inputs each) and Stryker mutation testing (`npm run test:mutation`, scoped to `src/tag-mover.ts`; see `docs/mutation-testing-tag-mover.md` for details). In the process, also found and fixed 2 real edge-case bugs: the `#`-stripping regex in `normalizeTagName`/`mergeTagsIntoList` would leave a `#` behind if it only stripped one occurrence (changed to strip all leading `#` characters), and would erroneously delete a `#` in the middle of a string if the regex lost its leading anchor. Unit tests increased from 293 to 326
- **Fix** (found via a full-project CodeGraph health check plus adversarial verification):
  - The "Tags to ignore" setting field is a multi-line textarea, but it previously only split on commas — entering tags on separate lines (one tag per line, the most natural way to use it) would silently collapse the entire ignore list into a single garbled string that matched no tags at all, so every tag the user meant to protect got moved anyway, with the note body actually deleted under `remove-tag` mode, and no error was shown. Now supports both comma and newline separators (`parseTagsToIgnoreForMove`, extracted into a standalone, tested function instead of being inlined in the UI callback)
  - Batch Apply previously bypassed the "actively typing" protection entirely: if a candidate note's tags were edited while the preview window was open and Apply was pressed shortly after, a half-typed tag would be incorrectly moved (or even deleted under `remove-tag`) — it now applies the same `recentlyEdited` safety gate used by every other trigger path
  - Extracted `main.ts`'s tag-move decision logic (typing-in-progress guard, activity log formatting) into pure functions in `src/tag-move-policy.ts` (`computeAllowTagMove`/`formatTagMoveDetail`), closing a test blind spot that previously had zero coverage; `lastEditAt` now uses `WeakMap<TFile, number>`, so it is automatically reclaimed via GC along with the file object instead of growing unboundedly over the session's lifetime
  - Along the way, also fixed 3 pre-existing but never-triggered fake-stub defects in the e2e test tooling itself (`tests/e2e/e2e-smoke.cjs`): the note body being erroneously cleared after a rename, the cache being erroneously set to null after a rename (inconsistent with real Obsidian rename behavior, which does not trigger re-indexing), and `vault.process()` having no stub at all. Unit tests went from 326 to 340, e2e scenarios from 20 to 25

## 0.10.0 — 2026-07-15
- The settings page's exclude-filename pattern now uses live inline validation: an invalid draft will not overwrite the last valid rule, and new rename operations are paused until the issue is fixed
- Batch preview now groups items into "Renamable / Conflict / Error / Skipped", showing localized reasons; only renamable items are applied
- If any setting affecting the batch result is changed after previewing, Apply will reject the stale preview and require it to be regenerated

## 0.9.0 — 2026-07-04
- Fully resolved all findings from the community directory scan report (21 warnings + attestations):
  `window.*` timers (popout compatibility), official `getLanguage()` replacing localStorage
  (minAppVersion 1.4→1.8), `Vault#configDir` auto-ignore (default `ignoreFolders` changed to `.trash`),
  regex-free control-character filtering, `builtin-modules` → `node:module`,
  `createDiv`/`createSpan`, `this: void`, type narrowing
- Added GitHub build provenance attestation to release assets
- Adopted the official `eslint-plugin-obsidianmd` (`npm run lint`, also run in CI, zero remaining issues)

## 0.8.3 — 2026-07-04
- Upgraded `fundingUrl` to support multiple platforms (Ko-fi + PayPal); `FUNDING.yml` updated to match

## 0.8.2 — 2026-07-04
- Added `fundingUrl` (PayPal) to the manifest; added GitHub `FUNDING.yml`; added a Support section to the README

## 0.8.1 — 2026-07-04
- Renamed the plugin id from `h1aligner` to `heading-aligner`: community directory rules restrict the id to lowercase letters and hyphens only (no digits allowed); fixed after the submission bot rejected it. The display name remains "H1Aligner", and the frontmatter lock key `h1aligner-lock` is unchanged (for backward compatibility)

## 0.8.0 — 2026-07-03
- Expanded trigger modes to five options: added "Both enabled" (on file open + after editing) and "On leaving a note" (renames the note just left, never touching the file currently being viewed)
- Added a `leave` source tag to the activity log; E2E scenarios went from 16 to 18

## 0.7.0 — 2026-07-03
- The include/ignore folder fields now support `/` to mean the vault root level (that level only, not subfolders)

## 0.6.1 — 2026-07-03
- Fix: entries in the whitelist field that normalize to empty (e.g. `\` or `/`) no longer lock out the entire vault (found through real-device testing)

## 0.6.0 — 2026-07-03
- Full i18n support for three languages: Traditional Chinese / English / Japanese (78 keys, follows the Obsidian language setting)
- i18n completeness tests: verifies key alignment across all three languages and placeholder preservation

## 0.5.0 — 2026-07-03
- Activity log (session ring buffer + "Show recent activity" command)
- First-enable onboarding (one-way contract explanation; auto-triggering is gated until consent is given; users upgrading from an earlier version are not asked again)
- Old filenames written to frontmatter `aliases` (disabled by default)
- fast-check property-based tests (7 global invariants for sanitize)
- Extracted inline styles into `styles.css`; added Dependabot; added `docs/MOBILE-TESTING.md` real-device checklist

## 0.4.0 — 2026-07-03
- Trigger modes (on file open / after editing / manual only; driven by `editor-change` — Sync or programmatic writes do not trigger it)
- Scope controls: include whitelist, regex exclusion (protects daily notes by default), frontmatter lock (with raw-content fallback)
- Naming: filename template `{{h1}}`/`{{date}}` (file creation time, idempotent), collision numbering, case-only toggle
- Batch dry-run preview + re-validation on apply, session undo (20 levels, identity verification), three-tier notifications
- Extensive hardening: case/NFC-insensitive collision protection (NTFS/APFS), 255-byte filename limit, BOM handling, CommonMark code-fence/closing-`#` rules

## 0.1.0 — 2026-05
- Phase 1 MVP: automatic rename on file-open, manual command, four-layer protection (no-h1/empty/same-name/collision)
