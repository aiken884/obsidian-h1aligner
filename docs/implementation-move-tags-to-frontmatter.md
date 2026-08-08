# 實作文件：Move tags to frontmatter（實驗性）

日期：2026-08-07　狀態：**完成，已部署（未發布）**
依據：`docs/design-move-tags-to-frontmatter.md`（共識版）

## 完成狀態摘要（2026-08-07）

- 實作＋33-agent 對抗式審查（23 項確認全數修正）＋14 場景實機測試（額外發現並修正
  2 個真實 bug：外部連結 tag 排除缺口、activity log 遺漏 renamed 時的 tag 摘要）
- 額外實測：edit 觸發跳過防護（真實鍵盤時序）、batch apply 真實點擊套用（非 dry-run）
- README／CHANGELOG 已補上 Experimental 段落
- 293 單元測試、20 E2E 全綠；已 commit + push 到 `origin/main`（`f5d20ad..4a538e3`，
  10 commits），**未打 version tag、未發布**——功能預設關閉，部署於
  ObsidianTestVault 與主 ObsidianVault 供本機持續測試
- 已記錄至 RemaGraph（`mem-20260807-002`，project `obsidian-h1aligner`）
- **2026-08-08 加測：** fast-check property-based 測試（`tests/tag-mover.property.test.ts`，
  19 個不變性）＋ Stryker mutation testing（`src/tag-mover.ts`，詳見
  `docs/mutation-testing-tag-mover.md`）。過程中額外揪出並修正 2 個真實漏洞：
  去 `#` 正則只去一個會殘留、正則失去錨點會誤刪字串中間的 `#`。單元測試
  293→326，326 測試＋20 E2E 全綠
- 正式發布時走 `RELEASING.md`：`npm version` → push tag → publish draft release

## pplx 二輪修訂要點

1. **Rollback（採納，二輪 major）**：先刪內文、後寫 frontmatter 的順序不可倒
   （frontmatter 寫入會位移整個 body 的 offset，使 staleness 驗證全部失效）。
   但第二步失敗時第一步已刪的 tag 會遺失 → 加 best-effort rollback：
   保存第一步前原文；processFrontMatter 失敗時 `vault.process` 還原——callback
   內驗證「當下內容 === 第一步輸出」才還原，不符（外部已編輯）則放棄還原並記 log。
2. **fm.tag/fm.tags 優先序（採納，二輪 critical）**：`existing = fm.tags !== undefined
   ? fm.tags : fm.tag`；兩者並存時以 `tags` 為底、`tag` 忽略且原樣保留（Obsidian
   官方 parseFrontMatterTags 僅認 `/^tags$/i`）。非字串非有限數字項（含巢狀陣列）過濾。
3. **staleness 失敗語意（採納，二輪 critical）**：驗證失敗 → 該 tag 整筆跳過、
   不做任何局部修改（實作即如此，明文化）。
4. **allowTagMove 傳遞（部分採納，二輪 critical）**：預設 true；edit 判斷集中於
   main.ts `triggerRename` 單一傳遞點（所有自動觸發唯一入口），以測試保證。
5. **其餘採納**：`%%` heuristic 僅做純文字行切片不做語法解析；comment `type`
   為現版相容性假設（補 sections 缺失測試）；remove-tag 白名單 [space, tab,
   U+3000]、NBSP 不刪；batch tagCount 為 dry-run 預估值；i18n `{count}` 為整數；
   關閉總開關不清空子設定值（僅不渲染）；補混合情境整合測試
   （inline+frontmatter+ignore+edit 跳過）與 parser 排除區驗證測試。

## 模組切分

### 新檔 `src/tag-mover.ts`（純邏輯，不 import Obsidian — 沿用 batch-triage.ts pattern）

