# CLAUDE.md

## 發版

- 已發布：`0.11.2`。**0.12.0** 合併階段一（lock／通知 Undo／tag-move notice）與設定頁修復；不再使用 `release/0.11.3`。
- 發版由 Home 執行（`npm version`、tag、GitHub release）。Mac 不必部署或更換 TestVault，除非 Aiken 要求對到正式版。
- 後續 patch／minor 直接在 `main` 上做。

## Vaults

- **ObsidianTestVault**（Mac：`/Users/aikenlin/Obsidian/ObsidianTestVault`）是專門固定拿來測試的資料庫。外掛實機驗證、設定頁驗證、Obsidian Sync 到手機，都用這個 vault。重置／佈署測試筆記見 `.claude/skills/h1aligner-test-vault/SKILL.md`（需 GUI Obsidian；Home 沒有 GUI Obsidian，在 Home 上的任何 agent 都不能跑）。
- 主 vault 是 **ObsidianVault**（Mac：`/Users/aikenlin/Obsidian/ObsidianVault`）：真實筆記。未經 Aiken 同意，不要改主 vault 的設定或檔名。
