# Releasing H1Aligner

## Pre-release maintenance cadence

每次 **minor** release 前跑一次：

1. `npm outdated` — 看 dev dependencies 有無落後（Dependabot 每月也會開 grouped PR）。
2. 檢查 obsidian typings：目前釘 `~1.4.11` 對齊 `minAppVersion: 1.4.0`。若程式碼開始使用較新 API，
   同步提升三者：`devDependencies.obsidian`、`manifest.json` 的 `minAppVersion`、`versions.json` 新條目。
   （Dependabot 對 `obsidian` 套件設為 ignore — typings 升版是刻意決策，不自動化。）
3. 跑 `docs/MOBILE-TESTING.md` 的實機 checklist（iPhone + Android），結果記錄在該檔案的驗證紀錄表。

## Versioning

H1Aligner follows [Semantic Versioning](https://semver.org/):

- **MAJOR** — breaking changes to settings schema or default behaviour
- **MINOR** — new features that don't break existing setups
- **PATCH** — bug fixes only

The version number lives in **three** files and must agree:

1. `package.json`     → `"version": "X.Y.Z"`
2. `manifest.json`    → `"version": "X.Y.Z"`
3. `versions.json`    → maps each plugin version to the minimum supported Obsidian version

You never edit them by hand: `npm version` keeps all three in sync (see below).

> **Tag convention**: the Obsidian community plugin loader requires the GitHub
> release tag to be **exactly the version with no `v` prefix** (`0.1.0`, not
> `v0.1.0`). The repo's `.npmrc` sets `tag-version-prefix=""` so `npm version`
> creates the correctly-named tag automatically.

## Release flow

```bash
# 1. Clean state
git status                    # working tree must be clean, on main

# 2. Tests green + production build
npm test                      # all suites pass
npm run build                 # main.js written, no TS errors

# 3. Smoke-test in a real vault
#    Copy main.js + manifest.json + styles.css into <vault>/.obsidian/plugins/heading-aligner/
#    Reload Obsidian, enable the plugin, verify behaviour on a few files

# 4. Bump the version (updates package.json + manifest.json + versions.json,
#    commits, and creates the un-prefixed tag X.Y.Z)
npm version patch             # or: minor / major

# 5. Push the commit and the tag
git push origin main
git push origin X.Y.Z
```

Pushing the tag triggers `.github/workflows/release.yml`, which builds the
plugin, runs the tests, and creates a **draft GitHub release** with `main.js`,
`manifest.json` and `styles.css` attached as individual assets.

Then on GitHub:

1. Open **Releases**, find the draft for `X.Y.Z`.
2. Write the changelog summary — what's new, what's fixed, breaking changes.
3. Publish.

### Manual fallback (if Actions is unavailable)

Draft a release yourself: tag `X.Y.Z` (no `v` prefix), title `X.Y.Z`, and
attach `main.js` + `manifest.json` + `styles.css` as individual binary assets
— not inside a zip.

## Obsidian community plugin submission (first release only)

提交流程（2026 現行版 — 經 community.obsidian.md 網站，不再是 fork obsidian-releases 開 PR）：

1. 確認 repo 根目錄有 `README.md`、`LICENSE`、`manifest.json`，且已發佈至少一個
   GitHub release（tag = manifest version、無 `v` 前綴，附 `main.js` + `manifest.json` + `styles.css`）。
2. 登入 [community.obsidian.md](https://community.obsidian.md)，連結 GitHub 帳號驗證 repo 所有權。
3. 側欄 **Plugins → New plugin** → 輸入 repo URL → 同意開發者政策 → **Submit**。
4. 自動檢查 bot 會即時回饋。常見檢查點：`id` 僅限小寫字母與連字號、不含 "obsidian"、不以 "plugin" 結尾（✅ `heading-aligner` — 注意：數字不允許，`h1aligner` 曾因此被打回）、
   description ≤ 250 字元且以句號結尾、`minAppVersion` 已設、無捐款則不得留 `fundingUrl`（✅ 已移除）、
   使用 Node/Electron API 者必須 `isDesktopOnly: true`（✅ 本外掛零 Node API、`false` 經驗證）、
   指令 ID 不含外掛 ID 前綴（✅）。
5. 需要修正時：改完發新 release（版本遞增）即可重跑檢查。
6. 通過自動檢查後進入人工審核（時程數週不等）。核准後外掛出現在
   Community plugins 瀏覽器；**之後的版本更新不需重新送審** — 發新 GitHub release 目錄就會自動抓取。

發佈後推廣（選項）：論壇 Share & Showcase 版、Discord `#updates` 頻道（需 developer 角色）。

## Post-release verification

- [ ] Fresh vault: install via Community plugins (or BRAT pre-listing), enable, verify a basic rename works.
- [ ] Existing vault: ensure no breakage on update.
- [ ] Check the GitHub Release page shows `main.js` + `manifest.json` + `styles.css` as assets.
- [ ] Update README badge counts if the test suite grew.
