/**
 * activity-modal.ts — read-only view of the session ActivityLog.
 * Thin obsidian-coupled shell; the data lives in src/activity-log.ts.
 */
import { App, Modal } from 'obsidian';
import type { ActivityLog } from './activity-log';
import { t } from './i18n';

export class ActivityModal extends Modal {
    constructor(app: App, private readonly log: ActivityLog) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: t('activity.title') });

        const entries = this.log.entries();
        if (entries.length === 0) {
            contentEl.createEl('p', { text: t('activity.empty') });
            return;
        }

        const list = contentEl.createDiv();
        list.classList.add('h1aligner-scroll-list');
        for (const e of entries) {
            const row = list.createDiv();
            row.classList.add('h1aligner-row');
            const time = new Date(e.ts).toLocaleTimeString();
            const result =
                e.outcome === 'renamed'
                    ? `→ ${e.newName}`
                    : `(${e.outcome}${e.detail ? ': ' + e.detail : ''})`;
            row.createSpan({
                text: `${time}  [${e.source}]  ${e.path}  ${result}`,
            });
            if (e.outcome !== 'renamed') row.classList.add('h1aligner-dim');
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
