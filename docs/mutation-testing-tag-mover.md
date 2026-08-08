# Mutation testing notes — src/tag-mover.ts

日期：2026-08-08

## 結果

Stryker（`npm run test:mutation`）對 `src/tag-mover.ts` 報告 **94.65%**（177/187
killed，10 survived）。逐一手動把每個「survived」突變直接套用到原始碼、跑
`tag-mover.test.ts` + `tag-mover.property.test.ts` + `tag-move-integration.test.ts`
驗證後的**地面真相**：187 個突變中，**8 個是真正語意等價、任何測試都不可能殺死**；
其餘 **179 個全部被測試殺死**（含 Stryker 自己漏報為 survived 的 2 個——`movableTags`
的 span-containment predicate 恆真、`mergeTagsIntoList` 的 finite-number-check
predicate 恆真，直接手動套用突變後測試確實會失敗，證明測試有效，只是 Stryker 的
`perTest` 覆蓋率分析在遇到 fast-check 隨機種子的 property test 時，覆蓋率快照會隨
每次執行變動，導致誤判）。真實可達上限 = 179/187 ≈ **95.72%**，測試套件已達到這個
上限。

## 8 個等價突變（不可能殺死，已用原始碼手動驗證確認）

不用 mutant ID（每次執行不保證穩定），改用程式碼位置描述：

1. `movableTags` 開頭 `if (tags.length === 0) return [];`——拿掉這行，`[].filter(...)`
   本來就回傳 `[]`，行為完全相同。
2. `(cache.sections ?? [])` 的 `?? []` 後備陣列內容——後面接著 `.filter(s => s.type
   === 'comment')`，任何形狀不符的後備內容都會被這個 filter 濾掉，換成什麼陣列內容
   都一樣。
3. `applyBodyTagRemoval` 的 `prev = from > 0 ? text.charAt(from - 1) : ''`——JS 的
   `String.charAt()` 對任何越界索引（含負數）本來就安全回傳 `''`，這個三元判斷式在
   數學上是多餘的（保留是為了可讀性，不是必要邏輯）。同理 `next = to < text.length
   ? text.charAt(to) : ''`。這組共衍生 4 個突變（`>`/`>=` 各一、`<`/`<=` 各一）。
4. `mergeTagsIntoList` 的 `existing.split(/[,\s]+/)` 拿掉 `+` 量詞——分割出的空字串
   會被 `push()` 內的 `if (!cleaned) return` 濾掉，最終非空 token 集合不變。
5. `mergeTagsIntoList` 的 `existing == null ? [] : [existing]` 判斷式恆為 `false`
   （永遠走 `[existing]` 分支）——當 existing 真的是 null/undefined 時，`[existing]`
   會是 `[null]`，但後續迴圈的型別守衛（只接受 string／finite number）會安全跳過，
   最終輸出不變。

## 曾出現過一次、後續驗證證實是真實漏洞並已修正

`normalizeTagName` 與 `mergeTagsIntoList` 內部去除開頭 `#` 用的正則若被移除 `^`
錨點（`/^#+/` → `/#+/`），會誤刪字串「中間」的 `#`（例如 `'a#b'` 被錯改成
`'ab'`）。這個突變在某次 Stryker 執行中出現過，直接手動驗證後確認是真實漏洞（80
個既有測試全部通過、沒有任何一個抓到），已補上回歸測試：
`normalizeTagName('a#b')` 與 `mergeTagsIntoList(['a#b'], [])` 皆須保持 `#` 不動。

## 重跑注意事項

- `.stryker-tmp/` 需保持清空（`ignorePatterns` 已排除 `.codegraph` 這個含 socket
  檔案的目錄，Stryker 建沙箱時無法複製 socket，否則會直接崩潰）。
- 若某次執行報告的 survived 數量比這份記錄多，**先手動套用該突變到原始碼、跑測試
  確認是否真的沒被抓到**，不要直接信任 Stryker 的覆蓋率分析——已證實它在 property
  test（fast-check 隨機種子）情境下會有假陰性（誤報 survived，實際上測試有效）。
- `stryker.conf.json` 的 `break` threshold 設為 0（僅供資訊參考、不擋 CI），原因
  同上——用一個會隨機浮動的分數當硬性關卡不合理。
