/**
 * batch-modal.ts — dry-run preview modal for vault-wide renames.
 *
 * Thin obsidian-coupled shell: the outcomes are computed by RenameService
 * in dry-run mode before the modal opens; Apply re-verifies each target
 * against a fresh dry run before renaming.
 */
import { App, Modal, TFile } from 'obsidian';
import { t } from './i18n';

export interface BatchItem {
    file: TFile;
    from: string;
    /** Target basename, or null when the file would be skipped. */
    to: string | null;
    reason: string;
}

export class BatchPreviewModal extends Modal {
    constructor(
        app: App,
        private readonly items: BatchItem[],
        private readonly onApply: (renamable: BatchItem[]) => Promise<void>,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        const renamable = this.items.filter((i) => i.to !== null);
        contentEl.createEl('p', {
            text: t('batch.summary', { renamable: renamable.length, total: this.items.length }),
        });
        const hint = contentEl.createEl('p', { text: t('batch.hint') });
        hint.classList.add('h1aligner-hint');

        const list = contentEl.createDiv();
        list.classList.add('h1aligner-scroll-list');

        // Renamable rows first (what Apply acts on), capped so a huge vault
        // does not create tens of thousands of DOM nodes on mobile.
        const MAX_ROWS = 500;
        for (const item of renamable.slice(0, MAX_ROWS)) {
            const row = list.createDiv();
            row.classList.add('h1aligner-row');
            row.createSpan({ text: `${item.from} → ${item.to}.md` });
        }
        if (renamable.length > MAX_ROWS) {
            const more = list.createDiv({
                text: t('batch.more', { count: renamable.length - MAX_ROWS }),
            });
            more.classList.add('h1aligner-dim');
        }

        // Skips collapse into per-reason counts — on a healthy vault they are
        // thousands of 'same-name' rows that would drown the real renames.
        const skipped = this.items.filter((i) => i.to === null);
        if (skipped.length > 0) {
            const counts = new Map<string, number>();
            for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
            const summary = list.createDiv();
            summary.classList.add('h1aligner-skip-summary');
            summary.createDiv({ text: t('batch.skippedHeader', { count: skipped.length }) });
            for (const [reason, count] of counts) {
                summary.createDiv({ text: `  ${count} × ${reason}` });
            }
        }

        const buttons = contentEl.createDiv();
        buttons.classList.add('h1aligner-buttons');

        const cancel = buttons.createEl('button', { text: t('batch.close') });
        cancel.addEventListener('click', () => this.close());

        if (renamable.length > 0) {
            const apply = buttons.createEl('button', {
                text: t('batch.apply', { count: renamable.length }),
            });
            apply.classList.add('mod-cta');
            apply.addEventListener('click', () => {
                this.close();
                void this.onApply(renamable);
            });
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
