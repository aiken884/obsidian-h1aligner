# Design Document: Lock Command, Undo Button in Notice, Tag-Move Notice (0.12.0, batch 1)

Date: 2026-09-13  Status: **Design finalized (external review round 3: approve).**
Implementation status (2026-09-14): all three features (A, B, C) are implemented on branch
`feature/0.12.0-batch1` — commits `515dd9b` (A), `c984036` (B), `336c404` (C), each TDD'd and independently
adversarially reviewed against this document with no blocking issues. `npm run lint`, `npm run build`,
`npm test` (423, up from 408), and `npm run test:e2e` (40, up from 31) are all green on the branch tip.
**Not yet merged to `main`** — per §11, that happens only after Aiken reviews the three commits and runs the
on-device checklist there.
Target version: H1Aligner (community id `heading-aligner`) 0.12.0
Companion: the full-context planning file (including the author's own vault configuration that motivated
the feature choice) lives outside the repo; this document is the repo-safe, implementation-ready version.

## 1. Overview

Three small, self-contained additions chosen after a read-only survey of the project (docs, code extension
points, comparable community plugins, and the author's real-world configuration). All three share one
property: **no new settings fields, no changes to `settings.ts` / `settings-tab.ts` /
`batchSettingsFingerprint`, and no changes to any guard layer or rename decision.** `rename-service.ts`
gets two tiny edits (use a shared `isLockValue()`; return the history record alongside a successful
outcome), both covered by existing tests. Total: roughly 140 lines of `src/`.

| # | Feature | Why |
|---|---|---|
| A | Tag-move notice | With the experimental tag mover in *remove whole tag* mode and notice level *All*, an alignment-only pass that rewrites the note body produces **no notice at all** (`noticeFor()` never reads `outcome.movedTags`; automatic skips always return `null`). The body changed and the user was not told. |
| B | Lock / unlock command + file menu | `h1aligner-lock: true` is the only per-note opt-out, but its only entry point is hand-typing YAML — there is no command and no context-menu item (`main.ts` registers four commands and no `file-menu` hook). |
| C | Undo button in the rename notice | Undo exists only as a command-palette entry. On mobile, or without a hotkey, reverting an unwanted rename means opening the palette and typing. A button on the toast makes it one tap. |

### Roadmap (three batches)

- **Batch 1 (this document):** A, B, C.
- Batch 2 (separate design later): an "Explain this note" read-only command; an out-of-scope count in the
  batch preview; a folder context-menu what-if preview.
- Batch 3 (separate design later): a Copy button in the activity modal; frontmatter `title` as a fallback
  source when there is no H1 (opt-in).

## 2. Invariants that must not be violated

One direction only (H1 → filename); only the filename and frontmatter are touched (the tag mover is the
documented, off-by-default exception); never rename while typing; Sync / programmatic writes never trigger;
`leave` mode never touches the note being viewed; the frontmatter lock is absolute (L0); never overwrite an
existing file; backlinks always follow; undo verifies identity; idempotent; batch apply re-verifies; invalid
regex pauses renames; manual commands always report; zero network, zero telemetry; zero Node/Electron API.

## 3. Project rules that apply

- No local ESLint override may mask a warning the official community review would raise (RELEASING.md;
  the 0.11.0 delisting). Relevant rules: `obsidianmd/commands/no-plugin-name-in-command-name`,
  `ui/sentence-case`, `no-static-styles-assignment` (error), `no-unsupported-api` (minAppVersion 1.13.0).
- Every minor release passes the on-device checklist in `docs/MOBILE-TESTING.md` first.
- Local dev builds never touch `manifest.json`'s `version` field (`scripts/dev-deploy.mjs` marks
  `description` only).

## 4. API facts (from `node_modules/obsidian` 1.13.1, `obsidian.d.ts`)

- `Notice` (`:4613-4650`): `noticeEl` is **`@deprecated` — "Use `messageEl` instead"**; `containerEl` and
  `messageEl` are `@public @since 1.8.7`; `constructor(message: string | DocumentFragment, duration?: number)`
  (0 = stays until dismissed); `hide(): void` `@since 0.9.7`. All below minAppVersion 1.13.0.
  **This design uses `messageEl`.** (An external reviewer initially objected, citing an older mirror of the
  type file; the local 1.13.1 package settles it.)
