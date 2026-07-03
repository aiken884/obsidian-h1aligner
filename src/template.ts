/**
 * template.ts — pure filename-template renderer (no obsidian import).
 *
 * Tokens:
 *   {{h1}}           — the extracted first H1 (required; templates without it
 *                      fall back to plain '{{h1}}')
 *   {{date}}         — file CREATION time as YYYY-MM-DD
 *   {{date:FORMAT}}  — custom format; supports YYYY MM DD HH mm ss
 *
 * Date tokens use ctime (not "today") so repeated runs are idempotent:
 * the rendered name never drifts, and the L3 same-name guard holds.
 */
export interface TemplateContext {
    h1: string;
    /** File creation time (ms epoch) — stable, so date tokens are idempotent. */
    ctime: number;
}

const DATE_TOKEN = /\{\{date(?::([^}]*))?\}\}/g;
const H1_TOKEN = /\{\{h1\}\}/g;

function formatDate(ts: number, fmt: string): string {
    const d = new Date(ts);
    const pad = (n: number, w = 2) => String(n).padStart(w, '0');
    return fmt
        .replace(/YYYY/g, String(d.getFullYear()).padStart(4, '0'))
        .replace(/MM/g, pad(d.getMonth() + 1))
        .replace(/DD/g, pad(d.getDate()))
        .replace(/HH/g, pad(d.getHours()))
        .replace(/mm/g, pad(d.getMinutes()))
        .replace(/ss/g, pad(d.getSeconds()));
}

export function renderNameTemplate(template: string, ctx: TemplateContext): string {
    const t = typeof template === 'string' ? template : '';
    // Dates first, then h1 — so tokens inside the H1 text stay literal.
    const withDates = t.replace(DATE_TOKEN, (_m, fmt: string | undefined) =>
        formatDate(ctx.ctime, fmt || 'YYYY-MM-DD'),
    );
    // The {{h1}} guard runs AFTER the date pass: a malformed template like
    // '{{date:{{h1}} }}' contains the token textually but loses it during
    // date substitution — rendering a CONSTANT name for every note. Any
    // template that no longer carries the H1 falls back to the H1 alone.
    if (!withDates.includes('{{h1}}')) return ctx.h1;
    return withDates.replace(H1_TOKEN, () => ctx.h1);
}
