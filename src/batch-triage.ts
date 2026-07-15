/**
 * batch-triage.ts — pure review-state classification for batch previews.
 *
 * This module deliberately does not import Obsidian so its safety-critical
 * ordering and classification rules remain unit-testable.
 */
export type BatchItemStatus = 'rename' | 'conflict' | 'error' | 'skipped';

export interface BatchTriageItem {
    status: BatchItemStatus;
}

export interface BatchOutcomeLike {
    skipped: string;
    newName: string | null;
    error?: unknown;
}

export interface BatchItemGroup<T extends BatchTriageItem> {
    status: BatchItemStatus;
    items: T[];
}

const REVIEW_ORDER: readonly BatchItemStatus[] = ['rename', 'conflict', 'error', 'skipped'];

/** Classify a dry-run result before the modal presents it for review. */
export function classifyBatchItem(
    outcome: BatchOutcomeLike,
    duplicateTarget: boolean,
): BatchItemStatus {
    if (outcome.error) return 'error';
    if (duplicateTarget || outcome.skipped === 'collision') return 'conflict';
    return outcome.skipped === 'none' && outcome.newName !== null && outcome.newName.length > 0
        ? 'rename'
        : 'skipped';
}

/** Return only non-empty groups, ordered by what needs the user's attention first. */
export function groupBatchItems<T extends BatchTriageItem>(items: T[]): BatchItemGroup<T>[] {
    return REVIEW_ORDER.flatMap((status) => {
        const groupItems = items.filter((item) => item.status === status);
        return groupItems.length > 0 ? [{ status, items: groupItems }] : [];
    });
}