- `workspace.on('file-menu', (menu: Menu, file: TAbstractFile, source: string, leaf?: WorkspaceLeaf) => any)`
  (`:8109`). Fires on mobile too (long-press / "more options"). **`source` is not filtered.**
- `Menu.addItem(cb: (item: MenuItem) => any)` (`:4269`); `MenuItem.setTitle` (`:4323`), `setIcon` (`:4330`),
  `onClick` (`:4358`).
- `FileManager.processFrontMatter(file: TFile, fn: (frontmatter: any) => void)` (`:2954`, `@since 1.4.4`):
  the callback may `delete` keys; the whole frontmatter block is re-serialised (YAML comments are lost —
  already documented in the README for the alias feature). Markdown files only.
- Events registered with `registerEvent()` are released by the `Component` lifecycle on unload.

---

## 5. Feature A — Tag-move notice (smallest; implement first)

### Behaviour

`noticeFor()` learns about `outcome.movedTags`. Policy (`tags = outcome.movedTags ?? 0`):

| Case | manual | auto + `all` | auto + `errors` | auto + `off` |
|---|---|---|---|---|
| error | error (unchanged) | error (unchanged) | error (unchanged) | null |
| renamed, tags = 0 | renamed (unchanged) | renamed (unchanged) | null | null |
| renamed, tags > 0 | `notice.renamedTags` | `notice.renamedTags` | null | null |
| skipped, tags = 0 | skipped (unchanged) | null (unchanged) | null | null |
| skipped, tags > 0 | `notice.skippedTags` | `notice.tagsMoved` | null | null |

The manual column is independent of `noticeLevel` (manual commands always report). "skipped, tags > 0"
covers every skip reason `tagMoveEligible()` lets through (`same-name`, `no-h1`, `collision`, `case-only`,
`empty-after-sanitize`; `rename-service.ts:122-125` only excludes error / locked / in-progress) — the copy
is independent of the reason.

Noise: after a move, the next pass sees `candidates.length === 0` (`rename-service.ts:196`) or, in keep
mode, `newCount === 0` (`:212`) and returns `none`, so each note announces once. `staleTags > 0` with
`moved = 0` stays silent.

### Implementation

- `src/notice.ts`: update the policy comment (`:5-10`); compute `tags` before the branches; renamed branch
  picks `notice.renamedTags` when `tags > 0`; skip branch:
  ```ts
  const reason = describeSkipReason(outcome.skipped);
  if (tags > 0) {
      if (manual) return t('notice.skippedTags', { reason, count: tags });
      return level === 'all' ? t('notice.tagsMoved', { count: tags }) : null;
  }
  return manual ? t('notice.skipped', { reason }) : null;
  ```
- `src/i18n.ts` (en / zh-tw / ja; the parity test enforces all three): `notice.renamedTags`
  (`H1Aligner: renamed → {name} (+{count} tags)`), `notice.skippedTags`
  (`H1Aligner: skipped ({reason}) — moved {count} tag(s) to frontmatter`; the em dash avoids ambiguity if a
  reason contains a comma), `notice.tagsMoved` (`H1Aligner: moved {count} tag(s) to frontmatter`).
- `set.notice.desc` (three locales) becomes conditional copy, e.g. `… All: also announce successful
  renames — and, when tag moving is enabled, tag writes to frontmatter.`
- No e2e harness change: the e2e plugin runs with the default `noticeLevel: off`, so scenarios 18a/18b/18c
  are unaffected.

### Tests

`tests/notice.test.ts`, six new cases: auto+all same-name with `movedTags: 2` → tagsMoved; same outcome at
`off` / `errors` → null; auto+all renamed with `movedTags: 2` → contains the name and `+2 tags`; manual+off
same-name with tags → contains `Already aligned` and `moved 2`; a non-same-name skip (`no-h1` +
`movedTags: 1`) at auto+all → tagsMoved; regression: `movedTags` undefined/0 leaves every existing string
unchanged.

### Docs

