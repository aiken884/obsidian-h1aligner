# 設計文件：Move tags to frontmatter（實驗性）

日期：2026-08-07　狀態：待審（pplx review）
對象版本：H1Aligner（社群 id `heading-aligner`）v0.9.0 之後

## 1. 功能定位

Rename 流程執行時，選擇性地把筆記內文的 hashtag 整理進 frontmatter 的 `tags` 屬性。
單一用途、只動該動的位元組：不重排格式、不碰時間戳、不動與 tag 無關的任何內容。

**預設關閉，標示為實驗性功能。** 理由：本功能（依模式）會修改筆記內文，是本
plugin 第一次超出「檔名 + frontmatter」的變更範圍，屬不可逆操作。

## 2. 決策紀錄（與 Aiken 逐項拍板）

| # | 決策點 | 結論 |
|---|--------|------|
| 1 | 內文 hashtag 處置 | 三段式選項（保留／去 `#`／整個刪除），預設**保留** |
| 2 | 觸發語意 | rename 流程有跑就搬（含 `same-name`、`no-h1` 等 skip 情況）；`locked` 與 scope 排除不碰 |
| 3 | edit 觸發 | **跳過** tag 搬移（防止打字暫停 2 秒後，未完成的 tag 被搬走） |
| 4 | Undo 範圍 | v1 只還原檔名（現狀）；內文由 Obsidian File Recovery 兜底；activity log 記錄 |
| 5 | Batch preview | 每列加註「+N tags」計數 |
| 6 | CJK 汙染 tag（`#重點。`） | 原樣搬移，不擅自改名、不跳過 |
| 7 | 預設值與定位 | 預設 off、UI 與 README 標示 Experimental（Aiken 明確要求） |

## 3. 技術基礎（研究實證，非假設）

三路研究（官方 obsidian.d.ts、Obsidian 1.13.4 反編譯實證、社群方案調查）結論：

1. **tag 來源用 `metadataCache` 官方 parser，不自刻 regex。**
   `cache.tags: TagCache[]` 含每個 inline tag 的精確 start/end offset；
   code block、inline code、URL、frontmatter、math、HTML 註解內的 `#` 在
   parser 層就不會產生 tag。社群所有既有方案（Linter、yaml-my-hashtags）都
   自刻 regex 而踩坑（Linter #1535 純數字誤判 open issue）。
2. **`cache.tags` 不含 frontmatter tags**（frontmatter tags 只在
   `cache.frontmatter`，用 `parseFrontMatterTags` 讀，回傳一律帶 `#`）。
3. **`Vault.process()`** 是官方明示的 atomic read-modify-write；
   **`FileManager.processFrontMatter`** 內部即 `vault.process`，同級 atomic，
   但會整段重新序列化 frontmatter（YAML 註解消失、單行 array 變 block list）
   —— 本 plugin 的 alias 功能既有此行為，維持一致，README 揭露。
4. **cache staleness 防護（官方 pattern）**：在 `process()` callback 內逐
   tag 驗證 `data.slice(start.offset, end.offset) === tag`，不符即跳過該
   tag；由檔尾往檔頭刪，避免 offset 位移。
5. **三種位置的 tag 在 cache 內但不可搬**：`%%註解%%` 內、heading 內
   （删 H1 內 tag 會改變 H1 → 下次 rename 檔名又變，自我觸發）、連結文字
   `[#tag](url)` 內。用 `cache.sections`／`cache.headings`／`cache.links`
   的 position 交叉比對排除。

## 4. 設定（3 項新增，全部進 batch fingerprint 與 normalizeSettings）

| 設定 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `moveTagsToFrontmatter` | boolean | `false` | 總開關；UI 標題標「實驗性」，說明文字警告會修改內文、建議確認 File Recovery 已啟用 |
| `bodyTagHandling` | `'keep' \| 'remove-hash' \| 'remove-tag'` | `'keep'` | 對齊 Linter 三段式；`remove-tag` 說明加註句中 tag 風險 |
| `tagsToIgnoreForMove` | string[] | `[]` | 忽略名單（不含 `#`；比對 case-insensitive，nested tag 以全名比對） |

