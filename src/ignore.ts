/**
 * ignore.ts — pure ignoreFolders prefix matcher (no obsidian import,
 * vitest-loadable). Entries are expected to be normalized vault paths;
 * main.ts runs user input through obsidian's normalizePath before calling.
 *
 * Q4 semantics: each entry is a folder prefix anchored at the vault root;
 * a path is ignored when it equals the entry or lives underneath it.
 */
export function isIgnoredPath(path: string, ignoreFolders: string[]): boolean {
    for (const raw of ignoreFolders) {
        if (!raw) continue;
        const prefix = raw.replace(/\/+$/, '');
        if (!prefix) continue;
        if (path === prefix) return true;
        if (path.startsWith(prefix + '/')) return true;
    }
    return false;
}