README settings table (Notice level row); CHANGELOG 0.12.0 entry.

---

## 6. Feature B — Lock / unlock command + file context menu

### Behaviour

- New command `toggle-lock-active-file`, name `Lock or unlock this note` (sentence case, no plugin name).
  `checkCallback`: an active file exists and `extension === 'md'` (deliberately not `manualEligible` —
  locking a note inside an ignored folder is harmless and reasonable). A command-palette name is static, so
  the command is **toggle semantics**, decided from the **real frontmatter inside the
  `processFrontMatter` callback** (never from `metadataCache`, so cache staleness cannot affect it), with a
  Notice reporting the result.
- `workspace.on('file-menu')`: when `file instanceof TFile && file.extension === 'md'`, add:
  - **"Lock this note" or "Unlock this note"** — chosen at menu-open time from
    `metadataCache.getFileCache(file)?.frontmatter?.['h1aligner-lock']` (null cache = unlocked). The menu
    items are **explicit, not toggle**: Lock → `setLock(file, true)`, Unlock → `setLock(file, false)`. If the
    cache is stale (lock just written, menu opened again before re-index, still shows "Lock"), clicking
    again is an idempotent re-set of `true` — **a stale label can never unlock by mistake.**
  - **"Rename from first H1"** — only when `manualEligible(file)`; calls
    `triggerRename(file, true, 'manual')`.
  - No `setSection()` (ordering of unknown sections unverified; consecutive `addItem` calls are adjacent
    anyway). `source` not filtered.
- Core method `setLock(file: TFile, lock: boolean | 'toggle'): Promise<void>` (menu passes `true`/`false`,
  the command passes `'toggle'`; exactly one `processFrontMatter` write):
  1. **Cancel any pending rename first, regardless of outcome:** `debouncer.cancel(file.path)` +
     `pendingRenameSource.delete(file.path)`. Doing this before `processFrontMatter` removes the window in
     which a debounce could fire during the await; harmless for unlock (the next trigger reschedules). The
     raw-content L0 re-check in `rename-service.ts:335-350` remains the last line of defence.
  2. Decide the final state inside the callback:
     ```ts
     let shouldLock = false;
     await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
         const before = isLockValue(fm['h1aligner-lock']);
         shouldLock = lock === 'toggle' ? !before : lock;
         if (shouldLock) fm['h1aligner-lock'] = true;
         else delete fm['h1aligner-lock'];
     });
     ```
     Unlock **deletes the key** (never writes `false`; `heading.ts:47` `LOCK_LINE` only recognises true, and
     the frontmatter stays clean). The whole call sits in try/catch (non-Markdown, deleted file, etc.).
     **Steps 3–4 use `shouldLock`, never the `lock` parameter** (`'toggle'` is truthy — using it directly
     would always lock).
  3. Notice: `shouldLock ? notice.locked : notice.unlocked`; if `!settings.skipIfFrontmatterLock`, append
     `notice.lockDisabled`.
  4. `activity.record({ ts, path: file.path, source: 'manual', outcome: shouldLock ? 'lock-on' : 'lock-off' })`
     — `ActivityEntry.outcome` is `string` (`activity-log.ts:13`), no type change. **Do not use
     `'locked'`** (it would render identically to the skip reason `locked` in `activity-modal.ts:36`).
  5. On failure: `console.error('[H1Aligner] lock toggle failed:', err)` + `new Notice(t('notice.error',
     { message }))` (`notice.error` has only `{message}`, `i18n.ts:11`). **The catch branch must return
     early** — falling through would report "unlocked" from the initial `shouldLock = false`.
- Race: `processFrontMatter` is not on the `RenameService` serial chain. Worst case, an in-flight rename
  completes before the lock lands — consistent with "the lock is absolute *as of the check*". Programmatic
  writes never emit `editor-change` (`main.ts:119-124`), so locking cannot schedule a rename in edit/both
  mode.
- Side effect: frontmatter re-serialisation drops YAML comments — same class as the alias / tag-move
  features, already documented in the README.

### Implementation

