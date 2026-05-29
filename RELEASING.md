# Releasing H1Aligner

This document describes the manual release flow used for H1Aligner v0.1.0 onwards.
Once GitHub Actions are wired up (Phase 2), most of this becomes automatic.

## Versioning

H1Aligner follows [Semantic Versioning](https://semver.org/):

- **MAJOR** — breaking changes to settings schema or default behaviour
- **MINOR** — new features that don't break existing setups
- **PATCH** — bug fixes only

The version number lives in **three** files and must agree:

1. `package.json`     → `"version": "X.Y.Z"`
2. `manifest.json`    → `"version": "X.Y.Z"`
3. `versions.json`    → maps each plugin version to the minimum supported Obsidian version

`versions.json` is added in v0.2.0 onwards. For v0.1.0 the `manifest.json` `minAppVersion` field carries that information.

## Local release checklist

Before tagging a release:

```bash
# 1. Clean state
git status                    # working tree must be clean

# 2. Tests green
npm test                      # all suites pass

# 3. Production build
npm run build                 # main.js written, no TS errors

# 4. Smoke-test in a real vault
#    Copy main.js + manifest.json into <vault>/.obsidian/plugins/h1aligner/
#    Reload Obsidian, enable the plugin, verify behaviour on a few files

# 5. Bump version (manual — automation comes in Phase 2)
#    Edit package.json + manifest.json so both say the new X.Y.Z

# 6. Commit + tag
git add package.json manifest.json
git commit -m "chore: release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main
git push origin vX.Y.Z
```

## GitHub Release

1. Go to **Releases → Draft a new release** on GitHub.
2. **Tag**: select the `vX.Y.Z` tag you just pushed. Do NOT prefix it with `v` inside the title field — the Obsidian community plugin loader expects the *tag name* to be exactly the version (e.g. `0.1.0`, no `v` prefix per Obsidian's convention). If you tagged with `v` prefix locally, push an additional tag without the prefix:
   ```bash
   git tag 0.1.0 vX.Y.Z
   git push origin 0.1.0
   ```
3. **Title**: `H1Aligner vX.Y.Z`
4. **Description**: changelog summary — what's new, what's fixed, breaking changes.
5. **Attach binaries**:
   - `main.js`
   - `manifest.json`
   - (optional) `styles.css` if the plugin grows a stylesheet
6. Publish.

## Obsidian Community Plugin submission (first release only)

H1Aligner is submitted to the [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repository **once** — subsequent versions are pulled automatically from this repo's GitHub Releases.

1. Fork [obsidian-releases](https://github.com/obsidianmd/obsidian-releases).
2. Add an entry to `community-plugins.json` (alphabetically):
   ```json
   {
       "id": "h1aligner",
       "name": "H1Aligner",
       "author": "Aiken Lin",
       "description": "Align your note filename with the first H1 on file switch.",
       "repo": "aiken884/obsidian-h1aligner"
   }
   ```
3. Open a PR against `obsidian-releases` referring the [submission guidelines](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).
4. Wait for review — the Obsidian team checks for: unique `id`, no `obsidian` substring in the id (✅ ours is `h1aligner`), MIT-compatible license, working install from a fresh vault.
5. Address any reviewer feedback. Once merged, the plugin appears in **Community plugins** browser within 24h.

## Post-release verification

After the release is published:

- [ ] Fresh vault: install via Community plugins, enable, verify a basic rename works.
- [ ] Existing vault: ensure no breakage on update.
- [ ] Check GitHub Release page shows the right binaries.
- [ ] Update README badge URLs if any (e.g. version, download count).

---

Phase 1 MVP `v0.1.0` ships with manual release. Phase 2 will add a GitHub Actions workflow that does the build, tag, and Release attach in one push to `main`.