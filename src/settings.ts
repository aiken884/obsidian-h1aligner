/**
 * settings.ts — H1Aligner settings schema + defaults.
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