- `src/heading.ts` (next to `hasFrontmatterLock`): `export function isLockValue(v: unknown): boolean
  { return v === true || (typeof v === 'string' && v.toLowerCase() === 'true'); }`;
  `rename-service.ts:309-312` switches to it (existing lock tests are the regression guard).
- `src/main.ts`: `file-menu` `registerEvent` after the `editor-change` one; a fifth `addCommand` after
  `show-activity` (same `checkCallback` shape as `rename-active-file-from-h1`); `private async setLock(...)`
  after `triggerRename`. `Menu`/`MenuItem` types are inferred from `workspace.on`; `TFile` is already
  imported.
- `src/i18n.ts`, seven keys × three locales: `cmd.toggleLock` (`Lock or unlock this note`), `menu.lock`
  (`Lock this note`), `menu.unlock` (`Unlock this note`), `menu.renameFromH1` (`Rename from first H1` — same
  pattern as the existing command name that already passes lint), `notice.locked`
  (`H1Aligner: locked — {name} will not be renamed`), `notice.unlocked` (`H1Aligner: unlocked — {name}`),
  `notice.lockDisabled` (`"Respect frontmatter lock" is off in settings — this lock is inactive`; kept short
  for mobile). Run `npm run lint` before committing to confirm sentence-case on these strings.
- `settings.ts` / `settings-tab.ts`: untouched.

### Tests

- `tests/heading.test.ts`: `isLockValue` — `true`, `'true'`, `'True'` → true; `false`, `undefined`,
  `'yes'`, `1` → false.
- `tests/e2e/e2e-smoke.cjs`:
  - Scenario 1's command count `4 → 5`.
  - **25 toggle lock:** set `app._activeFile`, run the command → `fm['h1aligner-lock'] === true`, a locked
    notice, activity `lock-on`; run again → `'h1aligner-lock' in fm === false` (deleted, not `false`),
    activity `lock-off`.
  - **25b cancels a pending debounce:** `app._ws['file-open'](f)` → toggle immediately → `await sleep(400)`
    (default file-open debounce is 100 ms; generous buffer) → `_renameCalls.length` unchanged.
  - **25c** `checkCallback(true)` returns false for `_activeFile = null` and for non-`.md`.
  - **25d file-menu:** a ~8-line Menu fake (`addItem(cb)` → item whose `setTitle/setIcon/onClick` return
    `this` and record title + handler). Non-`TFile` / non-`.md` → no items; unlocked file shows the Lock
    label; a locked file (set `e.cache.frontmatter = { 'h1aligner-lock': true }` locally) shows Unlock;
    clicking Lock sets `fm` true; **stale-cache case:** `fm` already true but cache says unlocked → label is
    Lock → click → `fm` still true (idempotent, no accidental unlock); a file in an ignored folder gets no
    "Rename from first H1"; clicking "Rename from first H1" grows `_renameCalls`.
  - The stub's `processFrontMatter` does not mirror `e.fm` into `e.cache.frontmatter`; mirror locally inside
    a scenario when needed — **do not change the global stub** (18a/18b/18c depend on it).
- `tests/i18n.test.ts` covers the new keys automatically.

### Docs

README Commands table (new row) and the two lock mentions ("or use the command / context menu"); CHANGELOG;
`docs/MOBILE-TESTING.md` new item #16 (long-press → Lock → open, not renamed → Unlock → open, renamed).

---

## 7. Feature C — Undo button in the rename notice

### Behaviour

- Only in `triggerRename()` (automatic triggers and the manual command), only on a **successful rename**
  (`skipped === 'none' && !error && newName`), and only when `noticeFor()` returns a message: the Notice
  gets an Undo button and its duration is raised to 8000 ms. Skip/error notices and the batch-apply summary
  are unchanged (a multi-file apply must not be one-tap reverted).
- **Where the record comes from:** `RenameOutcome` gains `record?: RenameRecord`; `rename-service.ts:423-426`
  pushes the record to history and returns the same object in the outcome. `main.ts` reads
  `outcome.record` — no reliance on `history.peek()` timing.
