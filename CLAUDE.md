# CLAUDE.md

## 遠端倉庫（2026-11-21 決定）

- **GitHub（`origin`）是主倉庫**：對外發布、Release、CI、Dependabot、社群外掛審查都在這裡；forge（home 的 Forgejo，私有）只是副本，不跑 CI、不接 Issue／PR。
- `origin` 設了兩個推送位址（GitHub、forge），`git push origin …` 一次推兩邊；`forge` remote 仍保留，用於單獨 fetch／比對。
- 為什麼不改成「forge 為主、push mirror 到 GitHub」：Release 出處證明只有 GitHub Actions 能做；push mirror 等同強制推送，會蓋掉 GitHub 上合併的內容（違反永不 force push）；要存一組 GitHub 寫入憑證進 Forgejo；伺服器端推送會繞過 pre-push 秘密掃描。
- 已知缺口：在 GitHub 網頁合併的 PR（例如 Dependabot）要等本機 `git fetch` 後再推，才會到 forge，這段落差沒有通知。發版後可用下列指令比對（只讀）：`diff <(git ls-remote --heads --tags https://github.com/aiken884/obsidian-h1aligner.git | sort -k2) <(git ls-remote --heads --tags ssh://git@127.0.0.1:2222/aiken/obsidian-h1aligner.git | sort -k2) && echo 兩邊一致`
- 已實測（2026-11-21，`GIT_TRACE=1 git push`）：pre-push 掛鉤對兩個推送位址各跑一次（第二個參數分別是各自網址）；`home-forge/security/pre-push` 第 9 行對 `ssh://git@127.0.0.1:2222/` 直接放行，GitHub 位址照常掃描，所以對外推送的秘密保護不受雙推影響。
- 若落差不能接受，升級做法：home-forge 加排程，GitHub 匿名 fetch 後以不強制 refspec 推到 forge，失敗走 `notify-fail@`（比照 `home-forge/mirror/git-mirror`）；GitHub 改私有時需另加唯讀憑證。

## 發版

- 已發布：**0.13.0**（階段二 Explain this note／批次 out-of-scope 計數／資料夾 what-if 預覽；2026-10-20，tag `0.13.0`）。GitHub：https://github.com/aiken884/obsidian-h1aligner/releases/tag/0.13.0 。前一版 0.12.0（2026-09-16）。0.13.0 實機驗證：Mac／PC 桌面（含從 0.12.0 升級）與 iPhone 通過，**Android 未測，Aiken 豁免**。
- **階段三**（活動紀錄 Copy 按鈕、沒有 H1 時用 frontmatter `title`，選用設定）在分支 `feature/0.12.0-batch3`（自 batch2 分出，已合併 `origin/main`），目標版本 **0.14.0**，**尚未發布**；設計：`docs/design-batch3-activity-copy-frontmatter-title.md`，審查與決定紀錄：`docs/review-batch3.md`，實機項目 20–23。狀態（2026-11-17）：開發完成，閘門全綠（單元 544、E2E 51/51、lint 零警告、npm ci 正常）；Mac 桌面實機驗證通過（#20–#23＋從 0.13.0 升級；#22 經兩輪，最終 edit 觸發改讀編輯器緩衝區）；**待辦只剩 iPhone 實機**（ObsidianTestVault 已備妥，步驟在 vault 內 `00-測試索引.md`）；Android 這版由 Aiken 豁免（2026-11-16）；開發依賴升級與功能版一起發（已決定）。發版當天：CHANGELOG 的 `## Unreleased` 改成 `## 0.14.0 — 日期` 並補 iPhone 句子、重跑完整閘門，再 `npm version`、tag、release。batch3 上**不要動** `package.json`／`manifest.json`／`versions.json`（版本號由發版時 `npm version` 處理）；0.14.0 發布說明已放在 `CHANGELOG.md` 的 `## Unreleased`。batch2 的修正要 merge 進 batch3，不要 cherry-pick。
- 0.13.x 熱修需要 Aiken 另行授權，才在 main 上做。合併與比較一律以 `origin/main` 為準（先 `git fetch`）。
- 發版由 Home 執行（`npm version`、tag、GitHub release）。Home 沒有 GUI Obsidian（但可用 SSH 對 Mac 讀寫檔案；2026-11-17 實測 Mac 暫存目錄可寫入，TestVault 資料夾權限可寫）：`RELEASING.md` 的桌面 smoke test（含從上一版升級）、`docs/MOBILE-TESTING.md` 的桌面項目、發版後的 Post-release verification，要由 Mac／PC 或 Aiken 執行，結果記進 Verification Log。Mac 不必部署或更換 TestVault，除非 Aiken 要求。
- 發版後要到開發者後台 `community.obsidian.md/developer/plugins/heading-aligner` 確認 Reviews 為 Completed／Passed；卡在 Pending 要按 **Review branch**（只有 Aiken 的帳號能登入）。

## Vaults

- **ObsidianTestVault**（Mac：`/Users/aikenlin/Obsidian/ObsidianTestVault`；PC：`C:\Obsidian\ObsidianTestVault`）是專門固定拿來測試的資料庫。外掛實機驗證、設定頁驗證、Obsidian Sync 到手機，都用這個 vault。重置／佈署測試筆記見 `.claude/skills/h1aligner-test-vault/SKILL.md`（用 Obsidian CLI 驅動 GUI 的步驟需 Mac／PC 的 Obsidian；Home 沒有 GUI，但可用 SSH 在 Mac 的 TestVault 資料夾寫入筆記與佈署外掛檔案，Mac 的 Obsidian 開著時 Sync 會同步到手機，2026-11-17 實測 Mac 暫存目錄可寫入、TestVault 資料夾權限可寫）。
- 主 vault 是 **ObsidianVault**（Mac：`/Users/aikenlin/Obsidian/ObsidianVault`；PC：`C:\Obsidian\ObsidianVault`）：真實筆記。未經 Aiken 同意，不要改主 vault 的設定或檔名。
