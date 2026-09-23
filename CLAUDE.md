# CLAUDE.md

## 發版

- 已發布：**0.12.0**（階段一 lock／通知 Undo／tag-move notice + 設定頁修復）。GitHub：https://github.com/aiken884/obsidian-h1aligner/releases/tag/0.12.0
- **階段二**（Explain this note、批次 out-of-scope 計數、資料夾 what-if 預覽）在分支 `feature/0.12.0-batch2`。磁碟上的 `manifest.json` / `package.json` 仍是 `0.12.0`，**尚未對外發 0.13.0**。內部測試未完成前不要 bump 版本、不要 merge 進 `main`。
- 實機清單：`docs/MOBILE-TESTING.md` 項目 17–19。設計：`docs/design-batch2-explain-oos-folder-preview.md`。審查：`docs/review-batch2.md`。
- 發版由 Home 執行（`npm version`、tag、GitHub release）。Mac 不必部署或更換 TestVault，除非 Aiken 要求。

## Vaults

- **ObsidianTestVault**（Mac：`/Users/aikenlin/Obsidian/ObsidianTestVault`）是專門固定拿來測試的資料庫。外掛實機驗證、設定頁驗證、Obsidian Sync 到手機，都用這個 vault。重置／佈署測試筆記見 `.claude/skills/h1aligner-test-vault/SKILL.md`（需 GUI Obsidian；Home 沒有 GUI Obsidian，在 Home 上的任何 agent 都不能跑）。
- 主 vault 是 **ObsidianVault**（Mac：`/Users/aikenlin/Obsidian/ObsidianVault`）：真實筆記。未經 Aiken 同意，不要改主 vault 的設定或檔名。
