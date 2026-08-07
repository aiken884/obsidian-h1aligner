# 設計文件：Move tags to frontmatter（實驗性）

日期：2026-08-07　狀態：**完成，已部署（未發布）**——共識版，執行狀態見
`docs/implementation-move-tags-to-frontmatter.md` 開頭摘要
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
5. **三種位置的 tag 在 cache 內但不可搬**。「不可搬區段」明確定義如下，
   判斷集中在單一函式 `movableTags()`（pplx 審核採納）：
   - **heading 行**：tag 的 start.line 等於任一 `cache.headings[].position` 的行
     （heading 為單行；刪 H1 內 tag 會改變 H1 → 下次 rename 檔名又變，自我觸發）
   - **連結範圍**：tag 的 offset 區間落在任一 `cache.links[].position` 區間內
   - **block 註解**：tag 的 offset 區間落在任一 `cache.sections[]` 中
     `type === 'comment'` 的區間內
   - **inline `%%…%%`**：同一行內 tag 之前有奇數個 `%%` → 跳過。此為
     heuristic，方向保守（只會多跳過、不會多搬）；跨行 `%%` 由上一條
     block 註解涵蓋。

## 4. 設定（3 項新增，全部進 batch fingerprint 與 normalizeSettings）

| 設定 | 型別 | 預設 | 說明 |
|------|------|------|------|
| `moveTagsToFrontmatter` | boolean | `false` | 總開關；UI 標題標「實驗性」，說明文字警告：(a) 依模式會修改內文；(b) **會重寫 frontmatter 並移除其中的 YAML 註解**；(c) 僅在 rename 流程觸發時整理、不在即時編輯（edit 觸發）時執行；(d) 不會自動清理 tag 名稱中的標點或重新命名 tag；建議確認 File Recovery 已啟用 |
| `bodyTagHandling` | `'keep' \| 'remove-hash' \| 'remove-tag'` | `'keep'` | 對齊 Linter 三段式；`remove-tag` 說明加註句中 tag 風險 |
| `tagsToIgnoreForMove` | string[] | `[]` | 忽略名單（不含 `#`；nested tag 以全名比對） |

**Tag 名稱正規化（單一函式，ignore 比對與去重共用）**：
`normalizeTagName(s) = foldName(去除前導 '#' 後 trim)`——即 NFC 正規化 +
toLowerCase（沿用既有 `foldName`），保留 `/` 階層分隔。名單儲存時亦先去 `#`。
測試涵蓋 `#A/B`／`a/b`／`A/B`／`#a`／`#a/b/c` 全組合（pplx 審核採納）。

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
  candidates.sort((a,b) => b.position.start.offset - a.position.start.offset)  // 明確由檔尾往檔頭
  vault.process(file, (data) => {
    for (tag of candidates):
      if (data.slice(start, end) !== tag.tag) { skippedStale++; continue }  // staleness 驗證＋記錄
      remove-hash → 刪 '#' 一個字元
      remove-tag  → 刪 [start, end)；前一字元屬 [空格、tab、全形空白 U+3000]
                    時一併刪該一個字元（不吞換行，保行結構；對齊 Linter 並收斂）
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

**觸發分支明細（pplx 審核採納：逐分支規格化）**：

| runRename 結果 | 執行 tag 搬移？ | 理由 |
|---|---|---|
| `none`（實際改名） | ✅ | 核心情境 |
| `same-name`／`case-only` | ✅ | 檔名已對齊的筆記也要能整理 tag（Aiken 決策 2） |
| `no-h1`／`empty-after-sanitize`／`collision` | ✅ | tag 整理與 H1 内容、碰撞無關 |
| `locked` | ❌ | 尊重 per-file opt-out |
| `in-progress` | ❌ | 同檔已有進行中作業 |
| source = `edit` | ❌ | Aiken 決策 3（呼叫端以 `allowTagMove: false` 傳入） |
| `cache === null` | ❌（記 log） | 未索引完成，不 fallback regex（pplx 審核採納） |

**兩步式寫入的間隙失效模式分析（pplx critical #2 之回應——維持兩段式的理由）**：
第二步（processFrontMatter）的輸入只有 candidates 的「tag 名稱」，不使用任何
position；它在自己的 atomic callback 內以**當下**檔案的 frontmatter 為準做合併。
因此兩步之間發生外部編輯時，逐情境分析：
(a) 外部改了內文 → 第二步不受影響（只動 frontmatter）；
(b) 外部改了 frontmatter → 第二步以新值為底合併，正確；
(c) 外部刪了某 tag → 該 tag 仍被加入 frontmatter（等同 keep 模式效果），
    方向安全、不遺失任何使用者資料；
(d) 第一步 staleness 驗證失敗的 tag → 內文保留＋frontmatter 有（= keep），安全。
單一 callback 合併方案（自行序列化整段 YAML）被否決：自擔 YAML 序列化
正確性的風險大於上述可證明安全的間隙行為。

錯誤處理：兩步各自 try/catch；任何失敗記 console.error + activity log，
不使 rename outcome 變 error（rename 本體已成功）。
activity log 記錄 `moved`／`skippedStale` 計數（pplx 審核採納）。

**Frontmatter canonical schema（pplx 審核採納；對抗式審查修訂）**：讀入時
`tags`／`tag`（單複數）皆正規化為 `string[]`——**字串依逗號／空白拆分**
（對齊 Obsidian parseFrontMatterTags 對 legacy `tags: a, b` 的語意，
對抗式審查 #1 修正）、數字→String()、非法項（含巢狀陣列）過濾；
寫回**只寫 `tags: string[]`**；`tag` key 只讀不寫、原樣保留。
兩者並存時以 `tags` 為底、`tag` 值忽略。

## 6. 整合點

- `settings.ts`：3 個新欄位 + `DEFAULT_SETTINGS` + `normalizeSettings` 防禦
  性驗證（沿用既有 pattern：wrong-typed 回預設）。
- `main.ts`：`batchSettingsFingerprint()` 納入 3 個新設定；
  `triggerRename` 傳遞 source 供 edit 判斷。
- `rename-service.ts`：新增 tag 搬移私有方法，`runRename` 尾端呼叫；
  dryRun 時回傳將搬移的 tag 數（供 batch preview）。
- `batch-modal.ts`：列尾註記——keep 模式「+N tags」、remove 模式
  「+N tags（內文將修改）」（i18n；pplx 審核採納：揭露內文副作用）。
  **僅 rename 群組顯示**（對抗式審查拍板）：batch 的 Apply 只處理 rename
  項，skipped 檔案的 tag 搬移由自動觸發（file-open／leave／manual）補做，
  預覽不顯示 batch 不會執行的動作。
- `settings-tab.ts`：實驗性區段（總開關 + 模式下拉 + 忽略名單 textarea）。
- `i18n.ts`：全部新字串補齊（en + zh-TW 及現有語系結構）。
- `activity-log.ts`：記錄搬移 tag 數（沿用既有 record 結構的 detail 欄）。

## 6.5 已知限制（對抗式審查記錄）

- **畸形 frontmatter**（檔首有 `---` 但無結尾 `---`）：Obsidian 不視其為
  frontmatter；`processFrontMatter` 會在檔首插入新的 frontmatter 區塊，原
  孤立 `---` 行殘留於內文。此為官方 API 行為，實驗性功能不另行處理。
- **自我連結改寫**：`renameFile` 更新筆記內指向自己的連結時會位移 offset，
  該輪受影響的 tag 由 staleness 防護跳過（計入 stale 並記 log），下一次
  觸發補做。

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
