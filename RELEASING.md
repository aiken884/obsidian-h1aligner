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
#    Copy main.js + manifest.json + styles.css into <vault>/.obsidian/plugins/h1aligner/
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

H1Aligner is submitted to the [obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
repository **once** — subsequent versions are pulled automatically from this
repo's GitHub Releases.

1. Fork [obsidian-releases](https://github.com/obsidianmd/obsidian-releases).
2. Add an entry to `community-plugins.json` (at the end of the list):
   ```json
   {
       "id": "h1aligner",
       "name": "H1Aligner",
       "author": "Aiken Lin",
       "description": "Align your note filename with the first H1 on file switch.",
       "repo": "aiken884/obsidian-h1aligner"
   }
   ```
3. Open a PR against `obsidian-releases` following the
   [submission guidelines](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).
4. Wait for review — the automated bot and the Obsidian team check for: unique
   `id`, no `obsidian` substring in the id (✅ ours is `h1aligner`), release tag
   matching `manifest.json`'s version, `main.js` + `manifest.json` attached to
   the release, and a working install from a fresh vault.
5. Address any reviewer feedback. Once merged, the plugin appears in
   **Community plugins** browser within 24h.

## Post-release verification

- [ ] Fresh vault: install via Community plugins (or BRAT pre-listing), enable, verify a basic rename works.
- [ ] Existing vault: ensure no breakage on update.
- [ ] Check the GitHub Release page shows `main.js` + `manifest.json` + `styles.css` as assets.
- [ ] Update README badge counts if the test suite grew.
