/**
 * Runtime stand-in for the `obsidian` package (it ships type declarations
 * only). vitest.config.ts aliases `obsidian` here so pure modules that call
 * `parseYaml` can run under Node. Handles the flat `key: value` frontmatter
 * the tests use; values try JSON first (quoted strings, arrays, numbers).
 */
export function parseYaml(text: string): unknown {
    const out: Record<string, unknown> = {};
    for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^([\w-]+):\s*(.*)$/);
        if (!m) continue;
        const raw = m[2].trim();
        if (raw === '') {
            out[m[1]] = null;
            continue;
        }
        try {
            out[m[1]] = JSON.parse(raw);
        } catch {
            out[m[1]] = raw;
        }
    }
    return out;
}
