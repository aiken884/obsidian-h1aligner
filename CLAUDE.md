# CLAUDE.md

## 跨專案聯絡指揮塔 / 其他專案 agent

需要聯絡其他專案的指揮塔或 agent（例如回報進度、任務交接、詢問問題）時，先查閱 herdr-bridge 指揮塔維護的三層通訊架構使用指南：

```bash
remagraph search --project herdr-bridge --task-id herdr-bridge-three-channel-usage-guide
# 或用跨專案標籤查：
remagraph search --cross-project-label topic:how-to-contact-tower
```

指南涵蓋以下管道的使用時機與範例：

- **Primary**：`remagraph store` / `search`（非同步、持久，任何裝有 remagraph CLI 的 agent 都能用）
- **Secondary**：ACP `dispatch_with_memory_confirm`（herdr-bridge 內部 API，一般用不到）
- **Tertiary**：side-channel `/tmp/tower-reports.sock`（僅限被指揮塔明確派工、拿到 report_sock 路徑者使用）
- **即時互動**：`herdr pane send-text`（送出後務必驗證真的送達，不能假設成功）

## 發版分流（階段一尚未釋出）

- 已發布：`0.11.2`。
- 這次修復（白名單／衝突提示／設定頁 1.13.7 render）：分支 `release/0.11.3`。正式釋出時在該分支 `npm version patch` → `0.11.3`。**階段一還沒發之前，這類 patch 修復先 commit 到 `release/0.11.3`，再 merge 進 `main`。** 不要先改 main 再 cherry-pick，以免漏帶或把階段一帶進 0.11.3。
- 階段一（lock／通知 Undo／tag-move notice）只在 `main`，之後 `npm version minor` → `0.12.0`。
- ObsidianTestVault 一次只能裝一個 build。Aiken 用手機測階段一時維持 `main`；要驗不含階段一的 0.11.3 時再換成 `release/0.11.3`。

## Vaults

- **ObsidianTestVault**（Mac：`/Users/aikenlin/Obsidian/ObsidianTestVault`）是專門固定拿來測試的資料庫。外掛實機驗證、設定頁驗證、Obsidian Sync 到手機，都用這個 vault。
- 主 vault 是 **ObsidianVault**（Mac：`/Users/aikenlin/Obsidian/ObsidianVault`）：真實筆記。未經 Aiken 同意，不要改主 vault 的設定或檔名。
