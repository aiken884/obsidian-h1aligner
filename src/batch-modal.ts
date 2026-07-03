/**
 * batch-modal.ts — dry-run preview modal for vault-wide renames.
 *
 * Thin obsidian-coupled shell: the outcomes are computed by RenameService
 * in dry-run mode before the modal opens; Apply re-runs them for real.
 */
import { App, Modal, TFile } from 'obsidian';

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
            text: `${renamable.length} of ${this.items.length} note(s) would be renamed.`,
        });
        const hint = contentEl.createEl('p', {
            text: 'Targets are re-checked at apply time; notes whose H1 changed meanwhile are skipped.',
        });
        hint.style.opacity = '0.7';
        hint.style.fontSize = '0.85em';

        const list = contentEl.createEl('div');
        list.style.maxHeight = '50vh';
        list.style.overflowY = 'auto';

        for (const item of this.items) {
            const row = list.createEl('div');
            row.style.padding = '2px 0';
            if (item.to !== null) {
                row.createEl('span', { text: `${item.from} → ${item.to}.md` });
            } else {
                const span = row.createEl('span', {
                    text: `${item.from} — skipped (${item.reason})`,
                });
                span.style.opacity = '0.6';
            }
        }

        const buttons = contentEl.createEl('div');
        buttons.style.marginTop = '1em';
        buttons.style.display = 'flex';
        buttons.style.gap = '0.5em';
        buttons.style.justifyContent = 'flex-end';

        const cancel = buttons.createEl('button', { text: 'Close' });
        cancel.addEventListener('click', () => this.close());

        if (renamable.length > 0) {
            const apply = buttons.createEl('button', {
                text: `Apply ${renamable.length} rename(s)`,
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
