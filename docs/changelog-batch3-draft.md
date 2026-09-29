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
