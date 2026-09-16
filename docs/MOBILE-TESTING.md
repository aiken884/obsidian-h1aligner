# Mobile On-Device Verification Checklist

`manifest.json` declares `isDesktopOnly: false` — this checklist is the on-device verification procedure for that commitment.
Unit and E2E automated tests cannot cover the behavior of real WebViews and mobile file systems.
**Before every minor release, run through this checklist once on iPhone and once on Android**, and record the results in the table at the bottom.

Installation: place `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/heading-aligner/`, then enable the plugin under Community plugins.
Using a dedicated test vault is recommended.

## Check Items

| # | Scenario | Steps | Expected Result |
|---|------|------|---------|
| 1 | First-time enable onboarding | Enable the plugin after a fresh install | The onboarding modal appears once; choosing "Start with manual mode" sets the trigger to Manual only; it does not appear again after restarting the app |
| 2 | Basic rename on file-open | trigger=On file open; open a note whose H1 doesn't match its filename | The filename is renamed to the H1 after about 0.1 seconds; backlinks are updated in sync |
| 3 | Long CJK heading | Create and open a note with an H1 of 100+ Chinese characters | Rename succeeds with no errors (within 253 bytes); rename must not fail on either iOS or Android |
| 4 | Daily note protection | Open `2026-07-03.md` (H1 is different text) | Not renamed |
| 5 | Frontmatter lock | Add `h1aligner-lock: true` to a note, then open it | Not renamed; the manual command reports skipped (locked) |
| 6 | Edit trigger + soft keyboard | trigger=After edit; edit the H1 and pause for 2 seconds (keyboard still open) | Renamed after the pause; rename must **never** occur while typing, and the cursor must not jump |
| 6b | both / leave triggers | Switch to "Both enabled" and "On leaving note" respectively, and retest #2 and #6 | both: renames on both file-open and pause; leave: no change while staying on the note, the previous note is renamed after switching away |
| 7 | Obsidian Sync remote change | Open the same note on two devices; device A edits the H1 while device B sits idle on that note (trigger=After edit) | Device B must **not** rename due to the synced write (editor-change only responds to local input) |
| 8 | Case-conflict (iOS APFS) | The vault contains `Readme.md`; open another note whose H1 is `README` | Skipped (collision); must not overwrite `Readme.md` |
| 9 | Batch preview | Run "Preview all renames (dry run)", trying to include collision, skip, and error cases; then change a setting that affects renaming after the preview | The modal groups results by Rename, Conflicts, Errors, and Skipped, and is scrollable; no horizontal overflow on small screens; a stale preview is rejected and re-preview is required; only Rename items can be applied |
| 10 | Batch apply + undo | Run "Undo last rename" after Apply | The last rename is reverted; both actions appear in the activity log |
| 11 | Activity log | Run "Show recent activity" | The modal lists this session's decisions (time / source / result); readable on small screens |
| 12 | Full settings-page walkthrough | Open the plugin settings, adjust each item and observe the live preview; enter an invalid exclusion regex (e.g. `[`) and then fix it | All fields are operable; zh-TW UI strings are correct (when Obsidian's language is set to Traditional Chinese); the preview updates live; an invalid draft shows an inline error, does not overwrite the active rule, and suspends automatic, manual, and batch renaming until fixed |
| 13 | Android case-sensitive behavior | (Android only) Create `note.md` and `Note.md` and test renaming | The collision scan treats them as a conflict (conservatively skipped) — record the actual behavior |
| 14 | Preserve aliases | Enable "Keep old filename as alias" and then trigger a rename | The old filename appears in the frontmatter aliases; the quick switcher can find the note by its old name |
| 15 | Rename notice Undo button | Trigger a rename, then tap the **Undo** button on the toast itself (not the command palette) | The toast shows a tappable Undo button; tapping it reverts the rename, closes the toast, and the activity log records source "undo"; tapping an older toast after a newer rename has happened shows "no longer the latest" instead of undoing |
| 16 | Lock / unlock via context menu | Long-press a note in the file explorer (or right-click on desktop) → **Lock this note** → open the note; then long-press it again *immediately* (before re-indexing) and confirm whatever the menu shows cannot accidentally unlock it; then **Unlock this note** → open the note | Locked: opening the note does not rename it. The menu never offers an action that unlocks a note that is actually still locked, even if its label is briefly stale. Unlocked: opening the note renames it again |

## Suggested Run Order (single efficient pass)

Items are grouped into phases so trigger/notice settings are changed as few times as possible. Run this
same sequence on iPhone and again on Android (skip #13's Android-only note on iOS, and vice versa the item
doesn't apply). Do the whole thing in **one dedicated test vault**, not your real vault.

**Prep, once per device:**
- Install per the "Installation" section above, but do **not** enable the plugin yet — item #1 requires a
  genuinely fresh enable.
- Have these test notes ready to create as you go (exact names matter for a couple of items):
  - `2026-09-15.md` (or today's date) — for #4, daily-note protection. Give it an H1 that does **not** match
    the filename, e.g. `# Not the date`.
  - `Readme.md` — for #8 (iOS) / #13 (Android). Create it first with any H1.
  - A long-CJK note for #3 — H1 of 100+ Chinese characters (e.g. paste a paragraph).
  - 3-4 disposable notes with mismatched H1s for #9/#10 batch preview+apply.
  - One note whose H1 you can freely edit for #6/#6b/#15.

**Phase 0 — Fresh install (#1).** Enable the plugin for the first time. Confirm the onboarding modal
appears once; pick "Start with manual mode"; confirm the trigger setting became Manual only; restart the
app and confirm the modal does *not* reappear.

**Phase 1 — Settings: trigger = On file open, notice level = All.** Covers #2, #3, #4, #5, #8 or #13, #15,
#16 — all naturally exercised via "open a note and see what happens," so batch them together:
1. #2: open a mismatched-H1 note → renamed in ~0.1s, backlinks intact.
2. #3: open the long-CJK note → renames cleanly, no error on either OS.
3. #4: open `2026-09-15.md` → not renamed (daily-note protection).
4. #5: add `h1aligner-lock: true` to a note's frontmatter, open it → not renamed; run the manual rename
   command on it → reports skipped (locked).
5. #16 (uses the same locked note from #5): long-press it in the file explorer → confirm the menu shows
   **Unlock this note** (it's currently locked) → tap it → open the note → now renames normally. Long-press
   again *immediately* after re-locking it (before giving the UI time to re-index) and confirm the menu
   can't be used to accidentally unlock it.
6. #8 (iOS) / #13 (Android): create/open a second note whose H1 is `README` while `Readme.md` exists →
   skipped as a collision, `Readme.md` untouched. (Android: additionally create `Note.md` and `note.md` and
   record the actual collision behavior — this item exists specifically to document real device behavior,
   not to assert a single expected outcome.)
7. #15: trigger any rename in this phase (e.g. re-run #2 on a fresh note) → tap the **Undo** button on the
   toast itself → filename reverts, toast closes, activity log records source "undo." Trigger two renames
   back to back and tap the *older* toast's button → should say "no longer the latest" instead of undoing.

**Phase 2 — Settings: trigger = After editing.** Covers #6 and #7:
1. #6: edit a note's H1, pause 2 seconds with the keyboard still open → renames after the pause; confirm no
   rename fires *during* typing and the cursor never jumps.
2. #7 (needs a second device signed into the same Sync vault): edit the H1 on device A while this device
   sits idle on that same note → this device must **not** rename off the synced write.

**Phase 3 — Settings: trigger = Both, then Leave.** Covers #6b:
1. Switch to "Both enabled" → re-run #2's file-open check and #6's edit-pause check, both should fire.
2. Switch to "On leaving a note" → edit the H1 while staying on the note (no rename yet) → switch to a
   different note → the note you left is now renamed.

**Phase 4 — Settings: trigger = Manual only.** Covers #9, #10, #11, #14 — batch/manual flows where you
don't want anything renaming out from under you:
1. #14: turn on "Keep old filename as alias," manually rename a note → old filename appears in frontmatter
   aliases; quick switcher finds the note by its old name.
2. #9: run "Preview all renames (dry run)" over your disposable batch notes (arrange for at least one
   collision, one skip, one error if you can) → results grouped into Rename/Conflicts/Errors/Skipped,
   scrollable, no horizontal overflow; change a rename-affecting setting while the preview is open → it's
   rejected as stale and asks for a re-preview.
3. #10: apply the batch, then run "Undo last rename" → last rename reverts; both the apply and the undo show
   up in the activity log.
4. #11: open "Show recent activity" → everything from this whole run so far is listed (time / source /
   result), readable at phone width.

**Phase 5 — Full settings walkthrough (#12), last.** Touches every settings field, so do it after
everything else so a half-changed setting can't contaminate an earlier phase: open plugin settings, adjust
each field and watch the live preview; type an invalid exclusion regex (e.g. `[`) → inline error appears,
the previous valid rule stays active, and automatic/manual/batch renaming all pause until it's fixed → fix
it → renaming resumes. Confirm zh-TW strings throughout if Obsidian's language is set to Traditional
Chinese.

**Wrap-up:** fill in one row of the Verification Log table below per device — date, device/OS, Obsidian
version, plugin version, and which numbered items passed/failed/were skipped with why.

## Verification Log

| Date | Device / OS | Obsidian Version | Plugin Version | Result (passed items / failed items with description) |
|------|-----------|---------------|----------|------------------------------|
| 2026-07-03 | iPhone / iOS | mobile (version not recorded) | 0.6.1 | Passed: #2 (file-open rename), #4 (daily note protection), #5 (lock), #6 (edit trigger + soft keyboard, both typing-then-pause rounds correct, no mid-typing rename), #9 (batch preview modal correct in Traditional Chinese / collapsible summary), #10 (undo restore succeeded), #11 (activity log complete, source labels correct), #12 (settings page walkthrough in Traditional Chinese, trigger switch takes effect immediately). Partial: #3 (long filename opens/displays/is idempotent correctly on mobile, but a long heading was not newly created on mobile). Not tested: #1 (onboarding — Sync already synced the read marker, verified on desktop), #7 (two-device idle scenario), #8 (case conflict), #14 (aliases). Distribution method: Obsidian Sync. Verification method: synced back to Mac and checked item-by-item automatically + 4 screenshots. |
| — | Android | — | — | Not run |
| 2026-07-15 | Pending: iPhone and Android | — | 0.10.0 | Release candidate adds gates #9 and #12; on-device verification has not yet been performed and must not be considered passed. |
| 2026-08-11 | iPhone (iOS 26.6) + desktop | 1.13.4 (desktop, via obsidian-cli); mobile version not recorded | 0.11.0 → 0.11.1 | Verified the scroll-position-reset fix for the "Move tags to frontmatter" toggle (item #12's live-preview interaction) via screen recording on both mobile and desktop, reproducing the bug before the fix and confirming it was gone after. Not a full run of the checklist above — scoped to this one regression. Android not tested. |
| 2026-09-16 | Mac (desktop, macOS) | 1.13.7 | dev build @78e9a04 (0.12.0 batch 1, pre-release) | Verified the three new batch-1 features via real Obsidian, driving genuine UI input with cliclick + screencapture (not the automated test harness). Two independent rounds, 4/4 PASS both times: #16 lock/unlock menu including the stale-cache race forced at true 0ms reopen (menu still showed the stale label, click stayed idempotent) and confirmed distinct from the normal ~300ms fresh-cache case; #3-equivalent tag-move notice; #15 undo button including the superseded-toast rejection and the undo-chain (v3/v4) identity check. Desktop only — iPhone not run this cycle, see "H1Aligner Mobile Verification.md" in the vault root for the pending on-device pass. |
| 2026-09-16 | PC (desktop, Windows) | 1.13.7 | dev build @78e9a04 (0.12.0 batch 1, pre-release) | Independent verification via obsidian CLI eval + a Proxy Menu harness triggering `file-menu` (not the automated test harness). 4/4 PASS, including the stale-cache case at true 0ms. Two harness-only artifacts were confirmed unrelated to the plugin: an incomplete Proxy Menu implementation triggered an unrelated Obsidian-core `setSectionSubmenu` warning, and an overlong eval script caused a CLI IPC parse error (recovered; vault confirmed undamaged). Desktop only — Android not run this cycle, see "H1Aligner Mobile Verification.md" in the vault root for the pending on-device pass. |