```ts
// 自定義結構型別（與 obsidian TagCache/Pos 結構相容，鴨子型別）
export interface TagPos { start: { line: number; offset: number }; end: { line: number; offset: number } }
export interface InlineTag { tag: string; position: TagPos }
export interface CacheLike {
    tags?: InlineTag[];
    headings?: { position: TagPos }[];
    links?: { position: TagPos }[];
    sections?: { type: string; position: TagPos }[];
}

/** Tag 名稱正規化（ignore 比對與去重共用；pplx 審核採納）：
 *  去前導 '#' → trim → foldName（NFC + toLowerCase，自 rename-service 匯入）。 */
export function normalizeTagName(s: string): string

/** 過濾出可搬移的 tag。不可搬區段（單一函式集中判斷）：
 *  (1) tag.start.line 等於任一 headings[].position 行；
 *  (2) tag offset 區間落在任一 links[].position 區間內；
 *  (3) tag offset 區間落在任一 sections[] type==='comment' 區間內；
 *  (4) 同一行內 tag 之前有奇數個 '%%'（inline 註解 heuristic，只多跳過不多搬）；
 *  (5) normalizeTagName(tag) 在 ignore 名單（名單亦經 normalizeTagName）。 */
export function movableTags(cache: CacheLike, bodyText: string, ignore: string[]): InlineTag[]

/** 合併去重（normalizeTagName 比對）。existing canonical 化：字串→單元素、
 *  數字→String()、其餘非字串項過濾；保留首見大小寫；新增項去 '#'。回傳新陣列。 */
export function mergeTagsIntoList(existing: unknown, incoming: string[]): string[]

/** remove-hash / remove-tag 的內文轉換。candidates 先明確
 *  sort((a,b) => b.position.start.offset - a.position.start.offset)（檔尾→檔頭）。
 *  逐個驗證 data.slice(start,end) === tag（staleness 防護），不符跳過並計數。
 *  remove-tag：前一字元屬 [' ', '\t', '　'(U+3000)] 時一併刪該一字元（不吞換行）。
 *  回傳 { text, applied, skippedStale }。 */
export function applyBodyTagRemoval(
    data: string, candidates: InlineTag[], mode: 'remove-hash' | 'remove-tag',
): { text: string; applied: number; skippedStale: number }
```

### `src/settings.ts`

```ts
export type BodyTagHandling = 'keep' | 'remove-hash' | 'remove-tag';
// H1AlignerSettings 增：
moveTagsToFrontmatter: boolean;   // default false
bodyTagHandling: BodyTagHandling; // default 'keep'
tagsToIgnoreForMove: string[];    // default []
```
`normalizeSettings`：boolean／enum 白名單／cleanStringArray（沿用既有防禦 pattern，
名單項去除前導 `#` 再存）。

### `src/rename-service.ts`

- `RenameOptions` 增 `allowTagMove?: boolean`（預設 true；呼叫端 edit 觸發時傳 false）。
- `RenameOutcome` 增 `movedTags?: number`（dryRun 與實際執行都回報；供 batch 註記與 activity）。
- `runRename`：在現有 return 點之後、`finally` 之前，成功路徑（`skipped` 為
  `'none' | 'same-name' | 'no-h1' | 'empty-after-sanitize' | 'case-only' | 'collision'`，
  即「流程有跑」；`locked`／`in-progress` 除外）呼叫 `maybeMoveTagsToFrontmatter(file, dryRun, allowTagMove)`：

```
private async maybeMoveTagsToFrontmatter(file, dryRun, allow): Promise<number> {
  if (!settings.moveTagsToFrontmatter || !allow) return 0
  cache = metadataCache.getFileCache(file); if (!cache?.tags?.length) return 0
  body  = await vault.cachedRead(file)            // movableTags 需要行文字做 %% heuristic
  cands = movableTags(cache, body, settings.tagsToIgnoreForMove)
  if (!cands.length) return 0
  if (dryRun) return cands.length
  if (settings.bodyTagHandling !== 'keep')
    await vault.process(file, d => applyBodyTagRemoval(d, cands, mode).text)   // 第一步
    // applied/skippedStale 計數保留供 activity log（moved/skippedStale）
  await fileManager.processFrontMatter(file, fm => {                            // 第二步
    merged = mergeTagsIntoList(fm.tags ?? fm.tag, cands.map(c => c.tag))
    fm.tags = merged                                // 只寫 tags；fm.tag 只讀不寫
  })
  return cands.length
}
// 間隙失效模式分析（兩段式安全性證明）見設計文件 §5；第二步只用 tag 名稱、
// 不用 position，在自己的 atomic callback 內以當下 frontmatter 為準合併。
```
  全程 try/catch：任何失敗 console.error + 回傳 0，不改變 rename outcome。
  注意順序：rename 之後才執行（file 的 TFile 已指向新路徑，
  fileManager.renameFile 後 cache 沿用 rename 前內容 — 設計文件 §3.4 的驗證機制保護）。

