/**
 * explain-note.ts — pure copy for "Explain this note".
 *
 * Inputs are a scope-out reason (same policy as isInScope) and an optional
 * dry-run outcome. No Obsidian import; never implies a write.
 */
import type { ScopeOutReason } from './scope';
import type { RenameSkipReason } from './rename-service';
import { describeSkipReason } from './skip-reason';
import { t } from './i18n';

export interface ExplainDryRun {
    skipped: RenameSkipReason;
    newName: string | null;
    error?: { message?: string } | null;
}

export interface ExplainResult {
    kind: 'out-of-scope' | 'would-rename' | 'skip' | 'error';
    text: string;
}

export function explainNote(input: {
    path: string;
    basename: string;
    scopeOut: ScopeOutReason | null;
    dryRun: ExplainDryRun | null;
}): ExplainResult {
    const { path, scopeOut, dryRun } = input;
    if (scopeOut === 'ignored') {
        return { kind: 'out-of-scope', text: t('explain.ignored', { path }) };
    }
    if (scopeOut === 'not-included') {
        return { kind: 'out-of-scope', text: t('explain.notIncluded', { path }) };
    }
    if (scopeOut === 'excluded-pattern') {
        return { kind: 'out-of-scope', text: t('explain.excludedPattern', { path }) };
    }
    if (!dryRun) {
        return {
            kind: 'error',
            text: t('explain.error', { path, message: t('batch.reason.unknown') }),
        };
    }
    if (dryRun.error) {
        return {
            kind: 'error',
            text: t('explain.error', {
                path,
                message: dryRun.error.message || t('batch.reason.unknown'),
            }),
        };
    }
    if (dryRun.skipped !== 'none') {
        return {
            kind: 'skip',
            text: t('explain.skip', { path, reason: describeSkipReason(dryRun.skipped) }),
        };
    }
    const name = dryRun.newName && dryRun.newName.length > 0 ? dryRun.newName : input.basename;
    return {
        kind: 'would-rename',
        text: t('explain.wouldRename', { path, name }),
    };
}
