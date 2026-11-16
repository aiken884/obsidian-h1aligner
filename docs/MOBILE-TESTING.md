# Mobile On-Device Verification Checklist

`manifest.json` declares `isDesktopOnly: false` — this checklist is the on-device verification procedure for that commitment.
Unit and E2E automated tests cannot cover the behavior of real WebViews and mobile file systems.
**Before every minor release, run through this checklist once on iPhone and once on Android**, and record the results in the table at the bottom.

Installation: place `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/heading-aligner/`, then enable the plugin under Community plugins.
Use **ObsidianTestVault** (the dedicated test vault). Do not run this checklist on the real `ObsidianVault`.

When the plugin files reach a phone through Obsidian Sync (Sync setting *Installed community plugins* must be on for that device), **force-quit the Obsidian app and reopen it** after every new build. Reloading the plugin only refreshes `manifest.json` (the dev-build label in the plugin list); the phone keeps running the old `main.js` until the app is killed (2026-10-20: after a reload the new command *Explain this note* was still missing; it appeared after a force-quit). Check that a command added by the build under test is in the palette before starting the checklist.

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
| 16 | Lock / unlock via context menu | Long-press a note in the file explorer (or right-click on desktop) → **Lock this note** → open the note; then long-press it again *immediately* (before re-indexing) and confirm whatever the menu shows cannot accidentally unlock it; then **Unlock this note** → open the note | Locked: opening the note does not rename it. The menu never offers an action that unlocks a note that is actually still locked, even if its label is briefly stale. Unlocked: opening the note renames it again. The menu also shows **Rename from first H1** for notes outside ignored folders; tapping it renames the note like the manual command. |
| 17 | Explain this note | On a note that is ignored, one that matches an exclude pattern, one that is locked, and one that would rename: run **Explain this note**; then type an invalid exclude pattern (e.g. `[`) in settings and run it again on the would-rename note | A notice explains the matching reason. With the invalid pattern, it says renaming is paused (not "would be renamed"). The filename does not change. |
| 18 | Batch out-of-scope count | With ignore/include/exclude excluding some notes, run **Preview all renames (dry run)** | The modal shows a count of notes outside those filters. Those notes are not listed as skipped rows. Apply still only renames in-scope Rename items. |
| 19 | Folder what-if preview | Long-press / right-click a folder → **Preview renames in this folder** | The modal says which folder it previews and only lists markdown notes under that folder; notes filtered out by your settings are counted ("in this folder … excluded"), not listed. Notes in other folders do not appear. Apply still re-verifies. |
| 20 | Activity Copy button | Rename or skip a few notes, open **Show recent activity**, tap **Copy**, then paste into another note or app | The button copies the same lines as the window shows (newest first, one line per entry) and a notice says how many entries were copied. If the platform refuses, a "could not copy" notice appears and nothing crashes. **Record per platform whether copy works** — mobile clipboard support is only claimed once this passes on device. Also check, with the clipboard refused or unavailable, whether the activity-log text can still be selected by hand (mobile). |
| 21 | Frontmatter title fallback | Settings → Naming → turn on **Use frontmatter title when there is no H1**. Make a note with `title: My Title` in frontmatter and no `# H1`; run **Rename active file from first H1** (Trigger: Manual only) | The note is renamed to `My Title.md`. With the setting off, the same note is skipped (no H1). A note that has an H1 uses the H1, not the title. **Explain this note** on the title-only note says the name comes from the frontmatter title. |
| 22 | Title fallback with the edit trigger | Trigger = edit (or both); on a note with no H1, change the frontmatter `title` and stop typing | After the edit pause the note is renamed once from the *new* title. **Record whether it ever used the previous title** — since 2026-11-16 the title is read from the file's content, so it must never use the previous one (Mac run before the fix: 4/4 did; re-verify on device with the default 2-second pause). |
| 23 | Setting persists and upgrade | Turn the title setting on, restart Obsidian; separately, load a `data.json` written by 0.12.0 (or 0.13.0) into this build | The setting is still on after restart; an older `data.json` loads with the setting off and no other setting changed. |

## Suggested Run Order (single efficient pass)

