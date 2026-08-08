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

## Verification Log

| Date | Device / OS | Obsidian Version | Plugin Version | Result (passed items / failed items with description) |
|------|-----------|---------------|----------|------------------------------|
| 2026-07-03 | iPhone / iOS | mobile (version not recorded) | 0.6.1 | Passed: #2 (file-open rename), #4 (daily note protection), #5 (lock), #6 (edit trigger + soft keyboard, both typing-then-pause rounds correct, no mid-typing rename), #9 (batch preview modal correct in Traditional Chinese / collapsible summary), #10 (undo restore succeeded), #11 (activity log complete, source labels correct), #12 (settings page walkthrough in Traditional Chinese, trigger switch takes effect immediately). Partial: #3 (long filename opens/displays/is idempotent correctly on mobile, but a long heading was not newly created on mobile). Not tested: #1 (onboarding — Sync already synced the read marker, verified on desktop), #7 (two-device idle scenario), #8 (case conflict), #14 (aliases). Distribution method: Obsidian Sync. Verification method: synced back to Mac and checked item-by-item automatically + 4 screenshots. |
| — | Android | — | — | Not run |
| 2026-07-15 | Pending: iPhone and Android | — | 0.10.0 | Release candidate adds gates #9 and #12; on-device verification has not yet been performed and must not be considered passed. |
