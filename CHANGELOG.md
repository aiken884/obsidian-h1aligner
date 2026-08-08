# Changelog

已上架 Obsidian Community Plugins；版本號依 SemVer。

## Unreleased
- 新增實驗性功能 **Move tags to frontmatter**（預設關閉）：rename 執行時，選擇性地把筆記內文的 `#tag` 整理進 frontmatter 的 `tags` 屬性。內文處置三選一（保留／移除井號／整個移除），只在 rename 流程實際觸發時整理、打字中（edit 觸發）絕不執行；tag 來源信任 Obsidian 官方 `metadataCache`（不自刻 regex），正確排除 heading／連結／註解內的 tag，並跳過純數字等非法 tag。batch 預覽於可套用列加註搬移數量；activity log 記錄搬移與 stale 跳過統計。設定頁「實驗性功能」區段標題下方有明確風險警示（已依 pplx 潤飾三語系文案）。詳見 README「Experimental」段落
- 補強測試：新增 `tests/tag-mover.property.test.ts`（fast-check property-based，19 個不變性、每個 300 次隨機輸入）與 Stryker mutation testing（`npm run test:mutation`，scope 限定 `src/tag-mover.ts`，詳見 `docs/mutation-testing-tag-mover.md`）。過程中額外揪出並修正 2 個真實邊界漏洞：`normalizeTagName`／`mergeTagsIntoList` 的去 `#` 正則若只去一個會殘留 `#`（改為去除全部開頭 `#`）、若正則失去開頭錨點會誤刪字串中間的 `#`。單元測試自 293 增至 326
- **修正**（CodeGraph 全專案健檢＋對抗式驗證發現）：
  - 「忽略的 tag」設定欄位是多行 textarea，但先前只切逗號——換行輸入（一行一個 tag，最自然的操作方式）會讓整個忽略清單靜默失效成一條不會比對到任何 tag 的怪字串，使用者原本要保護的 tag 全部被搬移，`remove-tag` 模式下內文還會被真的刪除，且無任何錯誤提示。改為同時支援逗號與換行分隔（`parseTagsToIgnoreForMove`，已抽成獨立、有測試的函式，不再內嵌於 UI callback）
  - Batch Apply 先前完全繞過「打字中」保護：預覽視窗開著時若編輯了候選筆記的 tag、短時間內按下套用，半形 tag 會被誤搬（甚至被 `remove-tag` 刪除）——現在比照其他所有觸發路徑套用同一道 `recentlyEdited` 安全閘門
  - `main.ts` 的 tag 搬移決策邏輯（打字中防護、activity log 格式化）抽成純函式 `src/tag-move-policy.ts`（`computeAllowTagMove`／`formatTagMoveDetail`），補齊先前完全零覆蓋的測試死角；`lastEditAt` 改用 `WeakMap<TFile, number>`，隨檔案物件 GC 自動回收，不再隨 session 時間無界成長
  - 過程中順帶修正 e2e 測試工具（`tests/e2e/e2e-smoke.cjs`）本身既有但從未被踩到的 3 個 fake stub 缺陷：改名後內文被誤清空、改名後 cache 被誤設為 null（與真實 Obsidian rename 不觸發重新索引的行為不符）、`vault.process()` 完全沒有 stub。單元測試 326→340，e2e 20→25 場景

## 0.10.0 — 2026-07-15
- 設定頁的排除檔名 pattern 改為即時 inline 驗證：無效草稿不會覆寫最後有效規則，且會暫停新的改名操作直到修正完成
- 批次預覽依「可改名／衝突／錯誤／略過」分組，顯示在地化理由；只有可改名項目會套用
- 預覽後若變更任何影響批次結果的設定，套用會拒絕舊預覽並要求重新產生

## 0.9.0 — 2026-07-04
- 社群目錄掃描報告全數修復（21 warnings + attestations）：window.* timers（popout 相容）、
  官方 getLanguage() 取代 localStorage（minAppVersion 1.4→1.8）、Vault#configDir 自動忽略
  （預設 ignoreFolders 改 .trash）、控制字元過濾去 regex、builtin-modules → node:module、
  createDiv/createSpan、this: void、型別收斂
- release 資產加入 GitHub build provenance attestation
- 導入官方 eslint-plugin-obsidianmd（npm run lint、CI 同跑、零殘留）

## 0.8.3 — 2026-07-04
- fundingUrl 升級為多平台（Ko-fi + PayPal）；FUNDING.yml 同步

## 0.8.2 — 2026-07-04
- manifest 加入 fundingUrl（PayPal）；GitHub FUNDING.yml；README Support 段

## 0.8.1 — 2026-07-04
- 外掛 id 更名 `h1aligner` → `heading-aligner`：社群目錄規則限 id 僅能小寫字母與連字號（不允許數字），送審 bot 打回後修正。name 維持「H1Aligner」、frontmatter 鎖 key `h1aligner-lock` 不變（向後相容）

## 0.8.0 — 2026-07-03
- 觸發模式擴為五選：新增「兩者皆啟用」（開檔＋編輯後）與「切離筆記時」（改剛離開的筆記，絕不動正在看的檔案）
- 活動紀錄新增 `leave` 來源標籤；E2E 16→18 情境

## 0.7.0 — 2026-07-03
- include / ignore 資料夾欄位支援 `/`＝vault 根目錄層（僅該層、不含子資料夾）

## 0.6.1 — 2026-07-03
- 修正：白名單欄位輸入 `\` 或 `/` 等正規化後為空的條目不再鎖死整個 vault（實機測試發現）

## 0.6.0 — 2026-07-03
- 完整 i18n 三語支援：繁體中文 / English / 日本語（78 keys，跟隨 Obsidian 語言設定）
- i18n 完整性測試：三語 key 對齊、placeholder 保留驗證

## 0.5.0 — 2026-07-03
- 活動紀錄（session ring buffer + Show recent activity 指令）
- 首次啟用 onboarding（單向契約說明；同意前自動觸發閘住；升級用戶不重問）
- 舊檔名寫入 frontmatter aliases（預設關閉）
- fast-check property-based 測試（sanitize 7 條全域不變量）
- styles.css 抽離 inline style；dependabot；docs/MOBILE-TESTING.md 實機 checklist

## 0.4.0 — 2026-07-03
- 觸發模式（開檔時/編輯後/僅手動，editor-change 驅動 — Sync/程式寫入不觸發）
- 範圍控制：include 白名單、regex 排除（預設保護 daily notes）、frontmatter 鎖（含 raw-content fallback）
- 命名：檔名模板 {{h1}}/{{date}}（檔案建立時間，冪等）、碰撞加序號、case-only 開關
- 批次 dry-run 預覽＋套用時重驗、session undo（20 層、身分驗證）、三級通知
- 大量強化：case/NFC-insensitive 碰撞防護（NTFS/APFS）、255-byte 檔名上限、BOM、CommonMark code-fence/closing-# 規則

## 0.1.0 — 2026-05
- Phase 1 MVP：file-open 自動改名、手動指令、四層防護（no-h1/empty/same-name/collision）