- Click: `notice.hide()` → if `this.history.peek() === record` (**record object identity**, not `TFile`
  identity — Obsidian mutates the same `TFile.path` in place, so two consecutive renames of one file would
  fool a `TFile` comparison) → `void this.undoLastRename()`; otherwise `new Notice(t('notice.undoSuperseded'))`.
  `undoLastRename()` re-peeks and performs its own identity / case-insensitive-NFC occupancy checks; both
  layers look at the same stack top synchronously, so they cannot disagree — the inner one is a second line
  of defence, not bypassed.
- **Interaction with click-to-dismiss:** the button lives inside `messageEl`; the click target is the
  button. Whether Obsidian's dismiss listener is bound in the bubble or capture phase, the button's own
  listener still runs (a capture listener does not suppress target-phase listeners short of
  `stopImmediatePropagation`). If Obsidian hides the notice first, no harm — the handler hides it anyway
  (idempotent). **Correctness does not depend on the binding mode;** `evt.stopPropagation()` only avoids a
  redundant dismiss. Verify once in a real Obsidian via `obsidian-cli` during implementation (Undo → filename
  restored, notice closed, undo ran exactly once).
- **After unload, two layers:**
  1. `private unloaded = false`, set in `onunload`; `undoFromNotice` returns immediately when set. This is
     the **correctness** layer — a surviving button listener (notice expired, or evicted from the tracking
     array) can never rename.
  2. `private readonly undoNotices: Notice[]` (cap 10, shift the oldest — no `hide()` on shift; they vanish
     after 8 s anyway); `onunload` hides and clears them. This is **UI tidiness** only. `trackUndoNotice`
     does push + shift and nothing else, so scenario 26e can tell the two layers apart.
- Mobile: same Notice API; **not yet verified on a device** — `docs/MOBILE-TESTING.md` item #15. CSS gives
  the button enough padding as a touch target.

### Implementation

- `src/rename-service.ts`: `RenameOutcome.record?: RenameRecord` (type import from `./history`);
  `const record = { from: path, to: newPath, file }; this.history?.push(record);
  return { skipped: 'none', newName: finalBase, record };`. Dry-run path unchanged.
- `src/notice.ts`: type predicate `export function offersUndo(outcome: RenameOutcome): outcome is
  RenameOutcome & { record: RenameRecord }` (`skipped === 'none' && !error && !!newName && !!record`) so the
  caller narrows without `!`.
- `src/main.ts`, replacing the two notice lines at the end of `triggerRename`:
  ```ts
  const message = noticeFor(outcome, manual, this.settings.noticeLevel);
  if (!message) return;
  if (!offersUndo(outcome)) { new Notice(message); return; }
  const { record } = outcome;
  const notice = new Notice(message, 8000);
  const btn = notice.messageEl.createEl('button', { text: t('notice.undoButton'), cls: 'h1aligner-notice-undo' });
  btn.addEventListener('click', (evt) => { evt.stopPropagation(); this.undoFromNotice(record, notice); });
  this.trackUndoNotice(notice);
  ```
  plus `private undoFromNotice(record: RenameRecord, notice: Notice): void` (first line
  `if (this.unloaded) return;`, then `notice.hide()`, then the `peek() === record` comparison),
  `private trackUndoNotice(notice: Notice): void`, and in `onunload`:
  `this.unloaded = true; for (const n of this.undoNotices) n.hide(); this.undoNotices.length = 0;`.
- `src/i18n.ts`, two keys × three locales: `notice.undoButton` (`Undo` / `復原` / `元に戻す`),
  `notice.undoSuperseded` (`H1Aligner: that rename is no longer the latest — use the Undo command`).
- `styles.css`: `.h1aligner-notice-undo { margin-left: 0.75em; padding: 0.2em 0.8em; }`
  (`no-static-styles-assignment` is error-level; no inline styles).

### Tests

- `tests/rename-service.test.ts`: on a successful rename `outcome.record` is the same object as
  `history.peek()`; dry-run and skips leave `record` undefined.
- `tests/notice.test.ts`: `offersUndo`, five cases (renamed + record → true; skipped / error / null newName /
  missing record → false — the missing-record fixture sets `record: undefined` explicitly).
