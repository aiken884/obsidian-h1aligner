/**
 * notice.ts — pure notice-message decision (no obsidian import,
 * vitest-loadable). main.ts turns a non-null return into `new Notice(...)`.
 *
 * Policy:
 *   - manual command: ALWAYS reports (success, skip reason, or error);
 *   - automatic renames follow noticeLevel:
 *       'off'    — silent
 *       'errors' — errors only
 *       'all'    — errors + successful renames (skips stay silent)
 */
import type { RenameOutcome } from './rename-service';
import type { NoticeLevel } from './settings';

export function noticeFor(
    outcome: RenameOutcome,
    manual: boolean,
    level: NoticeLevel,
): string | null {
    if (outcome.error) {
        return manual || level === 'errors' || level === 'all'
            ? `H1Aligner error: ${outcome.error.message}`
            : null;
    }
    if (outcome.skipped === 'none' && outcome.newName) {
        return manual || level === 'all'
            ? `H1Aligner: renamed → ${outcome.newName}`
            : null;
    }
    return manual ? `H1Aligner: skipped (${outcome.skipped})` : null;
}
