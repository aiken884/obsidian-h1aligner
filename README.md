# H1Aligner

> **Your first heading is the title. Now it is the filename too.**

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Install-483699?logo=obsidian&logoColor=white)](https://obsidian.md/plugins?id=heading-aligner)
[![Guides](https://img.shields.io/badge/Guides-Settings-1f6feb?logo=readme&logoColor=white)](#settings)
[![Support](https://img.shields.io/badge/Support-Ko--fi%20%2F%20PayPal-F16061?logo=kofi&logoColor=white)](#support)

[![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=483699&label=downloads&query=%24%5B%22heading-aligner%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)](https://obsidian.md/plugins?id=heading-aligner)
[![Latest Release](https://img.shields.io/github/v/release/aiken884/obsidian-h1aligner?color=brightgreen)](https://github.com/aiken884/obsidian-h1aligner/releases)
[![CI](https://github.com/aiken884/obsidian-h1aligner/actions/workflows/ci.yml/badge.svg)](https://github.com/aiken884/obsidian-h1aligner/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

H1Aligner is an Obsidian plugin that keeps your note filenames aligned with their first H1 — automatically, quietly, and in one direction only. You write `# A Better Title`, and the file becomes `A Better Title.md`, backlinks intact. No dialogs, no drift, no surprises.

**Why people install it:**

- **Predictable** — one rule (H1 → filename), five clearly-scoped triggers, zero magic
- **Safe** — locks, allowlists, dry-run preview, 20-step undo, and a full protection chain before anything touches disk
- **Link-preserving** — renames go through Obsidian's own `renameFile()`, so every backlink follows

---

### One rule, strictly enforced

The first H1 is always the source of truth: **H1 → filename, never the reverse.** Rename a file by hand and it snaps back on the next trigger — unless you lock that note with a single line of frontmatter (`h1aligner-lock: true`). One predictable rule beats a dozen half-configured behaviors.

### Renames on your terms

H1Aligner lets you decide *when* filenames are allowed to move. Edit-triggered renames respond only to local typing: sync writes and programmatic updates never fire a rename. There are five trigger modes:

- **On file open**
  Renames as soon as you open a note. Great for cleaning up an existing vault as you work through it, with zero extra keystrokes.

- **After editing**
  Waits a couple of seconds after you stop typing, then renames. You keep your writing flow; filenames quietly fall back in line once you pause.

- **Both**
  Combine the two: opening a note and editing its H1 can both trigger a rename. This is the "always in sync" option if you want titles and filenames to match at all times.

- **On leaving a note**
  Only renames the note you just switched away from. The file you are currently looking at never moves under your cursor, which makes this the gentlest option for people who hate it when tabs jump around.

- **Manual only**
  Nothing ever renames itself. You drive every change through the command palette or your own hotkeys — perfect if you want H1Aligner's safety features and preview tools, but prefer to pull the trigger yourself.

### Guardrails first

Every rename passes a full protection chain before anything touches disk: frontmatter locks, date-named daily-note protection, folder allowlists and regex excludes, cross-platform filename sanitisation (Windows-reserved names, Obsidian link-breaking characters, the 255-byte filesystem limit), and collision detection that understands case-insensitive filesystems. A vault-wide dry-run preview, a 20-step undo, and a session activity log that answers "why *wasn't* this file renamed?" round out the safety story.

Designed for people who care more about predictability than magic.

### Engineered like it matters

H1Aligner is built with the level of care you'd expect from a tool that touches every filename in your vault. It ships with **238 automated tests** (including property-based fuzzing of the sanitiser across thousands of random inputs), **20 end-to-end scenarios** driven against the real production bundle, and continuous integration on every push. It is verified on desktop and mobile, localised in **English, Traditional Chinese and Japanese** following your Obsidian language setting, and it is free and open source, MIT-licensed.

---

**Best for** people who treat the first H1 as the real title of a note and want filenames to stay clean without surprises.

## Commands

| Command | What it does |
|---|---|
| **Rename active file from first H1** | On-demand rename. Bypasses trigger mode and include/exclude scope (an explicit action is consent), still honours ignored folders and locks. Always reports its outcome. |
| **Preview all renames (dry run)** | Scans the vault within scope and groups results into Rename, Conflicts, Errors, and Skipped. Only Rename items can be applied; targets are re-verified at apply time and changed rename settings require a new preview. |
| **Undo last rename** | Reverts the most recent rename this session (up to 20 levels). Verifies file identity, so it never reverts a stranger that took over the old path. A failed undo keeps its history entry for retry. |
| **Show recent activity** | Session log of every rename decision — trigger source, outcome, skip reason. In-memory only, no telemetry. |

## Settings

| Setting | Default | Notes |
|---|---|---|
| Rename trigger | On file open | The five modes above. The manual command always works. |
| Ignore folders | `.trash` | Prefix match; `/` means the vault root layer. The Obsidian config folder is always ignored automatically. |
| Include only these folders | *(empty)* | Allowlist mode — when non-empty, only notes inside these folders are processed. `/` means the vault root layer (root files only). |
| Exclude filename patterns | `^\d{4}-\d{2}-\d{2}$` | One regex per line, tested against the note name (unanchored — use `^`/`$` for exact names). Invalid drafts are kept separate and pause new renames until fixed. The default protects date-named daily notes. |
| Respect frontmatter lock | ✅ on | Notes with `h1aligner-lock: true` are never renamed. |
| Filename template | `{{h1}}` | Tokens: `{{h1}}` (required), `{{date}}` (file creation date), `{{date:FORMAT}}` with `YYYY/MM/DD/HH/mm/ss`. Creation date keeps renames idempotent. |
| When the target name is taken | Skip | Or append the first free ` 1`, ` 2`, … |
| Allow case-only renames | ✅ on | Turn off to skip `linker.md → Linker.md` style flips. |
| Preserve old name as alias | ❌ off | Appends the previous filename to frontmatter `aliases` so the old name still works in the quick switcher. |
| Trim whitespace | ✅ on | Strip leading/trailing whitespace from the H1 text. |
| Replace illegal characters | ✅ on | Windows-invalid and Obsidian link-breaking characters → replacement char. Path separators are always replaced. |
| Replacement character | ` ` (space) | Single character; illegal characters are rejected; empty deletes instead. |
| Maximum filename length | `150` | 1–255 code points; additionally capped at 255 UTF-8 bytes for filesystem compatibility. |
| Notice level | Off | For automatic renames: Off / Errors only / All. Manual actions always report. |
| File-open / edit debounce | `100` / `2000` ms | Advanced. The edit debounce is deliberately generous — renaming mid-typing is disruptive. |

A live **preview field** shows the filename a sample H1 would produce with your current settings. On first run a one-time **onboarding dialog** explains the one-way contract and offers a cautious Manual-only start.

## How it works

```
trigger: file-open (100ms) | editor-change (local typing only, 2s —
         Sync/programmatic writes never trigger) | both | on-leave
         (renames the note you switched away from) | manual command
    └─ scope filter: .md + ignoreFolders + includeFolders allowlist
       + basename exclude patterns (daily-notes date pattern by default)
        └─ RenameService.renameFromH1(file)
            ├─ L0 frontmatter lock (`h1aligner-lock: true`) → skip
            ├─ extract first H1
            │     ├─ MetadataCache (preferred — covers Setext for free)
            │     └─ linear scan fallback (ATX only; BOM-aware,
            │        CommonMark-conformant code-fence + closing-# rules)
            ├─ render name template ({{h1}}, {{date}} from file CREATION
            │  time — stable, so renames are idempotent)
            ├─ sanitize filename
            │     ├─ NFC normalise
            │     ├─ strip control chars (preserve tab/LF/CR for collapse)
            │     ├─ replace illegal `\ / : * ? " < > |` (Windows) and
            │     │  `# ^ [ ]` (break Obsidian links) with the replacement char
            │     │  (path separators are replaced unconditionally)
            │     ├─ trim + collapse whitespace
            │     ├─ strip leading dots / trailing dots+spaces
            │     ├─ append `_` for Windows reserved names,
            │     │  including stems (CON, AUX.notes, ...)
            │     ├─ truncate to 150 code points
            │     └─ cap at 255 UTF-8 bytes incl. extension
            │        (APFS / ext4 / NTFS NAME_MAX)
            ├─ guard layers
            │     ├─ L1 no H1                  → skip
            │     ├─ L2 empty after sanitize   → skip
            │     ├─ L3 same as current name   → skip (idempotent);
            │     │     'case-only' skip when that policy is off
            │     └─ L4 collision (case- and NFC-insensitive sibling
            │           scan, NTFS/APFS semantics) → skip, or append
            │           the first free " 1", " 2", … when configured
            └─ app.fileManager.renameFile(file, newPath)
                └─ recorded in the session undo history (20 levels)
```

Backlinks update automatically because the plugin uses `app.fileManager.renameFile()` (not `vault.rename`). Concurrency is handled by a serial chain Promise plus a per-file in-progress set; rapid file switches don't race.

## Behaviour notes

**Case-only renames are intentional.** On case-insensitive, case-preserving filesystems (NTFS, APFS), `linker.md` with `# Linker` becomes `Linker.md` on the next trigger. Filename casing is part of the alignment contract; turn it off in settings if you prefer a still file tree.

**Manual commands always notify.** The Notice level setting only controls automatic renames. Manual invocations always report their outcome — including skip reasons like `no-h1`, `locked`, or `collision`.

**Daily notes are protected by default.** Date-named notes (`2026-07-03.md`) are never auto-renamed thanks to the default exclude pattern. Remove it if you actually want that.

**Undo is session-scoped.** Up to 20 renames, newest first, this session only. If the H1 still differs from the restored name and an automatic trigger is active, the next trigger renames it again — lock the note or fix the H1 to make the old name stick.

## ⚠️ Do not pair with these plugins

H1Aligner manages the filename ⇄ H1 relationship one way. Running plugins that also touch it invites rename loops and lost edits. Pick one and disable the others:

| Plugin | Why it conflicts |
|---|---|
| [Filename Heading Sync](https://github.com/dvcrn/obsidian-filename-heading-sync) | Two-way sync — will fight H1Aligner on every trigger |
| [File Title Updater](https://github.com/wenlzhang/obsidian-file-title-updater) | Also renames files from titles; overlapping responsibility |
| [Auto Filename](https://github.com/rcsaquino/obsidian-auto-filename) | Renames files from content; overlapping responsibility |
| [Linter](https://github.com/platers/obsidian-linter) — *file name* rules only | Disable its filename rules, or don't use H1Aligner |

## Installation

H1Aligner is available in Obsidian's [Community plugins directory](https://community.obsidian.md/plugins/heading-aligner).

**From Obsidian** (recommended):

1. Open **Settings → Community plugins → Browse**.
2. Search for **H1Aligner**.
3. Select it, then choose **Install** and **Enable**.

**From source** (development or unreleased builds):

1. Clone this repo, then run `npm install && npm run build`.
2. Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/heading-aligner/`.
3. Enable it under Settings → Community plugins.

Requires Obsidian 1.8.0+. Works on desktop and mobile (`isDesktopOnly: false`, verified on macOS and iOS).

## Development

```bash
npm run dev            # watch-mode build
npm run build          # type-check + production build
npm run lint           # official obsidianmd eslint ruleset (community-scan clean)
npm test               # 238 unit tests (vitest, incl. property-based)
npm run test:coverage  # + v8 coverage report
npm run test:e2e       # 20 E2E scenarios against the built bundle
```

```
src/
  main.ts              # plugin entry + trigger wiring + commands
  heading.ts           # first-H1 extraction (cache + scan)
  filename.ts          # sanitisation algorithm
  template.ts          # filename template renderer (pure)
  rename-service.ts    # serial rename queue + guard layers + dry run + aliases
  settings.ts          # schema + defaults + validation + migration
  settings-tab.ts      # SettingTab UI + live preview
  batch-modal.ts       # dry-run preview modal
  batch-triage.ts      # pure batch status classification
  activity-modal.ts    # session activity viewer
  onboarding-modal.ts  # one-time first-run dialog
  scope.ts / ignore.ts / debounce.ts / notice.ts / history.ts /
  activity-log.ts / i18n.ts        # pure, obsidian-free, fully unit-tested
styles.css             # modal/settings styles
docs/MOBILE-TESTING.md # real-device checklist (iPhone / Android)
```

All logic lives in pure modules with zero Obsidian runtime imports; the Obsidian-coupled files are thin shells exercised by the E2E suite. CI runs build + both suites on every push. See [CHANGELOG.md](./CHANGELOG.md) for version history and [RELEASING.md](./RELEASING.md) for the release flow.

## Privacy

H1Aligner runs entirely on your device. It makes **zero network requests** and collects **zero telemetry** — the production bundle's only import is the Obsidian API itself. The vault-wide file listing shown in the community directory's capability disclosure comes from one place: the *Preview all renames (dry run)* command, which must enumerate your notes to tell you what would be renamed. Those paths are used in-memory for that preview and nothing else; the session activity log also lives in memory only and vanishes when Obsidian closes.

## Support

If H1Aligner keeps your vault tidy, you can support its development on [Ko-fi](https://ko-fi.com/aikenlin) (card or PayPal) or directly via [PayPal](https://paypal.me/aikenlin). Entirely optional — the plugin is and stays free.

## License

[MIT](./LICENSE) © 2026 Aiken Lin

---

*Built by a solo developer who wanted filenames to be as intentional as the notes they hold.*
