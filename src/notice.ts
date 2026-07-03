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
import { t } from './i18n';

export function noticeFor(
    outcome: RenameOutcome,
    manual: boolean,
    level: NoticeLevel,
): string | null {
    if (outcome.error) {
        return manual || level === 'errors' || level === 'all'
            ? t('notice.error', { message: outcome.error.message })
            : null;
    }
    if (outcome.skipped === 'none' && outcome.newName) {
        return manual || level === 'all'
            ? t('notice.renamed', { name: outcome.newName })
            : null;
    }
    return manual ? t('notice.skipped', { reason: outcome.skipped }) : null;
}