Items are grouped into phases so trigger/notice settings are changed as few times as possible. Run this
same sequence on iPhone and again on Android (skip #13's Android-only note on iOS, and vice versa the item
doesn't apply). Do the whole thing in **ObsidianTestVault**, not the real `ObsidianVault`.

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
  - For **batch 2** (#17–#19), on branch `feature/0.12.0-batch2` (not directory 0.12.0): first add a
    *visible* folder (e.g. `H1A-忽略`) to Ignore folders — the default `.trash` is hidden by Obsidian, so its
    notes cannot be opened or counted — then prepare a note in that folder, an exclude-pattern daily note, a
    locked note, a would-rename note, plus a folder that contains some of those and a sibling folder that
    must **not** appear in the folder preview.

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

**Phase 4b — Batch 2 diagnostics (#17–#19), only on `feature/0.12.0-batch2`.** Directory 0.12.0 does not
include these. Trigger stays Manual only from Phase 4, so opening notes does not rename them out from under Explain:
1. #17: run **Explain this note** on (a) an ignored-folder note, (b) a date-named exclude-pattern note,
   (c) a locked note, (d) a mismatched-H1 note that would rename. Each should produce a notice with the
   matching reason; **filenames must not change**. Then (e) type `[` into Exclude patterns and run it on the
   note from (d): the notice must say renaming is paused, not "would be renamed". Fix the pattern afterwards.
2. #18: with ignore/include/exclude excluding some notes, run **Preview all renames (dry run)**. Confirm a
   count of notes outside those filters; they must not appear as skipped rows. Apply still only hits
   in-scope Rename items.
3. #19: long-press / right-click a folder → **Preview renames in this folder**. Only markdown under that
   folder is listed, the first hint line (right under the summary) names the folder, filtered-out notes are only counted ("in this folder …
   excluded"), and a sibling folder's notes must not appear. Do not Apply unless you intend to; Apply
   still re-verifies.

**Phase 4c — Batch 3 (#20–#23), only on `feature/0.12.0-batch3`.** Directory 0.12.0 / 0.13.0 do not include these. Keep Trigger = Manual only except for #22:
1. #20: with a few rows in **Show recent activity**, tap **Copy** and paste elsewhere; compare with the window. Also try it once with the clipboard unavailable if the platform allows (otherwise note "not testable").
2. #21: turn on the title setting; run the manual command on a title-only note, an H1+title note and a note whose title is a list (`title: [a, b]`, must be skipped); run **Explain this note** on the title-only note.
3. #22: Trigger = edit; edit the frontmatter title of a no-H1 note and wait; then set the trigger back to Manual only.
4. #23: restart Obsidian and confirm the setting persisted; if a 0.12.0/0.13.0 `data.json` is available, load it and confirm nothing else changed.
Turn the title setting back off when done.

**Phase 5 — Full settings walkthrough (#12), last.** Touches every settings field (including the title toggle on batch 3), so do it after
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
| 2026-09-16 | Mac (desktop, macOS) | 1.13.7 | dev build @78e9a04 (0.12.0 batch 1, pre-release) | Verified the three new batch-1 features via real Obsidian, driving genuine UI input with cliclick + screencapture (not the automated test harness). Two independent rounds, 4/4 PASS both times: #16 lock/unlock menu including the stale-cache race forced at true 0ms reopen (menu still showed the stale label, click stayed idempotent) and confirmed distinct from the normal ~300ms fresh-cache case; #3-equivalent tag-move notice; #15 undo button including the superseded-toast rejection and the undo-chain (v3/v4) identity check. Desktop only — iPhone ran later the same day (see the iPhone row below). |
| 2026-09-16 | PC (desktop, Windows) | 1.13.7 | dev build @78e9a04 (0.12.0 batch 1, pre-release) | Independent verification via obsidian CLI eval + a Proxy Menu harness triggering `file-menu` (not the automated test harness). 4/4 PASS, including the stale-cache case at true 0ms. Two harness-only artifacts were confirmed unrelated to the plugin: an incomplete Proxy Menu implementation triggered an unrelated Obsidian-core `setSectionSubmenu` warning, and an overlong eval script caused a CLI IPC parse error (recovered; vault confirmed undamaged). Desktop only — Android not run this cycle. |
| 2026-09-16 | iPhone (Obsidian mobile, Sync from ObsidianTestVault) | mobile (version not recorded) | dev build @2da6432 (batch 1 + settings-page settingEl fix) | Aiken's own on-device pass: no issues found. Settings-page conflict row rendered in red with `H1A-SCOPE-sub` (same copy as desktop 1.13.7). Notes renamed from H1 as expected (`衝突測試筆記`, `鎖定測試筆記`, `復原測試筆記`, `長標題測試`); tag-move test kept its filename (alignment-only path); long-CJK basename 240 UTF-8 bytes within the 255 limit. Trigger had been switched to `both`. `dev:errors` clean; Sync `error:false`. Android still not run this cycle. |
| 2026-10-20 | Mac (desktop, macOS) | 1.14.4 | dev build @bb489f6 → @c85d170 (0.12.0 batch 2, pre-release; src identical, main.js sha256 4819f839…) | Batch-2 items driven through real Obsidian (obsidian CLI eval + cliclick for genuine UI input), ObsidianTestVault. PASS: #17 Explain this note (ignored / date exclude-pattern / locked / would-rename notices correct, filenames unchanged); #17(e) typing `[` into the settings-page Exclude patterns box with the keyboard → inline red error, Explain says renaming is paused, batch preview Apply disabled, draft survives closing/reopening the settings page and `plugin:reload`, clearing it restores normal behaviour; #18 out-of-scope count shown, not listed as skipped rows; #19 folder right-click (native macOS menu via cliclick, not a fake Menu) → modal names the folder, sibling folder absent. Not done: full Obsidian restart (only plugin:reload); Apply was never pressed. |
| 2026-10-20 | Windows 11 PC (desktop) | 1.14.4 | dev build @bb489f6 → @c85d170 (0.12.0 batch 2, pre-release) | `npm ci`, lint (0 warnings), build, 465 unit, 48 E2E all green. Via obsidian CLI eval on ObsidianTestVault (hidden-container settings render, `contextmenu` event dispatch for #19 — not a physical click): PASS #17 incl. invalid `[` → paused, #18, #19. Upgrade smoke test 0.12.0 (GitHub release assets) → c85d170: 6 non-default settings preserved, 0 changed data.json fields, 6 commands present, Explain / batch / folder preview / Lock / rename + Undo OK. Observation (pre-existing, documented in README now): with "Preserve old name as alias" on, Undo restores the filename but leaves the alias. Obsidian Sync does not sync community plugins on this vault. |
| 2026-10-20 | iPhone via Obsidian Sync from ObsidianTestVault (iOS version not recorded) | mobile (version not recorded; ≥1.13.0) | dev build @c85d170 (0.12.0 batch 2, pre-release) | Aiken's own on-device pass of the full batch-2 checklist (`00-手機測試清單.md`), no issues found. PASS: #17 Explain this note — ignored folder, date-named exclude pattern, locked, would-rename notices all correct; #17(e) typing `[` in the settings page → red error, Explain says renaming is paused, batch preview warning shown and Apply button visibly dimmed, fixing it restores normal; #18 batch preview "3 of 7 notes would be renamed" + "3 outside the filters"; #19 long-press folder → preview names the folder, 1 of 1, sibling folder absent. A Mac-side file watcher (FSEvents) over the whole run saw no rename, deletion, alias or lock change and no Sync conflict; Apply was never pressed. Caveats: Apply button disabled-ness judged from appearance only (not tapped); filled-in text came from screenshots, the checklist "actual" lines were only ticked. Process finding: reloading the plugin did not load the new `main.js`; a force-quit was needed (see Installation). |
| 2026-10-20 | Android | — | — | **Not run for 0.13.0 — waived by Aiken** (release decision 2026-10-20; the phone above was an iPhone). Android remains unverified for batch-2 items #17–#19. |
| 2026-11-16 | Mac 桌面（macOS 27.2.1 / Darwin 27.2.0），ObsidianTestVault，透過 obsidian CLI eval 驅動（非實體點擊，Copy 為程式觸發 click） | 1.15.1（Electron 43.8.9；預期 1.14.x，實際較新） | dev build @0f92cbf（`feature/0.12.0-batch3`，磁碟版本仍 0.13.0；Node v26.13.1 / npm 12.2.2；`npm ci` + `npm run build` 成功） | **升級 smoke（0.13.0 正式版 → batch3）通過**：先裝 GitHub release 0.13.0 的 main.js（與 TestVault 原有檔案 cmp 相同），設定 5 項非預設值（editDebounceMs 1500、maxFilenameLength 120、preserveOldNameAsAlias 開、ignoreFolders 僅 .trash 等）＋鎖定筆記，存下 data.json；換成 batch3 後停用再啟用：21 個設定鍵，0 項被改動，僅新增 `useFrontmatterTitle=false`；鎖定筆記仍回報「已跳過（frontmatter 已鎖定）」、一般筆記改名正常；`dev:errors` 無錯誤。 **#20 通過**：先 pbcopy 放哨兵字串，開關活動視窗與觸發 5 筆事件後剪貼簿仍是哨兵；按「複製」後 pbpaste 為 5 行、最新在前、每行 `time  [source]  path  result` 與畫面逐字相同（雙空格、`\n` 連接、無尾端換行），通知「已複製 5 筆活動紀錄」。以覆寫 `writeText` 為 reject、同步 throw、設為 undefined，皆顯示中性通知「無法複製到剪貼簿」且剪貼簿不變、無例外，還原後可再次複製成功。**限制**：Electron 的 `navigator.clipboard` 為不可重新定義的屬性，無法模擬「整個 clipboard 物件不存在」（以 writeText 為 undefined 近似）。**觀察**：活動視窗列表的 computed `user-select` 為 `none`（span／容器／`.modal` 皆是），桌面上無法以滑鼠選取文字；剪貼簿被拒時手動選取在桌面行不通（手機未驗證；是否列為缺陷由 Aiken 判斷）。 **#21 通過**（`useFrontmatterTitle` 關／開）：關時 `title: 標題測試用名稱` 且無 H1 的筆記手動改名回報「已跳過（沒有第一個 H1）」，Explain 為「不會被改名（沒有第一個 H1）」；開時 Explain 為「將會改名 → 標題測試用名稱（名稱取自 frontmatter 的 title）」，手動改名成功為 `標題測試用名稱.md`，frontmatter 與內文未被改動；有 H1 與 title 並存時用 H1（`H1 優先的標題.md`）；title 為陣列、數字 2025、布林 true、空值、純空白字串皆跳過（沒有第一個 H1）；鎖定筆記跳過（locked）、title 與既有檔名相同時跳過（目標檔名已存在，collision=skip）、忽略資料夾筆記無動作且 Explain 說明位於忽略資料夾、Undo 還原成功。**補充觀察**：日期檔名（`2026-11-17.md`，符合預設排除規則）以手動命令仍會依 title 改名——與 H1 路徑一致（手動命令本就略過 include/exclude 範圍，見 src/main.ts 註解），未另查自動路徑。 **#22 發現：真實 Obsidian 的順序會讓 edit 觸發改名使用舊 title（設計已接受的行為，實測為常態）**。條件：Trigger=edit、editDebounceMs=2000（預設）、無 H1 的筆記、只改 frontmatter `title`（單次編輯，等長取代）；連做 4 次（T1、T2、T3、T5）結果相同，時間軸（ms，t0＝編輯當下）：editor-change @2–3 → 外掛改名 @2005–2007（用舊 title，例 `T1.md → 初始一甲乙丙.md`）→ vault.modify（Obsidian 自動存檔）@2008–2013 → metadataCache `changed`（title 已是新值）@2008–2014。也就是外掛的 2 秒防抖與 Obsidian 約 2 秒的自動存檔幾乎同時到期，改名總是先於快取更新 3–7ms；之後快取已是新 title，但檔名停在舊 title、沒有再次自動改名（單次編輯後 9 秒內無事件）。校正：之後手動命令（`初始一甲乙丙.md → 修改一甲乙丙.md` 成功）；Undo 可還原（T5：`初始五甲乙丙.md → T5.md`，frontmatter 仍為新 title、內文未動）。對照：editDebounceMs=3000 時，modify @2004 與 cache.changed @2005 先到，改名 @3004 使用新 title（`T4.md → 修改四甲乙丙.md`）；連續打字（約 150ms 一字、最後一次編輯後 2 秒）亦先存檔、快取更新後才改名，用到新 title。結論：預設 2 秒防抖下，「只改 title 後停手」會先以舊 title 改名，需下一次評估才校正；這與設計 §5 接受的陳述一致，但發生機率是「幾乎每次」而非「偶爾」，建議發版前由 Aiken 決定是否接受、或把預設防抖／文件說明調整（本次未改程式）。未測 `both` 觸發（與 edit 共用同一防抖路徑，預期相同）。 **#23 通過（桌面）**：把 0.13.0 的 data.json 放進 batch3 後載入，全部原值保留、`useFrontmatterTitle` 預設關；開啟並存檔後，磁碟 data.json 僅新增該鍵且為 true，停用再啟用、再 `obsidian reload vault=ObsidianTestVault`（重載測試 vault 視窗）後設定仍為 true 且其他非預設值不變；`dev:errors` 無錯誤。**未驗證**：完整重啟整個 Obsidian App（會影響 Aiken 開著的主 vault 視窗，刻意不做）。 **未驗證**：#20 在 iPhone／Android 的剪貼簿行為、手機端 user-select；實體滑鼠／鍵盤輸入（本輪全由 CLI eval 驅動）。**使用的 fixture**：升級 smoke：升級鎖定.md（lock）、升級待改名.md；#20：活動甲／乙.md、標題鎖定.md、標題空值.md（產生 rename／locked／no-h1／same-name 四種列）；#21：標題測試、H1優先、標題是清單、標題數字、標題布林、標題空值、標題空字串、標題鎖定、標題碰撞＋碰撞目標、H1A-忽略/忽略標題、標題Undo、2026-11-17；#22：T1–T5（每次新建、無 H1、`title: 初始N甲乙丙`）；#23：scratchpad 的 0.13.0 data.json 副本。 |
| pending | iPhone / Android | — | `feature/0.12.0-batch3`（磁碟版本仍 0.13.0） | **尚未執行（手機）。** batch 3 項目 #20 活動紀錄 Copy、#21–#22 frontmatter title 後援、#23 持久化／升級的手機實機驗證；僅內部版本，在手機列填完前不是 0.14.0 候選。 |
