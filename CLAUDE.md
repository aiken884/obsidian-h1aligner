# CLAUDE.md

## 發版

- 已發布：**0.12.0**（階段一 lock／通知 Undo／tag-move notice + 設定頁修復；2026-09-16，tag `0.12.0`）。GitHub：https://github.com/aiken884/obsidian-h1aligner/releases/tag/0.12.0
- **階段二**（Explain this note、批次 out-of-scope 計數、資料夾 what-if 預覽）在分支 `feature/0.12.0-batch2`，目標版本 **0.13.0**（分支名沿用舊編號）。磁碟上的 `manifest.json` / `package.json` 仍是 `0.12.0`，**尚未對外發 0.13.0**。內部測試未完成前不要 bump 版本、不要 merge 進 `main`。
- 0.12.x 熱修需要 Aiken 另行授權，才在 main 上做；0.13.0 在 `feature/0.12.0-batch2` 準備，發布時 main fast-forward 到 batch2（見 `RELEASING.md`）。合併與比較一律以 `origin/main` 為準（先 `git fetch`）。
- 實機清單：`docs/MOBILE-TESTING.md` 項目 17–19。設計：`docs/design-batch2-explain-oos-folder-preview.md`。審查：`docs/review-batch2.md`。
- 發版由 Home 執行（`npm version`、tag、GitHub release）。Home 沒有 GUI Obsidian：`RELEASING.md` 的桌面 smoke test（含從上一版升級）、`docs/MOBILE-TESTING.md` 的桌面項目、發版後的 Post-release verification，要由 Mac／PC 或 Aiken 執行，結果記進 Verification Log。Mac 不必部署或更換 TestVault，除非 Aiken 要求。

## Vaults

- **ObsidianTestVault**（Mac：`/Users/aikenlin/Obsidian/ObsidianTestVault`；PC：`C:\Obsidian\ObsidianTestVault`）是專門固定拿來測試的資料庫。外掛實機驗證、設定頁驗證、Obsidian Sync 到手機，都用這個 vault。重置／佈署測試筆記見 `.claude/skills/h1aligner-test-vault/SKILL.md`（需 GUI Obsidian；Home 沒有 GUI Obsidian，在 Home 上的任何 agent 都不能跑）。
- 主 vault 是 **ObsidianVault**（Mac：`/Users/aikenlin/Obsidian/ObsidianVault`；PC：`C:\Obsidian\ObsidianVault`）：真實筆記。未經 Aiken 同意，不要改主 vault 的設定或檔名。
