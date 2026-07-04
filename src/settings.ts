/**
 * settings.ts — H1Aligner settings schema + defaults + validation.
 *
 * IMPORTANT: This module deliberately has NO runtime dependency on 'obsidian'.
 * That keeps it unit-testable from vitest without needing to stub the Obsidian
 * package. The SettingTab UI class lives in `settings-tab.ts`.
 *
 * Schema v2 (0.4.0). v1 keys are migrated on load:
 *   renameOnFileOpen: boolean  → renameTrigger: 'file-open' | 'manual'
 *   showNoticeOnRename: boolean → noticeLevel: 'all' | 'off'
 *   skipIfFrontmatterLock — v1 stored `false` but the feature did not exist,
 *   so v1 data adopts the new default (true).
 */
import { cleanReplacementChar } from './filename';

export type RenameTrigger = 'file-open' | 'edit' | 'both' | 'leave' | 'manual';
export type NoticeLevel = 'off' | 'errors' | 'all';
export type CollisionStrategy = 'skip' | 'number';

export interface H1AlignerSettings {
    // Trigger
    renameTrigger: RenameTrigger;
    /** Debounce for file-open bursts (ms). */
    fileOpenDebounceMs: number;
    /** Debounce after edits before renaming (ms) — long, to avoid renaming mid-typing. */
    editDebounceMs: number;
    // Scope
    ignoreFolders: string[];
    /** Whitelist mode: non-empty → only these folders are processed. */
    includeFolders: string[];
    /** Regexes tested against the basename; matches are skipped. */
    excludePatterns: string[];
    /** Honour `h1aligner-lock: true` in frontmatter. */
    skipIfFrontmatterLock: boolean;
    // Naming
    nameTemplate: string;
    collisionStrategy: CollisionStrategy;
    allowCaseOnlyRename: boolean;
    trimWhitespace: boolean;
    replaceIllegalCharacters: boolean;
    illegalReplacementChar: string;
    maxFilenameLength: number;
    // Notifications
    noticeLevel: NoticeLevel;
    /** Append the pre-rename filename to frontmatter aliases. */
    preserveOldNameAsAlias: boolean;
    /** First-run onboarding modal already shown. */
    onboardingShown: boolean;
}

export const DEFAULT_SETTINGS: H1AlignerSettings = {
    renameTrigger: 'file-open',
    fileOpenDebounceMs: 100,
    editDebounceMs: 2000,
    // The config folder (Vault#configDir) is ignored automatically in main.ts.
    ignoreFolders: ['.trash'],
    includeFolders: [],
    // Daily notes protection: date-named files are never renamed by default.
    excludePatterns: ['^\\d{4}-\\d{2}-\\d{2}$'],
    skipIfFrontmatterLock: true,
    nameTemplate: '{{h1}}',
    collisionStrategy: 'skip',
    allowCaseOnlyRename: true,
    trimWhitespace: true,
    replaceIllegalCharacters: true,
    illegalReplacementChar: ' ',
    maxFilenameLength: 150,
    noticeLevel: 'off',
    preserveOldNameAsAlias: false,
    onboardingShown: false,
};

/** Filename length ceiling: one UTF-8 byte per char is already NAME_MAX. */
const MAX_FILENAME_LENGTH_CEILING = 255;
const MAX_DEBOUNCE_MS = 60000;

const TRIGGERS: readonly RenameTrigger[] = ['file-open', 'edit', 'both', 'leave', 'manual'];
const LEVELS: readonly NoticeLevel[] = ['off', 'errors', 'all'];
const COLLISIONS: readonly CollisionStrategy[] = ['skip', 'number'];

function cleanStringArray(v: unknown): string[] | null {
    if (!Array.isArray(v)) return null;
    return v
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter((x) => x.length > 0);
}

function clampMs(v: unknown, fallback: number): number {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return fallback;
    return Math.min(Math.floor(v), MAX_DEBOUNCE_MS);
}

/**
 * Validate whatever came out of data.json (may be corrupt, hand-edited, from
 * a v1 install, or from a future version) into a well-typed settings object.
 * Wrong-typed fields fall back to their defaults.
 */
