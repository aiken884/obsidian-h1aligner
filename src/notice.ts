/**
 * notice.ts — pure notice-message decision (no obsidian import,
 * vitest-loadable). main.ts turns a non-null return into `new Notice(...)`.
 *
 * Policy (Q2 — quiet by default):
 *   - errors and successful renames: shown when showNoticeOnRename is on,
 *     and ALWAYS for the manual command;
 *   - skip reasons: only the manual command reports them.
 */
import type { RenameOutcome } from './rename-service';

export function noticeFor(
    outcome: RenameOutcome,
    manual: boolean,
    showNoticeOnRename: boolean,
): string | null {
    if (outcome.error) {
        return showNoticeOnRename || manual
            ? `H1Aligner error: ${outcome.error.message}`
            : null;
    }
    if (outcome.skipped === 'none' && outcome.newName) {
        return showNoticeOnRename || manual
            ? `H1Aligner: renamed → ${outcome.newName}`
            : null;
    }
    return manual ? `H1Aligner: skipped (${outcome.skipped})` : null;
}
