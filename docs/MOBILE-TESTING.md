# Mobile 實機驗證 checklist

`manifest.json` 宣告 `isDesktopOnly: false` — 這份 checklist 是該承諾的實機驗證程序。
單元測試（218）與 E2E（Node stub）都無法涵蓋真實 WebView 與行動檔案系統的行為，
**每次 minor release 前，在 iPhone 與 Android 各跑一輪**，把結果記錄在最下方的表格。

安裝方式：把 `main.js`、`manifest.json`、`styles.css` 放進
`<vault>/.obsidian/plugins/h1aligner/`，在 Community plugins 啟用。
建議使用獨立的測試 vault。

## 檢查項目

| # | 情境 | 步驟 | 預期結果 |
|---|------|------|---------|
| 1 | 首次啟用 onboarding | 全新安裝後啟用外掛 | Onboarding modal 出現一次；選「先用手動模式」後 trigger 變 Manual only；重啟 app 不再出現 |
| 2 | file-open 基本改名 | trigger=開檔時；開一個 H1 與檔名不符的筆記 | 檔名在約 0.1 秒後改為 H1；反向連結同步更新 |
| 3 | 長 CJK 標題 | 建立 H1 為 100+ 個中文字的筆記並開啟 | 改名成功、無錯誤（253 bytes 內）；iOS 與 Android 都不得出現 rename 失敗 |
| 4 | daily note 保護 | 開啟 `2026-07-03.md`（H1 為其他文字） | 不被改名 |
| 5 | frontmatter 鎖 | 筆記加 `h1aligner-lock: true` 後開啟 | 不被改名；手動指令回報 skipped (locked) |
| 6 | edit 觸發 + 軟鍵盤 | trigger=編輯後；編輯 H1 後停筆 2 秒（鍵盤仍開啟） | 停筆後改名；打字過程中**絕不**改名、游標不跳動 |
| 7 | Obsidian Sync 遠端變更 | 兩台裝置開同一筆記，A 裝置改 H1，B 裝置閒置於該筆記（trigger=編輯後） | B 裝置**不**因同步寫入而改名（editor-change 只回應本地輸入） |
| 8 | 大小寫衝突（iOS APFS） | vault 有 `Readme.md`；開啟 H1 為 `README` 的另一筆記 | 跳過（collision），不得覆蓋 `Readme.md` |
| 9 | 批次預覽 | 跑「Preview all renames (dry run)」 | modal 可開啟、可捲動；小螢幕上列表不橫向溢出；skip 摘要正確 |
| 10 | 批次套用 + undo | Apply 後跑「Undo last rename」 | 最後一筆改名被回退；activity 紀錄兩者皆有 |
| 11 | 活動紀錄 | 跑「Show recent activity」 | modal 列出本 session 的決策（時間/來源/結果）；小螢幕可讀 |
| 12 | 設定頁完整走查 | 開啟外掛設定，逐項調整並觀察 live preview | 所有欄位可操作；zh-TW 介面字串正確（Obsidian 語言設為繁中時）；preview 即時更新 |
| 13 | Android case-sensitive 行為 | （僅 Android）建立 `note.md` 與 `Note.md` 並測改名 | 碰撞掃描視為衝突（保守跳過）— 記錄實際行為 |
| 14 | aliases 保留 | 開啟「將舊檔名保留為別名」後觸發改名 | frontmatter aliases 出現舊檔名；quick switcher 可用舊名搜到 |

## 驗證紀錄

| 日期 | 裝置 / OS | Obsidian 版本 | 外掛版本 | 結果（通過項 / 失敗項與描述） |
|------|-----------|---------------|----------|------------------------------|
| 2026-07-03 | iPhone / iOS | mobile（版本未記） | 0.6.1 | 通過：2 (file-open 改名)、4 (daily 保護)、5 (鎖)、6 (edit 觸發＋軟鍵盤，兩輪打字-停筆皆正確、無中途改名)、9 (批次預覽 modal 繁中/摺疊摘要正常)、10 (undo 復原成功)、11 (活動紀錄完整、來源標籤正確)、12 (設定頁繁中走查、trigger 切換即時生效)。部分：3 (長檔名於手機開啟/顯示/冪等正常，未於手機新建長標題)。未測：1 (onboarding — Sync 已同步已讀標記，桌面端已驗)、7 (雙裝置閒置情境)、8 (大小寫衝突)、14 (aliases)。分發方式：Obsidian Sync。驗證方式：Sync 回流 Mac 端逐項自動比對＋4 張截圖。 |
| — | Android | — | — | 未執行 |