## 5. 演算法（核心資料流）

```
runRename(file) 尾端（rename 執行或 skip 後、locked/scope 排除前已 return）：
  if (!settings.moveTagsToFrontmatter) return
  if (source === 'edit') return                    // 決策 3
  cache = metadataCache.getFileCache(file)         // rename 不清 cache，可用
  candidates = cache.tags
      .filter(不在 %%註解%%、heading、連結文字內)     // position 交叉比對
      .filter(tag 名不在 tagsToIgnoreForMove)       // case-insensitive
  if (candidates 為空 && frontmatter 無需變更) return

  // 第一步（僅 remove-hash / remove-tag 模式）：
  vault.process(file, (data) => {
    for (tag of candidates 由檔尾往檔頭):
      if (data.slice(start, end) !== tag.tag) continue   // staleness 驗證
      remove-hash → 刪 '#' 一個字元
      remove-tag  → 刪 [start, end)；若前一字元是空白一併刪（對齊 Linter）
    return data'
  })

  // 第二步（一律）：
  processFrontMatter(file, (fm) => {
    existing = parseFrontMatterTags 語意讀取現值（相容字串/陣列/單複數 key 現值）
    merged = dedupe(existing ∪ candidates 名稱)     // case-insensitive、
                                                    // 保留首見大小寫、去 '#'
    fm.tags = merged（list 格式；nested 直接 'a/b'）
  })                                               // try/catch，失敗不影響 rename 結果
```

順序不可倒：第二步不依賴任何 position，寫入後 cache 失效不影響正確性。
兩步之間使用者插入編輯的最壞情況 = 使用者的字照常保留（安全方向）。

錯誤處理：兩步各自 try/catch；任何失敗記 console.error + activity log，
不使 rename outcome 變 error（rename 本體已成功）。

## 6. 整合點

- `settings.ts`：3 個新欄位 + `DEFAULT_SETTINGS` + `normalizeSettings` 防禦
  性驗證（沿用既有 pattern：wrong-typed 回預設）。
- `main.ts`：`batchSettingsFingerprint()` 納入 3 個新設定；
  `triggerRename` 傳遞 source 供 edit 判斷。
- `rename-service.ts`：新增 tag 搬移私有方法，`runRename` 尾端呼叫；
  dryRun 時回傳將搬移的 tag 數（供 batch preview）。
- `batch-modal.ts`：列尾加「+N tags」註記（i18n）。
- `settings-tab.ts`：實驗性區段（總開關 + 模式下拉 + 忽略名單 textarea）。
- `i18n.ts`：全部新字串補齊（en + zh-TW 及現有語系結構）。
- `activity-log.ts`：記錄搬移 tag 數（沿用既有 record 結構的 detail 欄）。

## 7. 明確不做（YAGNI）

自動修正汙染 tag 名稱、tag 白名單模式、內文 undo、mdast/remark 等任何
parser 依賴、`tag`（單數）key 的寫入支援（讀取相容即可）。

## 8. 測試計畫（vitest，沿用既有 harness）

- 位置過濾：`%%…%%`、heading 內、連結文字內、一般段落、blockquote（應搬）
- staleness：offset 驗證失敗 → 該 tag 跳過、其餘照常
- 三種模式的內文變更結果（含「刪除連同前導空白」）
- 去重：case-insensitive（`#Test` vs 既有 `test`）、nested、frontmatter
  既有字串型 `tags: single` 相容
- CJK：`#重點。` 原樣搬移；中文 tag、emoji tag
- 忽略名單；edit source 跳過；locked 不碰；設定 normalize 防禦
- fingerprint：改任一新設定使 batch preview 失效
