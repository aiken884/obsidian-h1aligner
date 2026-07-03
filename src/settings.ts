/**
 * settings.ts — H1Aligner settings schema + defaults + validation.
 *
 * IMPORTANT: This module deliberately has NO runtime dependency on 'obsidian'.
 * That keeps it unit-testable from vitest without needing to stub the Obsidian
 * package. The SettingTab UI class lives in `settings-tab.ts`.
 *
 * Phase 1 MVP defaults (all per Aiken 拍板, see [[H1Aligner 拍板議題展開_2026-05-29]]):
 *   - renameOnFileOpen              = true  (core feature switch)
 *   - showNoticeOnRename            = false (Q2 — quiet by default)
 *   - trimWhitespace                = true  (Q3.1)
 *   - replaceIllegalCharacters      = true  (Q3.2)
 *   - illegalReplacementChar        = ' '   (Q3.3 — 空白)
 *   - maxFilenameLength             = 150   (Q3.4)
 *   - ignoreFolders                 = ['.obsidian', '.trash'] (Q4 — prefix match)
 *   - skipIfFrontmatterLock         = false (Q5 — schema kept, logic NOT implemented in Phase 1)
 */
import { cleanReplacementChar } from './filename';

export interface H1AlignerSettings {
    renameOnFileOpen: boolean;
    showNoticeOnRename: boolean;
    trimWhitespace: boolean;
    replaceIllegalCharacters: boolean;
    illegalReplacementChar: string;
    maxFilenameLength: number;
    ignoreFolders: string[];
    /**
     * Phase 1: schema kept, logic deferred to Phase 2 (per Q5).
     */
    skipIfFrontmatterLock: boolean;
}

export const DEFAULT_SETTINGS: H1AlignerSettings = {
    renameOnFileOpen: true,
    showNoticeOnRename: false,
    trimWhitespace: true,
    replaceIllegalCharacters: true,
    illegalReplacementChar: ' ',
    maxFilenameLength: 150,
    ignoreFolders: ['.obsidian', '.trash'],
    skipIfFrontmatterLock: false,
};

/** Filename length ceiling: one UTF-8 byte per char is already NAME_MAX. */
const MAX_FILENAME_LENGTH_CEILING = 255;

/**
 * Validate whatever came out of data.json (may be corrupt, hand-edited, or
 * from a future/older plugin version) into a well-typed settings object.
 * Wrong-typed fields fall back to their defaults.
 */
export function normalizeSettings(raw: unknown): H1AlignerSettings {
    const out: H1AlignerSettings = {
        ...DEFAULT_SETTINGS,
        ignoreFolders: [...DEFAULT_SETTINGS.ignoreFolders],
    };
    if (typeof raw !== 'object' || raw === null) return out;
    const r = raw as Record<string, unknown>;

    if (typeof r.renameOnFileOpen === 'boolean') out.renameOnFileOpen = r.renameOnFileOpen;
    if (typeof r.showNoticeOnRename === 'boolean') out.showNoticeOnRename = r.showNoticeOnRename;
    if (typeof r.trimWhitespace === 'boolean') out.trimWhitespace = r.trimWhitespace;
    if (typeof r.replaceIllegalCharacters === 'boolean') {
        out.replaceIllegalCharacters = r.replaceIllegalCharacters;
    }
    if (typeof r.skipIfFrontmatterLock === 'boolean') {
        out.skipIfFrontmatterLock = r.skipIfFrontmatterLock;
    }
    if (typeof r.illegalReplacementChar === 'string') {
        out.illegalReplacementChar = cleanReplacementChar(r.illegalReplacementChar);
    }
    if (
        typeof r.maxFilenameLength === 'number' &&
        Number.isFinite(r.maxFilenameLength) &&
        r.maxFilenameLength >= 1
    ) {
        out.maxFilenameLength = Math.min(
            Math.floor(r.maxFilenameLength),
            MAX_FILENAME_LENGTH_CEILING,
        );
    }
    if (Array.isArray(r.ignoreFolders)) {
        out.ignoreFolders = r.ignoreFolders
            .filter((x): x is string => typeof x === 'string')
            .map((x) => x.trim())
            .filter((x) => x.length > 0);
    }
    return out;
}

/** Parse the comma-separated ignore-folders text field. */
export function parseIgnoreFolders(input: string): string[] {
    return input
        .split(',')
        .map((s) => s.trim().replace(/\/+$/, ''))
        .filter((s) => s.length > 0);
}

/**
 * Parse the max-filename-length text field; null when not a usable value.
 * Oversized values clamp to 255 — the same policy normalizeSettings applies
 * to hand-edited data.json.
 */
export function parseMaxFilenameLength(input: string): number | null {
    const n = Number(input.trim());
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.min(Math.floor(n), MAX_FILENAME_LENGTH_CEILING);
}