- `tests/e2e/e2e-smoke.cjs`:
  - Notice stub: `constructor(msg, duration) { notices.push(String(msg)); this.messageEl = new FakeEl('div');
    this.duration = duration; noticeObjs.push(this); } hide() { this.hidden = true; }` — keeps the existing
    string-based assertions intact; `FakeEl` already supports `createEl` and `opts.text`.
  - **26a:** file-open rename at `noticeLevel: 'all'` → find the button in
    `noticeObjs.at(-1).messageEl.children` → fire `listeners.click[0]({ stopPropagation(){} })` →
    `await sleep(50)` → last `_renameCalls` entry is the reverse rename, notices contain `undone`, activity
    has source `undo`, the notice is `hidden`.
  - **26b superseded:** rename A, then B; click A's button → `_renameCalls.length` unchanged, superseded
    notice shown.
  - **26c:** rename the same file twice; click the first toast's button → rejected (record identity).
  - **26d:** batch-apply summary and skip/error notices have no button; a button-bearing notice has
    `duration === 8000`.
  - **26e unload:** create 12 button-bearing notices (cap 10 → first two evicted) → `onunload` → the 10
    tracked ones are `hidden`; click the evicted first one and the last one → `_renameCalls.length`
    unchanged for both (proves the `unloaded` flag, not just the array).

### Docs

README Undo row and the two behaviour notes ("or tap Undo on the notice"); CHANGELOG; MOBILE-TESTING #15.

---

## 8. Shared

- Version `0.12.0` (minor). Standard RELEASING.md flow; the on-device gate is run by the author before
  publishing.
- Order and commit granularity: **A → B → C**, one commit each (code + tests + docs), each green on
  `npm run lint && npm run build && npm test && npm run test:e2e`. The "Rename from first H1" menu item may
  be split into its own follow-up commit if B grows too large.
- TDD: write the failing test first for every item.
- README test counts updated; e2e scenarios 31 → ~36.
- No new ESLint overrides.
- Tech-debt note (out of scope): e2e debounce checks use the real clock plus `sleep()`; under an extremely
  busy CI runner this is a theoretical flake source. Consider an injectable clock for `KeyedDebouncer` before
  batch 2.

## 9. Definition of done

1. `npm run lint` clean; `npm run build` passes; `npm test` green (388+ → ~410); `npm run test:e2e` green
   (31 → ~36).
2. Manual pass in a real Obsidian 1.13.x via `obsidian-cli`: lock → open → not renamed → unlock → renamed;
   re-open the context menu immediately after locking and confirm it cannot unlock by mistake; rename →
   Undo on the toast → filename restored, notice closed, undo ran once; open an aligned note with body tags →
   "moved N tag(s)" toast.
3. `scripts/dev-deploy.mjs` to the test vault (description marker only).
4. On-device checklist items #15 and #16 recorded in `docs/MOBILE-TESTING.md`.

## 10. External review log

The design was reviewed three times by an independent LLM reviewer (Perplexity agent API, Claude Sonnet
4.6 with web search) before being finalised.

**Round 1 (v1) — revise.** Four blocking items: (1) "`Notice.messageEl` does not exist" — **rejected**: the
reviewer had read an outdated mirror of `obsidian.d.ts`; the local 1.13.1 package declares `messageEl`
(@since 1.8.7) and deprecates `noticeEl` (the reviewer confirmed this against docs.obsidian.md in round 2).
(2) Click-to-dismiss vs `stopPropagation` unverified — **addressed** by making correctness independent of the
binding mode (see §7) and scheduling a real-app check. (3) `history.peek()` after an await could race —
**adopted**: the record is now returned synchronously in the outcome. (4) A stale `metadataCache` could make
a toggle-style menu item unlock by accident — **adopted**: menu items are explicit Lock/Unlock; the command
keeps toggle semantics but decides from the real frontmatter. Non-blocking items (mobile `source`,
comma-in-reason copy, tracking multiple notices, `ActivityEntry.outcome` type, `FakeEl.createEl`,
sentence-case, `notice.error` format, try/catch scope, `registerEvent` cleanup, double-layer undo checks,
conditional `set.notice.desc` copy) were all folded in.

