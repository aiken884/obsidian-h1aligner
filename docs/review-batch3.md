# Adversarial review: batch 3 (activity Copy / frontmatter title fallback)

Date: 2026-09-30
Against: `docs/design-batch3-activity-copy-frontmatter-title.md`, branch `feature/0.12.0-batch3` @ `817defb` (diff vs `feature/0.12.0-batch2`)
Method: three read-only reviewers (no file or git writes), one per perspective — spec conformance, program correctness / product invariants, Obsidian community-plugin rules and mobile. Fixes were made by the main session only.

## Round 2 (fix diff `817defb..5420ba2` only)

One read-only reviewer: no blocking or major findings; E2E 31 and E2E 30's cache ordering confirmed non-vacuous. Minor items applied: E2E 30 now asserts the exact number of renames for the cache-ordering note, and the tag-move integration test also runs an unrestricted third pass (still `same-name`, one `renameFile` call). The reviewer noted that the second half of the cache-ordering test only simulates a stale cache — real Obsidian ordering stays with MOBILE-TESTING #22.

## Round 1

| # | Perspective | Finding | Severity | Status |
|---|---|---|---|---|
| 1 | spec | §7 required test missing: title fallback + alias-preserve + tag mover together, one rename and no loop on the following edit-trigger pass | major | **fixed** — `tests/tag-move-integration.test.ts` |
| 2 | spec | §7 required test missing: batch **and** folder preview invalidated by the new setting (only the pure fingerprint was tested) | major | **fixed** — E2E 31 drives both Apply guards through `main.ts` |
| 3 | spec | Clipboard tests derive the expected string from the same `toLocaleTimeString()` as the code, so a shared format drift passes | minor | **fixed** — time text is pinned, expected string is a literal (unit) |
| 4 | spec | No e2e for the stale-cache / cache-ordering sequence | minor | **fixed** — E2E 30 covers cache updated before the debounce fires, and stale-at-evaluation → next evaluation renames again (not `same-name`) |
| 5 | spec | README / setting text said "the next trigger corrects it", stronger than the accepted behavior (round-2 PPLX point) | minor | **fixed** — "a later trigger corrects it; if none happens, Undo reverts the rename" in README, en/zh-TW/ja setting text and the changelog draft |
| 6 | spec | `docs/MOBILE-TESTING.md`: blank line split the table before #20 | minor | **fixed** |
| 7 | rules | en "copied {count} activity entries" reads wrongly for 1 | minor | **fixed** — "activity log copied ({count})" |
| 8 | rules | Copy button has no CSS class / `aria-label` | minor | not changed — visible text "Copy" is the accessible name; default button styling is acceptable |
| 9 | rules | `navigator.clipboard` availability on iOS/Android WebViews unverified | minor | **open by design** — MOBILE-TESTING #20 records it per platform; mobile support is claimed only after that passes |
| 10 | correctness | With the setting on, a note with no H1 and an unusable title still says "no H1" (does not mention the title) | minor | not changed — recorded non-goal in the design (§9) |
| 11 | correctness | Title read from the metadata cache, not raw content | minor | not changed — accepted behavior, design §5 (PPLX round 3) |
| 12 | correctness | Batch/folder preview rows do not show that a name came from the title | minor | not changed — Apply re-verifies with a dry run; only Explain surfaces the source |
| 13 | spec | Explain-level test for the empty-H1 vs no-H1 distinction | minor | not changed — covered at the rename-service level |

Correctness reviewer found no invariant violated (H1 wins, off = no change, no content writes, idempotence, lock/scope/pause/collision/Undo shared, key present in all six plumbing places). Rules reviewer: ESLint clean, no Node/Electron API, no `innerHTML`/static styles, i18n parity, release script outside the bundle, no secrets in `docs/pplx/`.

## Verdict

No blocking findings in round 1; the two major test gaps were closed. **Approve for internal testing on this branch.** Not a release approval: the release that ships batch 3 (planned as 0.14.0, after 0.13.0) needs `RELEASING.md`'s gate including MOBILE-TESTING #20–#23 on device (in particular the clipboard behavior per platform and the real-Obsidian event/cache ordering for #22).

## 上線前準備度審查（2026-11-16，雙顧問）

結論：**現況不可發版**；處理下列阻擋項並完成實機驗證後可發 0.14.0。PPLX（原則）與 Opus（技術）無根本分歧，差異只在「依賴升級混版」與「Android 豁免」的判準措辭。

**事實（已實測，HEAD 394984b，Node 26.13.1）**：lint `--max-warnings 0` 通過、build 通過、單元測試 525、E2E 51/51、npm audit 0、osv 0；`main.js` 108,083 bytes，無網路 API，唯一剪貼簿呼叫是 `navigator.clipboard`；設計文件與實作一致；`git diff --check` 通過。

**阻擋項**
1. `npm ci` 在 HEAD 失敗（EUSAGE，lock 的 eslint 10.14.0 不滿足 10.15.0；394984b 加了 `minimatch` override 但 lock 未重產），CI 與 release workflow 第一步會斷。
2. 尚未 merge `origin/main`（落後 2 提交：deps 升級、CI Node 24→26）。scratch 模擬：只有 `package.json`／lock 衝突，採 batch3 側並重產 lock 後全閘門綠、`main.js` 逐位元組相同。正式驗證要在實際合併後的提交、乾淨 checkout 上重跑。
3. 實機驗證未做：#20 Copy、#21 title fallback、#22 編輯觸發下的真實事件／快取順序（設計第 3 輪列為發版閘門）、#23 重啟與載入 0.13.0 `data.json`，以及桌面從 0.13.0 升級 smoke test。
4. CHANGELOG `Unreleased` 缺摘要行、測試數字（465→525、48→51）與實機狀態，發版時才能改成 `## 0.14.0`。

**需 Aiken 決定**
- 開發依賴大升級（vitest 5、stryker 10、obsidianmd 0.5）混在功能版：RELEASING 規定應分開。PPLX 判斷不必然是阻擋，條件是合併後最終提交的乾淨安裝與完整閘門通過、無新執行期依賴；產物已證實不變。
- Android：0.13.0 曾豁免。若再豁免，需記錄理由與範圍、確認本次不涉及 Android 特有路徑、已知缺陷不致資料遺失，並留後續驗證安排。

**建議項（不擋發版）**：「剪貼簿失敗時可手動選取文字」在手機上未驗證，#20 加一步或改寫文案；設計文件狀態列、MOBILE-TESTING「disk version」、本檔最終狀態對齊；e18240e 設定說明精簡補進 CHANGELOG；Setext H1 遇快取過期的小邊界（有 Undo，不擋）。

**改變結論的條件**：合併並重產 lock、HEAD 上 `npm ci` 與閘門全綠；#20–#23 與升級 smoke test 在 Mac／PC／iPhone 通過並寫入 Verification Log；CHANGELOG 補齊 → 改為「可發版」。#20 在某平台失敗 → 先如實改文案。#22 顯示會用舊 title 改名 → 重新評估快取策略，不可發版。

**決定紀錄（2026-11-16，Aiken）**：(a) 開發依賴升級與 0.14.0 功能版一起發；理由＝發布產物逐位元組不變、合併後最終提交閘門全綠（`npm ci`、lint、build、單元測試 525、E2E 51/51、audit 0）。(b) Android 比照 0.13.0 再豁免一次，由 Aiken 決定；須在發版說明與 Verification Log 註明 Android 未驗證，並保留風險：Copy 在 Android WebView 若失敗，使用者會先遇到。最終狀態已涵蓋 deps 升級與 e18240e（設定說明文字精簡）。
