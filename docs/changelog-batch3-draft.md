<!--
DRAFT — batch 3 (0.14.0) release notes. NOT part of CHANGELOG.md on purpose:
0.13.0 (batch 2) is released from `main`, and a new section next to
`## Unreleased` conflicts with the release commit that renames that heading.
In the first commit after syncing the 0.13.0 release into this branch, move
the section below into CHANGELOG.md as a new `## Unreleased` and delete this
file. See docs/design-batch3-activity-copy-frontmatter-title.md §8.
-->

## Unreleased
- **Add**: a **Copy** button in the recent-activity window copies the session activity as plain text (one line per entry, newest first, exactly as shown: `time  [source]  path  result`). It writes to the system clipboard only when you press it; if the clipboard is unavailable (or the write is refused) you get a notice, and the list text can still be selected by hand. No network use.
- **Add**: opt-in setting **Use frontmatter title when there is no H1** (Naming; off by default). When a note has no usable first H1, it is renamed from the text of its frontmatter `title` property instead of being skipped. A first H1 always wins (an H1 that sanitizes to nothing is still skipped, not replaced by the title); only string titles count (whitespace collapsed; arrays, numbers, booleans and empty values are ignored); the title goes through the name template like an H1. The title is read from Obsidian's metadata cache — the same freshness as the H1 path — so right after editing it a rename can still use the previous title (the next trigger corrects it; **Undo** reverts it). **Explain this note** says when a name would come from the title. Lock, ignore/include/exclude, collision policy and Undo apply unchanged, and the new setting invalidates an open batch preview.
- **Add**: unit tests now guard the settings plumbing that failed silently in the past — every setting must survive a save/load round trip through `normalizeSettings`, and every settings-tab control must actually change `plugin.settings` through `setControlValue`.
