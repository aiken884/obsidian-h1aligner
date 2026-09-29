# Adversarial review: batch 3 (activity Copy / frontmatter title fallback)

Date: 2026-09-30
Against: `docs/design-batch3-activity-copy-frontmatter-title.md`, branch `feature/0.12.0-batch3` @ `817defb` (diff vs `feature/0.12.0-batch2`)
Method: three read-only reviewers (no file or git writes), one per perspective — spec conformance, program correctness / product invariants, Obsidian community-plugin rules and mobile. Fixes were made by the main session only.

## Round 1

| # | Perspective | Finding | Severity | Status |
|---|---|---|---|---|
| 1 | spec | §7 required test missing: title fallback + alias-preserve + tag mover together, one rename and no loop on the following edit-trigger pass | major | **fixed** — `tests/tag-move-integration.test.ts` |
| 2 | spec | §7 required test missing: batch **and** folder preview invalidated by the new setting (only the pure fingerprint was tested) | major | **fixed** — E2E 31 drives both Apply guards through `main.ts` |
| 3 | spec | Clipboard tests derive the expected string from the same `toLocaleTimeString()` as the code, so a shared format drift passes | minor | **fixed** — time text is pinned, expected string is a literal (unit) |
| 4 | spec | No e2e for the stale-cache / cache-ordering sequence | minor | **fixed** — E2E 30 covers cache updated before the debounce fires, and stale-at-evaluation → next evaluation renames again (not `same-name`) |
| 5 | spec | README / setting text said "the next trigger corrects it", stronger than the accepted behavior (round-2 PPLX point) | minor | **fixed** — "a later trigger corrects it; if none happens, Undo reverts the rename" in README, en/zh-TW/ja setting text and the changelog draft |
| 6 | spec | `docs/MOBILE-TESTING.md`: blank line split the table before #20 | minor | **fixed** |
| 7 | rules | en "copied {count} activity entries" reads wrongly for 1 | minor | **fixed** — "activity log copied ({count})" |
| 8 | rules | Copy button has no CSS class / `aria-label` | minor | not changed — visible text "Copy" is the accessible name; default button styling is acceptable |
| 9 | rules | `navigator.clipboard` availability on iOS/Android WebViews unverified | minor | **open by design** — MOBILE-TESTING #20 records it per platform; mobile support is claimed only after that passes |
| 10 | correctness | With the setting on, a note with no H1 and an unusable title still says "no H1" (does not mention the title) | minor | not changed — recorded non-goal in the design (§9) |
| 11 | correctness | Title read from the metadata cache, not raw content | minor | not changed — accepted behavior, design §5 (PPLX round 3) |
| 12 | correctness | Batch/folder preview rows do not show that a name came from the title | minor | not changed — Apply re-verifies with a dry run; only Explain surfaces the source |
| 13 | spec | Explain-level test for the empty-H1 vs no-H1 distinction | minor | not changed — covered at the rename-service level |

Correctness reviewer found no invariant violated (H1 wins, off = no change, no content writes, idempotence, lock/scope/pause/collision/Undo shared, key present in all six plumbing places). Rules reviewer: ESLint clean, no Node/Electron API, no `innerHTML`/static styles, i18n parity, release script outside the bundle, no secrets in `docs/pplx/`.

## Verdict

No blocking findings in round 1; the two major test gaps were closed. **Approve for internal testing on this branch.** Not a release approval: 0.14.0 needs `RELEASING.md`'s gate including MOBILE-TESTING #20–#23 on device (in particular the clipboard behavior per platform and the real-Obsidian event/cache ordering for #22).
