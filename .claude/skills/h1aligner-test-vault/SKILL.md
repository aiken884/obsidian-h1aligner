---
name: h1aligner-test-vault
description: Use when preparing or resetting Obsidian's ObsidianTestVault to manually verify a new H1Aligner batch/phase, when the vault has accumulated clutter from past test runs, or when Aiken asks to design/regenerate test notes for an upcoming test pass.
---

# H1Aligner Test Vault

## Overview

ObsidianTestVault is disposable test data only — reshape it freely (Aiken confirmed 2026-09-16). This skill resets it to a clean, low-interference baseline (vault settings, plugin settings, note content) and provisions the minimal fixture notes a given phase's checklist needs, driven entirely through the `obsidian` CLI against the live app — no manual clicking, no editing files while Obsidian has them open.

## Where this runs

This skill drives the **live Obsidian desktop app**. It is for Mac or PC sessions with GUI Obsidian. Home Linux Grok has no GUI Obsidian — do not try to reset TestVault from Home; coordinate with a Mac/PC agent instead.

| Machine | Test vault disk path | Real vault (never touch) |
|---|---|---|
| Mac | `/Users/aikenlin/Obsidian/ObsidianTestVault` | `/Users/aikenlin/Obsidian/ObsidianVault` |
| PC | *ask Aiken if missing — do not guess* | *ask Aiken* |
| Home | n/a (no GUI) | n/a |

The Obsidian CLI vault id is always `ObsidianTestVault` (the nested `.../ObsidianTestVault/ObsidianTestVault` folder was flattened on 2026-09-16). `scripts/dev-deploy.mjs` currently lists Mac paths only.

## Prerequisites

- Obsidian desktop running; `obsidian` CLI available (`obsidian help` to confirm).
- The feature branch already built and deployed to TestVault (`node scripts/dev-deploy.mjs`) — this skill provisions the *workspace*, not the plugin build. On Mac, that script also writes the **real** vault; if Aiken said not to touch the main vault's plugin, copy `main.js` / `manifest.json` / `styles.css` into TestVault only.
- Read what this phase actually needs before designing fixtures: `docs/MOBILE-TESTING.md`'s 16-item table for behavioral coverage, plus any per-batch design doc (e.g. `docs/design-lock-command-undo-button-tag-notice.md`) for what's new.

## Procedure

1. **Reset vault content.** Trash every note except a `KEEP` set (usually just the standing mobile-verification checklist note), then remove now-empty leftover folders. Always `app.vault.trash(f, false)` — soft delete to `.trash`, recoverable — never a hard delete.
2. **Reset the plugin's settings.** `plugin.settings = { ...plugin.settings, ...baseline }; await plugin.saveSettings()`, starting from `DEFAULT_SETTINGS` (`src/settings.ts`) with only the phase's overrides (table below).
3. **Reset vault-level Obsidian settings.** `community-plugins.json` should list `heading-aligner` only — check `.obsidian/plugins/` for stray folders (e.g. a leftover pre-rename `h1aligner` id) and delete unused ones. `core-plugins.json` stays minimal: `file-explorer`, `properties`, `command-palette`, `editor-status`, `sync` on; everything else off. `app.json`/`appearance.json` stay `{}`.
4. **Design fixture notes.** For each checklist item in scope, ask "does an existing fixture already exercise this, or does it need its own note?" One note often carries several sequential items (a lock-test note serves both "add the lock" and "lock/unlock context menu"). Write a `00-測試索引.md` index note (numeric prefix sorts first) listing every fixture, what it tests, and the settings baseline in effect — give it `h1aligner-lock: true` in frontmatter (see Common mistakes below for why).
5. **Verify.** `dev:errors` clean, `app.vault.getMarkdownFiles()` matches the intended list, settings read back correctly. Only screenshot when a *visual* behavior (not just content) needs eyeballing: Mac `cliclick`/`screencapture`; PC use that machine's equivalent. Confirm the capture is the settings window or the editor you meant — a previous pass screenshot the editor while claiming it was Settings.
6. **Report** a short table: fixture → what to do → what to expect, plus the settings baseline used.

## Baseline settings reference

**Plugin (`data.json`)** — start from `DEFAULT_SETTINGS`, override only what the phase needs:

| Field | Typical baseline | Why |
|---|---|---|
| `renameTrigger` | `file-open` | Matches MOBILE-TESTING Phase 1's starting trigger; switch to `edit`/`both`/`leave`/`manual` per later phase |
| `includeFolders` | `[]` | Whole-vault scope, unless the phase specifically tests scope/include-ignore |
| `ignoreFolders` | `[".trash"]` | Default only |
| `noticeLevel` | `all` | See every notice while testing |
| `moveTagsToFrontmatter` / `bodyTagHandling` | `true` / `remove-tag` | Needed once a batch ships the tag-move feature |
| `skipIfFrontmatterLock` | `true` | Needed once a batch ships lock |

