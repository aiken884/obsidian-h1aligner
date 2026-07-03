/**
 * scope.ts — pure scope decision: ignore folders, include folders
 * (whitelist), and basename exclude patterns (no obsidian import).
 *
 * Rules, in order:
 *   1. ignoreFolders prefix match  → out of scope (ignore beats include)
 *   2. includeFolders non-empty    → path must live under one of them
 *   3. excludePatterns             → regex tested against the BASENAME;
 *                                    invalid patterns are silently skipped
 */
import { isIgnoredPath } from './ignore';

export interface ScopeSettings {
    ignoreFolders: string[];
    includeFolders: string[];
    excludePatterns: string[];
}

function underFolder(path: string, folder: string): boolean {
    const prefix = folder.replace(/\/+$/, '');
    if (!prefix) return false;
    return path === prefix || path.startsWith(prefix + '/');
}

export function isInScope(path: string, basename: string, scope: ScopeSettings): boolean {
    if (isIgnoredPath(path, scope.ignoreFolders)) return false;

    // '/' (or '\') means the vault ROOT layer — files with no folder.
    // Blank entries are ignored so they never switch on whitelist mode with
    // zero matchable folders (which would silently lock out the vault).
    let hasValidInclude = false;
    let includeMatched = false;
    for (const raw of scope.includeFolders) {
        if (!raw.trim()) continue;
        const norm = raw.replace(/\\/g, '/').replace(/\/+$/, '');
        hasValidInclude = true;
        if (norm === '') {
            if (!path.includes('/')) includeMatched = true;
        } else if (underFolder(path, norm)) {
            includeMatched = true;
        }
    }
    if (hasValidInclude && !includeMatched) return false;

    for (const pattern of scope.excludePatterns) {
        if (!pattern) continue;
        try {
            if (new RegExp(pattern).test(basename)) return false;
        } catch {
            // Invalid user regex — the pattern fails OPEN (no protection),
            // so surface it once instead of silently swallowing it.
            if (!warnedPatterns.has(pattern)) {
                warnedPatterns.add(pattern);
                console.warn(`[H1Aligner] invalid exclude pattern ignored: ${pattern}`);
            }
        }
    }
    return true;
}

const warnedPatterns = new Set<string>();
