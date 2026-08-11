# Releasing H1Aligner

## Pre-release maintenance cadence

Run once before every **minor** release:

1. `npm outdated` — check whether dev dependencies have fallen behind (Dependabot also opens a grouped PR every month).
2. Check the obsidian typings: `devDependencies.obsidian` is currently `^1.13.1`, and `manifest.json`'s `minAppVersion` is `1.13.0` (raised from `1.8.7` in 0.11.1 — the declarative Settings API forced this; see the note below). If the code starts using APIs newer than the current `minAppVersion`,
   bump all three together: `devDependencies.obsidian`, `manifest.json`'s `minAppVersion`, and a new entry in `versions.json`.
   (Dependabot is configured to ignore the `obsidian` package — bumping the typings is a deliberate decision, not automated.)
3. Run the on-device checklist in `docs/MOBILE-TESTING.md` (iPhone + Android), and record the results in that file's verification log table.
4. **`minAppVersion` must be true, not just true-enough for local lint.** `npm run lint` (`eslint-plugin-obsidianmd`'s `no-unsupported-api` rule) checks every API call against `manifest.json`'s declared `minAppVersion` — if it flags something, that's real: either the code needs a version-gated fallback, or `minAppVersion` needs to go up. **Never suppress this with a local ESLint override** (file-scoped rule config, inline disable, etc.) to make a "this call is only reachable at runtime on versions that support it" argument — the Obsidian community-plugin review runs the same kind of check against the *real* `minAppVersion`, has no visibility into this repo's ESLint config, and will reject the release for exactly what the override hid locally. (0.11.0 shipped this way and was pulled from the directory for it — see CHANGELOG.md's 0.11.1 entry.) If `npm run lint` is clean with zero overrides, that's meaningful signal that review will pass too; if it's only clean *because of* an override, it isn't.

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

## Release-candidate gate

Run these checks against the exact release-candidate worktree before creating a
commit or tag:

```bash
git diff --check
npm ci
npm run lint
npm run build
npm test
npm run test:e2e
```

- Confirm `manifest.json`, `package.json`, `versions.json`, and `CHANGELOG.md`
  describe the same version.
- Perform the desktop smoke test in a real vault, including upgrade behavior
  from the previous release.
- For UI changes, complete the iPhone and Android scenarios in
  [`docs/MOBILE-TESTING.md`](docs/MOBILE-TESTING.md) and record the result.
- Keep dependency-only updates separate from a feature release unless they are
  required to resolve a release-blocking issue.

## Release flow

```bash
# 1. Clean state
git status                    # working tree must be clean, on main

# 2. Full release-candidate gate
npm ci
npm run lint
npm run build
npm test
npm run test:e2e

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

Submission process (current as of 2026 — via the community.obsidian.md website; no longer a fork-and-PR against obsidian-releases):

1. Confirm the repo root contains `README.md`, `LICENSE`, and `manifest.json`, and that at least one
   GitHub release has been published (tag = manifest version, no `v` prefix, with `main.js` + `manifest.json` + `styles.css` attached).
2. Log in to [community.obsidian.md](https://community.obsidian.md) and link your GitHub account to verify repo ownership.
3. Sidebar **Plugins → New plugin** → enter the repo URL → agree to the developer policy → **Submit**.
4. The automated check bot gives real-time feedback. Common checkpoints: `id` may only contain lowercase letters and hyphens, must not contain "obsidian", and must not end with "plugin" (✅ `heading-aligner` — note: digits are not allowed, `h1aligner` was previously rejected for this reason);
   description ≤ 250 characters and ending with a period; `minAppVersion` is set; `fundingUrl` restricted to financial-support-service links (✅ PayPal is already set);
   plugins using Node/Electron APIs must set `isDesktopOnly: true` (✅ this plugin uses zero Node APIs, `false` has been verified);
   command IDs must not include the plugin ID prefix (✅).
5. If corrections are needed: after making changes, publish a new release (with an incremented version) to re-trigger the checks.
6. After passing the automated checks, the submission moves to manual review (timeline varies, on the order of several weeks). Once approved, the plugin appears in the
   Community plugins browser; **subsequent version updates do not require resubmission** — publishing a new GitHub release is automatically picked up.

Post-release promotion (optional): the forum's Share & Showcase section, the Discord `#updates` channel (requires the developer role).

## Post-release verification

- [ ] Fresh vault: install via Community plugins (or BRAT pre-listing), enable, verify a basic rename works.
- [ ] Existing vault: ensure no breakage on update.
- [ ] Check the GitHub Release page shows `main.js` + `manifest.json` + `styles.css` as assets.
- [ ] Update README badge counts if the test suite grew.
