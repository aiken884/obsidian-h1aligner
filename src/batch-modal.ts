/**
 * batch-modal.ts — dry-run preview modal for vault-wide renames.
 *
 * Thin obsidian-coupled shell: the outcomes are computed by RenameService
 * in dry-run mode before the modal opens; Apply re-verifies each target
 * against a fresh dry run before renaming.
 */
import { App, Modal, TFile } from 'obsidian';
import { BatchItemStatus, BatchTriageItem, groupBatchItems } from './batch-triage';
import { t } from './i18n';

export interface BatchItem extends BatchTriageItem {
    file: TFile;
    from: string;
    /** Proposed target basename, when one could be calculated. */
    to: string | null;
    /** Stable machine reason shown through the localized UI mapping below. */
    reason: string;
    /** Technical failure detail, present only for error outcomes. */
    detail?: string;
}

export type ApplicableBatchItem = BatchItem & { status: 'rename'; to: string };

export class BatchPreviewModal extends Modal {
    constructor(
        app: App,
        private readonly items: BatchItem[],
        private readonly canApply: boolean,
        private readonly onApply: (renamable: ApplicableBatchItem[]) => Promise<void>,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();

        const renamable = this.items.filter(
            (item): item is ApplicableBatchItem =>
                item.status === 'rename' && item.to !== null && item.to.length > 0,
        );

        let warningId: string | null = null;
        if (!this.canApply) {
            const warning = contentEl.createEl('p', { text: t('batch.invalidPatterns') });
            warning.classList.add('h1aligner-validation', 'h1aligner-batch-warning');
            warning.id = 'h1aligner-batch-invalid-patterns';
            warning.setAttribute('role', 'status');
            warningId = warning.id;
        }

        contentEl.createEl('p', {
            text: t('batch.summary', { renamable: renamable.length, total: this.items.length }),
        });
        const hint = contentEl.createEl('p', { text: t('batch.hint') });
        hint.classList.add('h1aligner-hint');
        const settingsSnapshot = contentEl.createEl('p', { text: t('batch.settingsSnapshot') });
        settingsSnapshot.classList.add('h1aligner-hint');

        const list = contentEl.createDiv();
        list.classList.add('h1aligner-scroll-list');

        for (const group of groupBatchItems(this.items)) {
            this.renderGroup(list, group.status, group.items);
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
            if (!this.canApply) {
                apply.disabled = true;
                apply.setAttribute('aria-disabled', 'true');
                if (warningId) apply.setAttribute('aria-describedby', warningId);
                return;
            }
            apply.addEventListener('click', () => {
                this.close();
                void this.onApply(renamable);
            });
        }
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private renderGroup(
        container: HTMLElement,
        status: BatchItemStatus,
        items: BatchItem[],
    ): void {
        const group = container.createEl('details');
        group.classList.add('h1aligner-batch-group');
        group.open = status !== 'skipped';
        group.createEl('summary', { text: this.groupTitle(status, items.length) });

        const body = group.createDiv();
        body.classList.add('h1aligner-batch-group-body');
        if (status === 'conflict' || status === 'error') {
            const hint = body.createDiv({ text: t('batch.group.excluded') });
            hint.classList.add('h1aligner-hint');
        }

        if (status === 'skipped') {
            this.renderSkippedCounts(body, items);
            return;
        }

        // Cap each actionable group to prevent a large vault from producing
        // tens of thousands of DOM nodes while keeping conflicts reviewable.
        const MAX_ROWS_PER_GROUP = 500;
        for (const item of items.slice(0, MAX_ROWS_PER_GROUP)) {
            const row = body.createDiv();
            row.classList.add('h1aligner-row');
            row.createSpan({
                text: item.to === null ? item.from : `${item.from} → ${item.to}.md`,
            });
            if (item.status !== 'rename') {
                const reason = row.createDiv({ text: this.describeReason(item) });
                reason.classList.add('h1aligner-batch-reason');
            }
        }
        if (items.length > MAX_ROWS_PER_GROUP) {
            const more = body.createDiv({
                text: t('batch.moreItems', { count: items.length - MAX_ROWS_PER_GROUP }),
            });
            more.classList.add('h1aligner-dim');
        }
    }

    private renderSkippedCounts(container: HTMLElement, items: BatchItem[]): void {
        const counts = new Map<string, number>();
        for (const item of items) {
            counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
        }
        for (const [reason, count] of counts) {
            container.createDiv({ text: `${count} × ${this.describeReason({ reason })}` });
        }
    }

    private groupTitle(status: BatchItemStatus, count: number): string {
        switch (status) {
            case 'rename':
                return t('batch.group.rename', { count });
            case 'conflict':
                return t('batch.group.conflict', { count });
            case 'error':
                return t('batch.group.error', { count });
            case 'skipped':
                return t('batch.group.skipped', { count });
        }
    }

    private describeReason(item: Pick<BatchItem, 'reason' | 'detail'>): string {
        switch (item.reason) {
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
            case 'duplicate-target':
                return t('batch.reason.duplicateTarget');
            case 'in-progress':
                return t('batch.reason.inProgress');
            case 'error':
                return t('batch.reason.error', { message: item.detail ?? t('batch.reason.unknown') });
            default:
                return item.reason;
        }
    }
}