### `src/main.ts`

- `triggerRename(file, manual, source)` → `renameFromH1(file, { allowTagMove: source !== 'edit' })`。
- `runBatchPreview`：dry run 已回 `movedTags` → `BatchItem.tagCount`；
  apply 迴圈的 outcome.movedTags 記進 activity detail。
- `batchSettingsFingerprint()` 納入 3 個新設定。

### `src/batch-modal.ts`

`BatchItem` 增 `tagCount?: number`；`renderGroup` 列尾註記——keep 模式
`t('batch.tagCount')`（`+{count} tags`，{count} 為整數）、remove 模式
`t('batch.tagCountBody')`（`+{count} tags (body will be modified)`）。
**僅 rename 群組顯示**（最終拍板，與設計文件 §6 同步）：batch Apply 只處理
rename 項；skipped 檔案顯示會承諾 batch 不執行的動作，故不顯示。

### `src/settings-tab.ts` — 「實驗性」區段（heading + 3 控件）

開關名稱含 `t('settings.experimental')` 前綴；描述含四項警告（依設計 §4）：
內文修改、frontmatter 重寫＋YAML 註解移除、僅 rename 流程觸發（非即時編輯）、
不自動清理 tag 名稱；加 File Recovery 提醒；
`bodyTagHandling` dropdown 與忽略名單 textarea 僅在總開關開啟時渲染（沿用既有條件渲染 pattern）。
變更任一新設定 → `saveSettings()`。

### `src/i18n.ts` — 新 key（en／zh-tw／ja 三語系全補）

實際命名（與程式一致，對抗式審查 #23 修正）：`set.exp.heading`、
`set.tagmove.name/desc`、`set.tagmove.body.name/desc/keep/removeHash/removeTag`、
`set.tagmove.ignore.name/desc`、`batch.tagCount`（`+{count} tags`）、
`batch.tagCountBody`（`+{count} tags (body will be modified)`）；`{count}` 為整數。

## 實作順序（TDD；兩條並行線）

**線 A**：`tag-mover.ts` 純邏輯 —— 先寫 `tests/tag-mover.test.ts`（紅）再實作（綠）。
**線 B**：`settings.ts` 欄位＋normalize —— 先寫 `tests/settings.test.ts` 擴充（紅）再實作（綠）。
**合流 C**（A、B 完成後）：`rename-service.ts` 整合＋`tests/rename-service.test.ts` 擴充
（FakeApp 補 `vault.process` mock）→ `main.ts`／`batch-modal.ts`／`settings-tab.ts`／`i18n.ts`。
**驗證 D**：`npm run lint && npx vitest run --coverage && npm run build` 全綠。

## 測試清單（對應設計 §8）

tag-mover：heading 行排除／link 範圍排除／comment section 排除／行內 `%%` 奇數排除／
blockquote 內保留（應搬）／忽略名單 case-insensitive／nested 全名／
merge：字串型 existing、數字型 existing、case-insensitive 去重保留首見大小寫、去 `#`／
removal：remove-hash 只刪 `#`、remove-tag 連前導空白、offset 驗證失敗跳過該 tag 其餘照常、
由後往前不位移、CJK `#重點。` 原樣、emoji tag。
settings：3 欄位預設／壞型別回退／enum 白名單／名單去 `#`。
rename-service：off 時零呼叫／edit（allowTagMove=false）跳過／locked 不搬／same-name 仍搬／
keep 模式不呼叫 vault.process／remove-tag 先 process 後 processFrontMatter（呼叫順序斷言）／
processFrontMatter 失敗不影響 rename outcome／dryRun 回 movedTags 且零寫入。
fingerprint：任一新設定變更 → fingerprint 改變。

## 驗收

lint 0 error；vitest 全綠、coverage 不低於現況；build 產出 main.js；
手動部署到 `/Users/aikenlin/Documents/ObsidianVault`（僅本機，不 release）。
