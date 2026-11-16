import type { App, MarkdownView, TFile } from 'obsidian';

/**
 * Current text of `file` in an open editor, or undefined when no markdown
 * editor shows it. The editor buffer is ahead of both the disk and
 * metadataCache until Obsidian's autosave runs (~2 s after the last edit), so
 * it is the only source that is current when the edit-trigger debounce fires.
 * Duck-typed on `view.file` / `view.editor` so it needs no runtime import.
 */
export function getEditorContent(app: App, file: TFile): string | undefined {
    for (const leaf of app.workspace.getLeavesOfType('markdown')) {
        const view = leaf.view as Partial<MarkdownView>;
        if (view.file?.path === file.path && typeof view.editor?.getValue === 'function') {
            return view.editor.getValue();
        }
    }
    return undefined;
}
