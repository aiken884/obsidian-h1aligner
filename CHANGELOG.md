# Changelog

Published on the Obsidian Community Plugins directory; versioning follows SemVer.

## Unreleased
- **Fix**: Corrected `minAppVersion` from 1.8.0 to 1.8.7 — the `getLanguage()` API introduced in 0.9.0 (replacing localStorage) actually requires Obsidian 1.8.7; the previous value of 1.8.0 would let users on Obsidian 1.8.0–1.8.6 mistakenly believe the plugin was compatible and install or update to a version that would break immediately. Retroactively corrected the existing 0.9.0 and 0.10.0 entries in `versions.json` as well (this file is read live by the Obsidian installer, so the fix takes effect without publishing a new release); `manifest.json` was also updated for use in the next release (no new release is being published this time, and the already-published 0.10.0 release assets are left untouched to avoid breaking their build provenance attestation)
- The settings page now uses Obsidian 1.13.0+'s official declarative Settings API (`getSettingDefinitions`/`getControlValue`/`setControlValue`): all 19 settings fields plus the live preview block have been fully migrated, and the `moveTagsToFrontmatter` toggle's sub-field visibility now uses `refreshDomState()` (no longer a full-page re-render, preserving scroll position and focus). The original `display()` method is fully preserved, unchanged, and serves as the fallback path for Obsidian < 1.13.0 (this plugin's minAppVersion is still 1.8.0); Obsidian only calls one or the other, so the two paths never run simultaneously. `devDependencies.obsidian` was upgraded accordingly to `^1.13.1` (type definitions only — does not affect minAppVersion or actual runtime requirements)
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
