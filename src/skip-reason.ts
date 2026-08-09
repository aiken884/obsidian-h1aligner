/**
 * skip-reason.ts — localized, human-readable text for a RenameSkipReason.
 *
 * Pure (no obsidian import). Single source of truth for describing *why* a
 * rename was skipped; shared by notice.ts (the manual-command skip Notice)
 * and batch-modal.ts (the batch preview's reason column) so both surfaces
 * describe the same RenameSkipReason identically instead of one of them
 * leaking the raw internal enum value to the user.
 */
import type { RenameSkipReason } from './rename-service';
import { t } from './i18n';

export function describeSkipReason(reason: RenameSkipReason): string {
    switch (reason) {
        case 'locked':
            return t('batch.reason.locked');
        case 'no-h1':
            return t('batch.reason.noH1');
        case 'empty-after-sanitize':
            return t('batch.reason.emptyAfterSanitize');
        case 'same-name':
            return t('batch.reason.sameName');
        case 'case-only':
            return t('batch.reason.caseOnly');
        case 'collision':
            return t('batch.reason.collision');
        case 'in-progress':
            return t('batch.reason.inProgress');
        case 'none':
            // Not a real skip reason (no localized mapping exists); kept
            // only so this switch stays exhaustive over RenameSkipReason.
            return reason;
    }
}
