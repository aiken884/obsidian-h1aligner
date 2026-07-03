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

    // Entries that normalise to nothing (a stray '\' or '/') are ignored —
    // they must never switch on whitelist mode with zero matchable folders,
    // which would silently lock out the entire vault.
    const includes = scope.includeFolders.filter((f) => f.replace(/[\\/]+/g, '').length > 0);
    if (includes.length > 0) {
        if (!includes.some((f) => underFolder(path, f))) return false;
    }

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
