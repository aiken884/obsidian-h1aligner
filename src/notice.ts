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
 *   - `tags = outcome.movedTags ?? 0` (the experimental tag mover) can turn a
 *     would-be-silent case into a notice: a successful rename that also moved
 *     tags gets the tag count appended; a skip that still moved tags (every
 *     skip reason tagMoveEligible() lets through) reports at manual and at
 *     auto 'all' even though a plain skip never does. `tags === 0` leaves
 *     every branch byte-identical to the pre-tag-move behaviour.
 */
import type { RenameOutcome } from './rename-service';
import type { NoticeLevel } from './settings';
import { t } from './i18n';
import { describeSkipReason } from './skip-reason';

export function noticeFor(
    outcome: RenameOutcome,
    manual: boolean,
    level: NoticeLevel,
): string | null {
    const tags = outcome.movedTags ?? 0;
    if (outcome.error) {
        return manual || level === 'errors' || level === 'all'
            ? t('notice.error', { message: outcome.error.message })
            : null;
    }
    if (outcome.skipped === 'none' && outcome.newName) {
        if (!manual && level !== 'all') return null;
        return tags > 0
            ? t('notice.renamedTags', { name: outcome.newName, count: tags })
            : t('notice.renamed', { name: outcome.newName });
    }
    const reason = describeSkipReason(outcome.skipped);
    if (tags > 0) {
        if (manual) return t('notice.skippedTags', { reason, count: tags });
        return level === 'all' ? t('notice.tagsMoved', { count: tags }) : null;
    }
    return manual ? t('notice.skipped', { reason }) : null;
}
