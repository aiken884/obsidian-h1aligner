# Changelog

專案為個人使用（未上架社群目錄）；版本號依 SemVer。

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
