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

        // Renamable rows first (what Apply acts on), capped so a huge vault
        // does not create tens of thousands of DOM nodes on mobile.
        const MAX_ROWS = 500;
        for (const item of renamable.slice(0, MAX_ROWS)) {
            const row = list.createEl('div');
            row.style.padding = '2px 0';
            row.style.wordBreak = 'break-all';
            row.createEl('span', { text: `${item.from} → ${item.to}.md` });
        }
        if (renamable.length > MAX_ROWS) {
            const more = list.createEl('div', {
                text: `…and ${renamable.length - MAX_ROWS} more rename(s)`,
            });
            more.style.opacity = '0.6';
        }

        // Skips collapse into per-reason counts — on a healthy vault they are
        // thousands of 'same-name' rows that would drown the real renames.
        const skipped = this.items.filter((i) => i.to === null);
        if (skipped.length > 0) {
            const counts = new Map<string, number>();
            for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
            const summary = list.createEl('div');
            summary.style.marginTop = '0.5em';
            summary.style.opacity = '0.6';
            summary.createEl('div', { text: `Skipped ${skipped.length} note(s):` });
            for (const [reason, count] of counts) {
                summary.createEl('div', { text: `  ${count} × ${reason}` });
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
