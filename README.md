# H1Aligner

> **Align your note filename with the first H1 on file switch.**
>
> 「H1 即檔名 — Obsidian 筆記命名自動化外掛」

H1Aligner watches `file-open` events in Obsidian, reads the first H1 (`# Title`) inside the file, and renames the file on disk to match. Quiet by default. No notices. No surprises.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-141%20passing-brightgreen.svg)](#testing)

---

## Why this exists

If you treat the first H1 as the canonical title of a note and want the **filename** on disk to track it automatically, this plugin closes the loop. You write `# New Title` once, switch back to the file later, and the filename follows along — your backlinks come with it.

The plugin is intentionally one-way: **H1 → filename**, never filename → H1. The first H1 is always the source of truth. That means a manual filename rename (e.g. via `Ctrl+P → Rename file`) that diverges from the H1 will be **reverted on the next file-open** — the filename snaps back to match the H1. If you want a different name to stick, change the H1 (or turn off "Rename on file open").

---

## What it does (TL;DR)

| Trigger | Behaviour |
|---|---|
| You switch to a `.md` file | Read first H1 from cache (or scan the file). Rename the file to match — but only when it differs, isn't empty after sanitisation, and won't collide with a sibling. |
| You run `Cmd/Ctrl+P → Rename active file from first H1` | Same logic, on-demand. Reports the outcome via a Notice. |
| File is inside an ignored folder (`.obsidian/`, `.trash/` by default) | Skipped silently. |
| File has no H1 | Skipped silently. |

Backlinks update automatically because the plugin uses `app.fileManager.renameFile()` (not `vault.rename`).

---

## How it works

```
file-open event
    └─ filter: .md + not in ignoreFolders
        └─ per-file debounce 100ms (coalesce burst switches)
            └─ RenameService.renameFromH1(file)
                ├─ extract first H1
                │     ├─ MetadataCache (preferred — covers Setext for free)
                │     └─ linear scan fallback (ATX only; BOM-aware,
                │        CommonMark-conformant code-fence + closing-# rules)
                ├─ sanitize filename
                │     ├─ NFC normalise
                │     ├─ strip control chars (preserve tab/LF/CR for collapse)
                │     ├─ replace illegal `\ / : * ? " < > |` (Windows) and
                │     │  `# ^ [ ]` (break Obsidian links) with the replacement char
                │     ├─ trim + collapse whitespace
                │     ├─ strip leading dots / trailing dots+spaces
                │     ├─ append `_` for Windows reserved names,
                │     │  including stems (CON, AUX.notes, ...)
                │     ├─ truncate to 150 code points
                │     └─ cap at 255 UTF-8 bytes incl. extension
                │        (APFS / ext4 / NTFS NAME_MAX)
                ├─ 4-layer guard
                │     ├─ L1 no H1                  → skip
                │     ├─ L2 empty after sanitize   → skip
                │     ├─ L3 same as current name   → skip (idempotent)
                │     └─ L4 sibling collision      → skip
                └─ app.fileManager.renameFile(file, newPath)
```

Concurrency is handled by a serial chain Promise plus a per-file in-progress Set; rapid file switches don't race.

---

## Settings

| Setting | Default | Notes |
|---|---|---|
| Rename on file open | ✅ on | Master switch for the auto-rename behaviour. Manual command always works. |
| Show notice on rename | ❌ off | Quiet by default. Toggle on if you want a toast confirmation each time. |
| Trim whitespace | ✅ on | Strip leading/trailing whitespace from the H1 text. |
| Replace illegal characters | ✅ on | Replace `\ / : * ? " < > \|` (Windows) and `# ^ [ ]` (Obsidian links) with the replacement char. |
| Replacement character | ` ` (space) | Single character; illegal characters are rejected, leave empty to delete instead. Common alternatives: `_`, `-`. |
| Maximum filename length | `150` | 1–255; truncates on a code-point boundary (emoji-safe). Names are additionally capped at 255 UTF-8 bytes for filesystem compatibility. |
| Ignore folders | `.obsidian, .trash` | Prefix match. Files at or under these paths are skipped. |

All settings are stored in `data.json` inside the plugin folder (validated on load — a corrupt or hand-edited `data.json` falls back to safe defaults per field).

---

## Behaviour notes

### Case-only renames are intentional

On case-insensitive but case-preserving filesystems (Windows NTFS, macOS APFS default), a file saved as `linker.md` whose first H1 reads `# Linker` will be renamed to `Linker.md` (capital L) the next time you open it. This is **intentional** — H1Aligner treats filename casing as part of the H1↔filename alignment contract. If you typed the H1 with a capital L, the filename adopts it.

You'll see a visible case flip in the file tree; this is not a duplicate file and not a bug.

### Manual command always notifies

The palette command `Rename active file from first H1` shows a Notice toast regardless of the `Show notice on rename` setting. The setting only suppresses notices on **automatic** (file-open) renames. Manual invocation always reports its outcome — including skip reasons like `no-h1`, `same-name`, or `collision` — so you know what happened.

## ⚠️ Compatibility — do NOT pair with these plugins

H1Aligner manages the filename ⇄ H1 relationship one way. Several existing plugins also touch that relationship; running them together is asking for **rename loops, lost edits, or cursor jumps**. Pick **one** and uninstall the others.

| Plugin | Why it conflicts |
|---|---|
| [dvcrn / Filename Heading Sync](https://github.com/dvcrn/obsidian-filename-heading-sync) | Two-way sync (filename ⇄ first heading). Will fight H1Aligner on every file-open. |
| [wenlzhang / File Title Updater](https://github.com/wenlzhang/obsidian-file-title-updater) | Also renames the file when the title changes; overlapping responsibility. |
| [platers / Obsidian Linter](https://github.com/platers/obsidian-linter) — *Filename* rules | Linter can be configured to rewrite filenames from headings; either disable that rule or don't use H1Aligner. |

If you're migrating from one of the above, **uninstall it first** before installing H1Aligner. Re-run the manual command (`Rename active file from first H1`) on any files left in inconsistent state.

---

## Installation

### From source (Phase 1 — pre-release)

1. Clone or download this repo.
2. `npm install`
3. `npm run build` → produces `main.js` next to `manifest.json`.
4. Copy `main.js`, `manifest.json`, and (if present) `styles.css` into `<vault>/.obsidian/plugins/h1aligner/`.
5. Enable the plugin in Obsidian → Settings → Community plugins.

### From Community Plugins (post-release)

Coming once submitted to the [Obsidian community plugin registry](https://github.com/obsidianmd/obsidian-releases).

---

## Usage

1. Enable the plugin.
2. Open any `.md` file in your vault. If its first H1 differs from its filename, it gets renamed.
3. To rename on demand: `Cmd/Ctrl+P` → search "Rename active file from first H1".

That's it. The plugin is intentionally low-config.

---

## Development

```bash
npm install            # install deps
npm run dev            # watch-mode build (writes main.js on change)
npm run build          # one-shot production build
npm test               # run vitest suites
npm run test:coverage  # vitest + v8 coverage report
```

Project layout:

```
src/
  main.ts              # plugin entry + event wiring + commands
  heading.ts           # first-H1 extraction (cache + scan)
  filename.ts          # sanitisation algorithm
  rename-service.ts    # serial rename queue + 4-layer guard
  settings.ts          # schema + defaults + validation (NO obsidian runtime import)
  settings-tab.ts      # Obsidian SettingTab UI
  ignore.ts            # ignoreFolders prefix matcher (pure)
  debounce.ts          # per-key debounce scheduler (pure)
  notice.ts            # notice-message policy (pure)
tests/
  heading.test.ts
  filename.test.ts
  rename-service.test.ts
  settings.test.ts
  ignore.test.ts
  debounce.test.ts
  notice.test.ts
```

### Testing

Vitest with 141 unit tests covering the H1 extractor (cache + scan paths, frontmatter, BOM, CommonMark code-fence and closing-`#` conformance, Setext via cache, CRLF), the filename sanitiser (Windows + Obsidian illegal chars, replacement-char safety, reserved-name stems, code-point and 255-byte caps, Unicode, surrogate-pair boundary), the rename service (4-layer guard, serial chain, error capture, cachedRead fallback), settings validation/parsing, the ignore-folder matcher, the debounce scheduler, and the notice policy. CI runs the full suite on every push (`.github/workflows/ci.yml`).

```bash
npm test
```

---

## Roadmap

- **Phase 1 MVP** (this release) — file-open auto-rename, manual command, 4-layer guard.
- **Phase 2** — frontmatter lock (`h1aligner-lock: true`), live preview in settings, additional event triggers (`modify`, configurable).
- **Phase 3** — multi-file batch rename command, dry-run mode.

---

## License

[MIT](./LICENSE) © 2026 Aiken Lin

---

## Releasing

See [RELEASING.md](./RELEASING.md) for the GitHub release + Obsidian community plugin submission flow.