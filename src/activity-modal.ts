/**
 * activity-modal.ts — read-only view of the session ActivityLog.
 * Thin obsidian-coupled shell; the data lives in src/activity-log.ts.
 */
import { App, Modal, Notice } from 'obsidian';
import { formatActivityEntry, formatActivityText, type ActivityLog } from './activity-log';
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

        const formatTime = (ts: number): string => new Date(ts).toLocaleTimeString();
        const copy = contentEl.createEl('button', { text: t('activity.copy') });
        copy.addEventListener('click', () => {
            // Snapshot at click time, and call the clipboard synchronously in
            // the handler so the user gesture is still active. Every failure
            // (API missing, sync throw, rejected promise) gets the same
            // neutral notice — the cause is not guessable from here.
            const text = formatActivityText(entries, formatTime);
            const fail = (): void => {
                new Notice(t('activity.copyFailed'));
            };
            try {
                void navigator.clipboard.writeText(text).then(
                    () => new Notice(t('activity.copied', { count: entries.length })),
                    fail,
                );
            } catch {
                fail();
            }
        });

        const list = contentEl.createDiv();
        list.classList.add('h1aligner-scroll-list');
        for (const e of entries) {
            const row = list.createDiv();
            row.classList.add('h1aligner-row');
            row.createSpan({ text: formatActivityEntry(e, formatTime(e.ts)) });
            if (e.outcome !== 'renamed') row.classList.add('h1aligner-dim');
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
