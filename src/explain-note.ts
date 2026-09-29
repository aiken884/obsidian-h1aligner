/**
 * explain-note.ts — pure copy for "Explain this note".
 *
 * Inputs are the invalid-exclude-draft pause, a scope-out reason (same policy
 * as isInScope) and an optional dry-run outcome. No Obsidian import; never
 * implies a write.
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
    kind: 'paused' | 'out-of-scope' | 'would-rename' | 'skip' | 'error';
    text: string;
}

export function explainNote(input: {
    path: string;
    basename: string;
    scopeOut: ScopeOutReason | null;
    dryRun: ExplainDryRun | null;
    /** Invalid exclude-pattern draft: every rename path is paused (checked first, like triggerRename). */
    paused?: boolean;
}): ExplainResult {
    const { path, scopeOut, dryRun } = input;
    if (input.paused) {
        return { kind: 'paused', text: t('explain.paused', { path }) };
    }
    if (scopeOut === 'ignored') {
        return { kind: 'out-of-scope', text: t('explain.ignored', { path }) };
    }
    if (scopeOut === 'not-included' || scopeOut === 'excluded-pattern') {
        // The dry run never consults scope, so it is exactly what the manual
        // command would do: if it would skip, "manual can still rename" is false.
        // A missing or failed dry run keeps the plain scope text (still true).
        const manualSkips = dryRun && !dryRun.error && dryRun.skipped !== 'none';
        const key = scopeOut === 'not-included'
            ? (manualSkips ? 'explain.notIncludedManualSkip' : 'explain.notIncluded')
            : (manualSkips ? 'explain.excludedPatternManualSkip' : 'explain.excludedPattern');
        const reason = manualSkips ? describeSkipReason(dryRun.skipped) : '';
        return { kind: 'out-of-scope', text: t(key, { path, reason }) };
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