export function normalizeSettings(raw: unknown): H1AlignerSettings {
    const out: H1AlignerSettings = {
        ...DEFAULT_SETTINGS,
        ignoreFolders: [...DEFAULT_SETTINGS.ignoreFolders],
        includeFolders: [...DEFAULT_SETTINGS.includeFolders],
        excludePatterns: [...DEFAULT_SETTINGS.excludePatterns],
    };
    if (typeof raw !== 'object' || raw === null) return out;
    const r = raw as Record<string, unknown>;
    const isV1 = typeof r.renameOnFileOpen === 'boolean' && r.renameTrigger === undefined;

    // Trigger
    if (TRIGGERS.includes(r.renameTrigger as RenameTrigger)) {
        out.renameTrigger = r.renameTrigger as RenameTrigger;
    } else if (typeof r.renameOnFileOpen === 'boolean') {
        out.renameTrigger = r.renameOnFileOpen ? 'file-open' : 'manual';
    }
    out.fileOpenDebounceMs = clampMs(r.fileOpenDebounceMs, DEFAULT_SETTINGS.fileOpenDebounceMs);
    out.editDebounceMs = clampMs(r.editDebounceMs, DEFAULT_SETTINGS.editDebounceMs);

    // Scope
    const ignore = cleanStringArray(r.ignoreFolders);
    if (ignore !== null) out.ignoreFolders = ignore;
    const include = cleanStringArray(r.includeFolders);
    if (include !== null) out.includeFolders = include;
    // Patterns are kept VERBATIM (no trim): '^ ' means "starts with a
    // space" — trimming it to '^' would exclude every file in the vault.
    if (Array.isArray(r.excludePatterns)) {
        out.excludePatterns = r.excludePatterns
            .filter((x): x is string => typeof x === 'string')
            .filter((x) => x.trim().length > 0);
    }
    if (typeof r.skipIfFrontmatterLock === 'boolean' && !isV1) {
        out.skipIfFrontmatterLock = r.skipIfFrontmatterLock;
    }

    // Naming
    if (typeof r.nameTemplate === 'string' && r.nameTemplate.trim()) {
        out.nameTemplate = r.nameTemplate;
    }
    if (COLLISIONS.includes(r.collisionStrategy as CollisionStrategy)) {
        out.collisionStrategy = r.collisionStrategy as CollisionStrategy;
    }
    if (typeof r.allowCaseOnlyRename === 'boolean') out.allowCaseOnlyRename = r.allowCaseOnlyRename;
    if (typeof r.trimWhitespace === 'boolean') out.trimWhitespace = r.trimWhitespace;
    if (typeof r.replaceIllegalCharacters === 'boolean') {
        out.replaceIllegalCharacters = r.replaceIllegalCharacters;
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

    if (typeof r.preserveOldNameAsAlias === 'boolean') {
        out.preserveOldNameAsAlias = r.preserveOldNameAsAlias;
    }
    if (typeof r.onboardingShown === 'boolean') out.onboardingShown = r.onboardingShown;

    // Notifications
    if (LEVELS.includes(r.noticeLevel as NoticeLevel)) {
        out.noticeLevel = r.noticeLevel as NoticeLevel;
    } else if (typeof r.showNoticeOnRename === 'boolean') {
        out.noticeLevel = r.showNoticeOnRename ? 'all' : 'off';
    }

    return out;
}

/**
 * Parse the comma-separated folders text fields (ignore / include).
 * '/' (or '\') survives as the vault-root marker.
 */
export function parseIgnoreFolders(input: string): string[] {
    return input
        .split(',')
        .map((s) => {
            const trimmed = s.trim();
            if (trimmed === '/' || trimmed === '\\') return '/';
            return trimmed.replace(/\/+$/, '');
        })
        .filter((s) => s.length > 0);
}

/**
 * Parse the newline-separated exclude-patterns textarea. Lines are kept
 * verbatim (regex whitespace is significant); whitespace-only lines drop.
 */
export function parseExcludePatterns(input: string): string[] {
    return input
        .split(/\r?\n/)
        .filter((s) => s.trim().length > 0);
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
