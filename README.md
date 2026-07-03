# H1Aligner

> **Align your note filename with the first H1 on file switch.**
>
> 「H1 即檔名 — Obsidian 筆記命名自動化外掛」

H1Aligner watches `file-open` events in Obsidian, reads the first H1 (`# Title`) inside the file, and renames the file on disk to match. Quiet by default. No notices. No surprises.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-233%20passing-brightgreen.svg)](#testing)

---

## Why this exists

If you treat the first H1 as the canonical title of a note and want the **filename** on disk to track it automatically, this plugin closes the loop. You write `# New Title` once, switch back to the file later, and the filename follows along — your backlinks come with it.

The plugin is intentionally one-way: **H1 → filename**, never filename → H1. The first H1 is always the source of truth. That means a manual filename rename (e.g. via `Ctrl+P → Rename file`) that diverges from the H1 will be **reverted on the next file-open** — the filename snaps back to match the H1. If you want a different name to stick, change the H1, add `h1aligner-lock: true` to that note's frontmatter, or set the Rename trigger to "Manual only".

---

## What it does (TL;DR)

| Trigger | Behaviour |
|---|---|
| You switch to a `.md` file (default trigger) | Read first H1 from cache (or scan the file). Rename the file to match — but only when it differs, isn't empty after sanitisation, and won't collide with a sibling. |
| You pause typing (optional "After editing" trigger) | Same logic, after a generous debounce so it never renames mid-keystroke. |
| You run `Cmd/Ctrl+P → Rename active file from first H1` | Same logic, on-demand. Reports the outcome via a Notice. |
| You run `Preview all renames (dry run)` | Scans the whole vault (within scope), shows what WOULD be renamed and why the rest is skipped, with an optional one-click Apply. Targets are re-checked at apply time; notes whose H1 changed meanwhile are skipped. |
| You run `Undo last rename` | Reverts the most recent rename this session (up to 20 levels). A failed undo keeps its history entry so you can retry. |
| You run `Show recent activity` | Session log of every rename decision (trigger source, outcome, skip reason) — answers "why wasn't this file renamed?". In-memory only, no telemetry. |
| File is out of scope for AUTOMATIC renames (ignored folder, not in the include list, matches an exclude pattern like the built-in daily-notes date pattern, or carries `h1aligner-lock: true`) | Skipped silently. The manual command bypasses include/exclude scope (an explicit action is consent) but still honours ignored folders and the lock. |
| File has no H1 | Skipped silently. |

Backlinks update automatically because the plugin uses `app.fileManager.renameFile()` (not `vault.rename`).

---

## How it works

```
trigger: file-open (debounced 100ms) | editor-change (local typing only,
         debounced 2s — Sync/programmatic writes never trigger) | manual command
    └─ scope filter: .md + ignoreFolders + includeFolders whitelist
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

Concurrency is handled by a serial chain Promise plus a per-file in-progress Set; rapid file switches don't race.

---

## Settings

| Setting | Default | Notes |
|---|---|---|
| Rename trigger | On file open | `On file open` / `After editing (debounced)` / `Both` / `On leaving a note` (renames the note you switched away from — never touches what you are viewing) / `Manual only`. The manual command always works. |
| Ignore folders | `.obsidian, .trash` | Prefix match. Files at or under these paths are skipped. |
| Include only these folders | *(empty)* | Whitelist mode — when non-empty, only notes inside these folders are processed. `/` means the vault root layer (root files only). |
| Exclude filename patterns | `^\d{4}-\d{2}-\d{2}$` | One regex per line, tested against the note name (unanchored substring match — use `^`/`$` for exact names). Applies to automatic triggers and batch; the manual command bypasses it. The default protects date-named daily notes. |
| Respect frontmatter lock | ✅ on | Notes with `h1aligner-lock: true` in frontmatter are never renamed. |
| Filename template | `{{h1}}` | Tokens: `{{h1}}` (required — templates without it are treated as plain `{{h1}}`), `{{date}}` (file creation date), `{{date:FORMAT}}` with `YYYY/MM/DD/HH/mm/ss`. |
| When the target name is taken | Skip | Or append the first free ` 1`, ` 2`, … |
| Allow case-only renames | ✅ on | Turn off to skip `linker.md → Linker.md` style flips. |
| Preserve old name as alias | ❌ off | After a rename, append the previous filename to frontmatter `aliases` so the old name still works in the quick switcher. Not removed on undo. |
| Trim whitespace | ✅ on | Strip leading/trailing whitespace from the H1 text. |
| Replace illegal characters | ✅ on | Replace `\ / : * ? " < > \|` (Windows) and `# ^ [ ]` (Obsidian links) with the replacement char. Path separators are always replaced. |
| Replacement character | ` ` (space) | Single character; illegal characters are rejected, leave empty to delete instead. Common alternatives: `_`, `-`. |
| Maximum filename length | `150` | 1–255; truncates on a code-point boundary (emoji-safe). Names are additionally capped at 255 UTF-8 bytes for filesystem compatibility. |
| Notice level | Off | For automatic renames: `Off` / `Errors only` / `All renames`. Manual actions always report. |
| File-open / edit debounce | `100` / `2000` ms | Advanced. The edit debounce is deliberately generous so renames never fire mid-typing. |

A live **preview field** at the bottom of the Naming section shows the filename a sample H1 would produce with the current settings.

On first run a one-time **onboarding dialog** explains the one-way contract and offers a cautious "Manual only" start. The UI follows Obsidian's language setting (English / 繁體中文 / 日本語).

All settings are stored in `data.json` inside the plugin folder (validated on load — a corrupt or hand-edited `data.json` falls back to safe defaults per field).

---

## Behaviour notes

### Case-only renames are intentional

On case-insensitive but case-preserving filesystems (Windows NTFS, macOS APFS default), a file saved as `linker.md` whose first H1 reads `# Linker` will be renamed to `Linker.md` (capital L) the next time you open it. This is **intentional** — H1Aligner treats filename casing as part of the H1↔filename alignment contract. If you typed the H1 with a capital L, the filename adopts it.

You'll see a visible case flip in the file tree; this is not a duplicate file and not a bug.

### Manual commands always notify

The palette commands (`Rename active file from first H1`, batch Apply, `Undo last rename`) show a Notice toast regardless of the `Notice level` setting. The setting only controls **automatic** renames. Manual invocation always reports its outcome — including skip reasons like `no-h1`, `same-name`, `locked`, or `collision` — so you know what happened.

### Daily notes are protected by default

The default exclude pattern `^\d{4}-\d{2}-\d{2}$` means date-named notes (`2026-07-03.md`) are never renamed, even though their first H1 usually differs from the filename. Remove the pattern if you actually want that behaviour.

### Undo is session-scoped

`Undo last rename` reverts the plugin's own renames (up to 20, newest first) within the current session. Note that if the note's H1 still differs from the restored filename and an automatic trigger is active, the next file-open/edit will rename it again — lock the note or fix the H1 if you want the old name to stick.

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
4. Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/h1aligner/`.
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
npm run test:e2e       # drive the built main.js through 18 end-to-end scenarios
```

Project layout:

```
src/
  main.ts              # plugin entry + trigger wiring + commands
  heading.ts           # first-H1 extraction (cache + scan)
  filename.ts          # sanitisation algorithm
  template.ts          # filename template renderer (pure)
  rename-service.ts    # serial rename queue + guard layers + dry run + aliases
  settings.ts          # schema + defaults + validation + v1 migration
  settings-tab.ts      # Obsidian SettingTab UI + live preview
  batch-modal.ts       # dry-run preview modal
  activity-modal.ts    # session activity viewer
  onboarding-modal.ts  # one-time first-run dialog
  scope.ts             # ignore/include/exclude-pattern decision (pure)
  ignore.ts            # ignoreFolders prefix matcher (pure)
  debounce.ts          # per-key debounce scheduler (pure)
  notice.ts            # notice-level policy (pure)
  history.ts           # session rename history for undo (pure)
  activity-log.ts      # session decision ring buffer (pure)
  i18n.ts              # en / zh-TW / ja string tables (pure)
styles.css             # modal/settings styles
docs/MOBILE-TESTING.md # real-device checklist (iPhone / Android)
tests/
  heading.test.ts        filename.test.ts       rename-service.test.ts
  settings.test.ts       template.test.ts       scope.test.ts
  ignore.test.ts         debounce.test.ts       notice.test.ts
  history.test.ts        activity-log.test.ts   i18n.test.ts
  filename.property.test.ts
```

### Testing

Vitest with 233 unit tests (including 7 fast-check property-based invariants for the sanitiser) covering the H1 extractor (cache + scan paths, frontmatter, BOM, CommonMark code-fence and closing-`#` conformance, Setext via cache, CRLF), the filename sanitiser (Windows + Obsidian illegal chars, replacement-char safety, reserved-name stems, code-point and 255-byte caps, Unicode, surrogate-pair boundary), the template renderer, the rename service (frontmatter lock, guard layers, case-only policy, collision numbering, dry run, undo history, serial chain, error capture, cachedRead fallback), settings validation/v1-migration/parsing, the scope matcher, the debounce scheduler, and the notice policy. CI runs the full suite on every push (`.github/workflows/ci.yml`).

```bash
npm test
```

---

## Roadmap

- **Phase 1 MVP** (0.1.0) — file-open auto-rename, manual command, 4-layer guard. ✅
- **Phase 2** (0.4.0) — frontmatter lock, live preview in settings, configurable triggers (`After editing`), scope controls (include folders, exclude patterns). ✅
- **Phase 3** (0.4.0) — batch rename with dry-run preview, collision numbering, filename templates, undo. ✅

---

## License

[MIT](./LICENSE) © 2026 Aiken Lin

---

## Releasing

See [RELEASING.md](./RELEASING.md) for the GitHub release + Obsidian community plugin submission flow.