For a scope/include-ignore pass, override `includeFolders`/`ignoreFolders` per the scenario under test, then **always restore the table above**. The index note should say what the restore value is.

Settings-page conflict row (Obsidian 1.13.7): extra nodes created on `group.listEl` (and `settingEl.remove()`) are discarded when the declarative renderer re-parents and keeps only each item's `settingEl`. Conflict warning, filename preview, and the experimental warning must live on `setting.settingEl` (see `src/settings-tab.ts`). Verify the red conflict description names the overlapping folder; do not accept an empty heading-only row.

**Vault-level:** `community-plugins.json` → `["heading-aligner"]` only. `core-plugins.json` → only `file-explorer`, `properties`, `command-palette`, `editor-status`, `sync` `true`. `app.json` / `appearance.json` → `{}`.

## Fixture design principles

- Name fixtures in the language Aiken operates the vault in (zh-TW) and by what they test (`鎖定測試筆記.md`, not `test-lock.md`).
- Mismatched H1/filename = "ready to trigger a rename"; matching H1/filename = "ready to trigger a no-op or tag-move-only path".
- One note can serve multiple sequential checklist items — don't multiply notes; the goal is speed, not exhaustive 1:1 coverage.
- Notes meant for a *later* phase (e.g. manual-only disposables) are safe to pre-create now with `app.vault.create` — creation alone never fires the file-open hook, so they won't be prematurely renamed.
- Never touch `ObsidianVault` (the real vault) from this skill. Always pass `vault=ObsidianTestVault` explicitly to every `obsidian` CLI call.
- Index notes (`00-測試索引.md` and similar) must be locked (`h1aligner-lock: true`) **or** the H1 itself must keep the sort prefix. Opening an unlocked index whose H1 does not match the `00-` filename will rename it and drop the prefix (happened 2026-09-16).

## Quick-reference eval snippets

```js
// Notice observer — install once per app session before triggering anything.
if (!window.__h1a) { window.__h1a = {notices: [], els: []}; const obs = new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) { if (!(n instanceof HTMLElement)) continue; const list = n.matches?.('.notice') ? [n] : [...(n.querySelectorAll?.('.notice') || [])]; for (const el of list) { window.__h1a.notices.push({text: el.textContent}); window.__h1a.els.push(el); } } }); obs.observe(document.body, {childList: true, subtree: true}); }
```

```js
// Bulk trash keeping a KEEP set.
const KEEP = new Set(['00-測試索引.md', 'H1Aligner 0.12.0 — 手機實機驗證(iPhone + Android).md']);
for (const f of app.vault.getMarkdownFiles().filter(f => !KEEP.has(f.path))) await app.vault.trash(f, false);
```

```js
// Settings baseline apply.
const p = app.plugins.plugins['heading-aligner'];
p.settings = { ...p.settings, renameTrigger: 'file-open', includeFolders: [], ignoreFolders: ['.trash'], noticeLevel: 'all' };
await p.saveSettings();
```

## Worked example (2026-09-16, batch-1 + scope-conflict pass)

Reset TestVault from 57 accumulated notes down to the checklist note, applied the Phase-1 baseline above, and created: `daily/2026-09-16.md` (daily-note protection), `Readme.md` (case-collision target), `長標題測試.md` (long-CJK truncation), `鎖定測試筆記.md` (lock + lock/unlock menu), `標籤搬移測試.md` (tag-move notice), `復原測試筆記.md` (Undo + superseded), `隨手筆記一/二/三.md` (Phase-4 disposables for batch preview / alias / activity log), `H1A-SCOPE-sub/衝突測試筆記.md` (include/ignore conflict), plus `00-測試索引.md` tying it together. Ten fixtures instead of the checklist's raw 16-item enumeration, because several notes double up across sequential items.

## Common mistakes

- Hard-deleting instead of `vault.trash` — not recoverable if a note turns out to matter.
- Forgetting to restore `includeFolders`/`ignoreFolders` after a scope test — the next phase silently inherits a narrowed scope (this happened once: a stray `未命名` folder lingered in `includeFolders` from manual exploration and wasn't caught until the next session).
- Running against `ObsidianVault` by mistake — always pass `vault=ObsidianTestVault`.
- Running this skill from Home (no GUI Obsidian) — hand it to a Mac/PC desktop session.
- Leaving a stray plugin folder under an old id installed — harmless to Obsidian but it's noise; delete it.
- Not locking the index note — see Fixture design principles above; it has a mismatched H1/filename like everything else, so opening it renames it too and drops the sort prefix.