**Round 2 (v2) — revise.** All 15 round-1 responses judged adequate. Two new blocking items, both genuine
gaps in the v2 text: the `setLock` pseudocode did not handle `'toggle'` (a truthy string — it would always
lock) — **fixed** with the `shouldLock` form in §6; and the post-unload defence for evicted notice buttons
was unspecified — **fixed** with the `unloaded` flag (§7). Non-blocking: type predicate for `offersUndo`,
shorter `lockDisabled` copy, manual-column note in the policy table, cancel-before-write ordering in
`setLock`, wider sleep buffer in 25b, three-locale copy for `Undo` — all adopted.

**Round 3 (v3) — approve.** All 10 round-2 responses judged adequate; no blocking items. Reviewer summary:
internally consistent, invariants clearly mapped, implementation boundary clean, scope contained. Four
non-blocking reminders were folded in (early return in the catch branch; no `hide()` on eviction so 26e
tests the flag; the real-clock tech-debt note; explicit `record: undefined` fixture).

## 11. Execution plan for this batch (agreed with Aiken, 2026-09-13)

The design above is finalized (§10). This section records how implementation of *this batch* will actually
run — process, not design — agreed with Aiken after the design was presented. It was not put through
external review; it can change without reopening §5–§7.

- **Branch:** `feature/0.12.0-batch1`, cut from `main` at the commit that adds this document. Batch 2 and
  batch 3 (the remaining five features on the roadmap in §1) will each get their own branch and their own
  design document later — this plan covers batch 1 only.
- **Delivery cadence inside the batch:** Features A (tag-move notice) → B (lock/unlock) → C (undo button)
  are implemented **in one continuous pass on the branch**, in that order, each as its own commit with its
  own tests (TDD: failing test first), each commit green on
  `npm run lint && npm run build && npm test && npm run test:e2e`. There is no stop-and-check between A, B,
  and C — the whole branch (three commits) is handed to Aiken as a single batch for review once all three
  are done and green.
- **Merging:** the branch is merged into `main` only after Aiken has reviewed the three commits and the
  on-device checklist below has passed. No automated step merges it. `manifest.json`'s `version` is not
  touched by this batch (unchanged from `main`'s current `0.11.2`); the actual `0.12.0` version bump and
  release stay a separate, later step Aiken runs per `RELEASING.md`, same as every prior release.
- **On-device verification is out of scope for the implementing agent.** `scripts/dev-deploy.mjs`'s two
  target vaults are hardcoded Mac paths (`/Users/aikenlin/Obsidian/...`); this batch is implemented on a
  machine with no real Obsidian install, so §7's "verify via `obsidian-cli` in a real Obsidian" step and §9's
  definition-of-done item 2 cannot be executed there. Once the branch is ready, the implementing agent hands
  Aiken a short checklist covering only what's new in this batch (existing regressions stay covered by the
  automated suite):
  1. File menu on a `.md` note shows **Lock this note**; click it, reopen the menu → shows **Unlock this
     note**; click it again → back to **Lock this note**, and the note's frontmatter has no `h1aligner-lock`
     key left behind.
  2. Right-click a note, choose Lock, then *immediately* right-click the same note again before Obsidian
     re-indexes — the menu must not show anything that would unlock it by accident (clicking whatever it
     shows must leave the note locked).
  3. With **Move tags to frontmatter** enabled and a note whose filename already matches its H1 but whose
     body still has tags, opening it produces a "moved N tag(s) to frontmatter" toast (previously: silence).
  4. Trigger a rename, click **Undo** on the toast within a few seconds → filename reverts, the toast closes,
     and doing it again (or clicking an old toast after a newer rename happened) shows the "no longer the
     latest" message instead of undoing twice.
  Aiken runs this himself on the Mac via the existing `node scripts/dev-deploy.mjs` flow into
  `ObsidianTestVault`, at his own pace, and decides whether/how to log the result (e.g. a new row in
  `docs/MOBILE-TESTING.md`, or nothing formal — this batch doesn't touch mobile-specific code paths, so it's
  not required to go through that checklist's iPhone/Android gate before merging, only before the eventual
  `0.12.0` release itself does).
- **Gate:** none of the above starts until Aiken explicitly says to begin implementation. Reaching agreement
  on this execution plan is not that signal.
