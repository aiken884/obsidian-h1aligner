import { Plugin } from 'obsidian';

/**
 * H1Aligner — Obsidian plugin entry point.
 *
 * Phase 1 MVP responsibilities (per [[群兆資訊 H1Aligner 專案設計]]):
 *   1. Subscribe to workspace `file-open` events via `registerEvent`
 *      (per PPLX Q2 — required to avoid memory leaks on unload).
 *   2. Filter eligible files (`.md` extension + not in ignoreFolders).
 *   3. Delegate rename to RenameService (E2 module, wired in Step 2).
 *   4. Expose manual command "Rename active file from first H1" (E3).
 *
 * Skeleton only — full lifecycle and event wiring lands in E2/E3.
 */
export default class H1AlignerPlugin extends Plugin {
    async onload(): Promise<void> {
        console.log('[H1Aligner] loaded (skeleton)');
    }

    async onunload(): Promise<void> {
        console.log('[H1Aligner] unloaded');
    }
}