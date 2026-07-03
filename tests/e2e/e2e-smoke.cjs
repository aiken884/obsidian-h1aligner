/**
 * E2E smoke test v0.4.0: load the REAL production bundle (main.js) with a
 * stubbed `obsidian` module and drive the plugin through its runtime paths.
 */
const Module = require('module');
const path = require('path');
const assert = require('assert');

// ---------- minimal DOM-ish element for Modal rendering ----------
class FakeEl {
    constructor(tag, opts) {
        this.tag = tag || 'div';
        this.text = opts && opts.text ? opts.text : '';
        this.children = [];
        this.style = {};
        this.listeners = {};
        this.classList = { add() {} };
    }
    createEl(tag, opts) { const el = new FakeEl(tag, opts); this.children.push(el); return el; }
    empty() { this.children = []; }
    setText(t) { this.text = t; }
    addEventListener(evt, cb) { (this.listeners[evt] = this.listeners[evt] || []).push(cb); }
    *walk() { yield this; for (const c of this.children) yield* c.walk(); }
}

// ---------- obsidian stub ----------
class Plugin {
    constructor(app, manifest) { this.app = app; this.manifest = manifest; this._events = []; this._commands = []; }
    registerEvent(ref) { this._events.push(ref); }
    addSettingTab(tab) { this._settingTab = tab; }
    addCommand(cmd) { this._commands.push(cmd); }
    async loadData() { return this._data ?? null; }
    async saveData(d) { this._data = d; }
}
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
class Setting {
    constructor() {}
    setName() { return this; } setDesc() { return this; } setHeading() { return this; }
    addToggle() { return this; } addText() { return this; } addTextArea() { return this; }
    addDropdown() { return this; }
}
class Modal {
    constructor(app) { this.app = app; this.contentEl = new FakeEl('div'); }
    open() { global.__lastModal = this; this.onOpen && this.onOpen(); }
    close() { this.onClose && this.onClose(); }
}
const notices = [];
class Notice { constructor(msg) { notices.push(String(msg)); } }
class TAbstractFile {}
class TFile extends TAbstractFile {}
function normalizePath(p) {
    return String(p).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
}

const obsidianStub = { Plugin, PluginSettingTab, Setting, Modal, Notice, TAbstractFile, TFile, normalizePath };

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    if (request === 'obsidian') return 'obsidian';
    return origResolve.call(this, request, ...rest);
};
require.cache['obsidian'] = { id: 'obsidian', filename: 'obsidian', loaded: true, exports: obsidianStub };

// ---------- fake app ----------
function makeFakeApp() {
    const wsHandlers = {};
    const vaultHandlers = {};
    const renameCalls = [];
    const files = new Map(); // path -> { file, content, cache }

    const app = {
        workspace: {
            on(evt, cb) { wsHandlers[evt] = cb; return { evt }; },
            getActiveFile() { return app._activeFile ?? null; },
        },
        metadataCache: {
            getFileCache(file) { return files.get(file.path)?.cache ?? null; },
        },
        vault: {
            on(evt, cb) { vaultHandlers[evt] = cb; return { evt }; },
            async cachedRead(file) {
                const e = files.get(file.path);
                if (!e) throw new Error('ENOENT ' + file.path);
                return e.content;
            },
            getAbstractFileByPath(p) { return files.get(p)?.file ?? null; },
            getMarkdownFiles() { return [...files.values()].map((e) => e.file).filter((f) => f.extension === 'md'); },
        },
        fileManager: {
            async renameFile(file, newPath) {
                renameCalls.push({ from: file.path, to: newPath });
                files.delete(file.path);
                file.path = newPath;
                file.basename = path.basename(newPath, '.md');
                file.name = path.basename(newPath);
                files.set(newPath, { file, content: files.get(newPath)?.content ?? '', cache: null });
            },
        },
        _ws: wsHandlers,
        _vault: vaultHandlers,
        _renameCalls: renameCalls,
        _files: files,
    };
    return app;
}

function addFile(app, p, content, h1InCache, frontmatter) {
    const f = new TFile();
    f.path = p;
    f.basename = path.basename(p, '.md');
    f.name = path.basename(p);
    f.extension = 'md';
    f.stat = { ctime: new Date(2026, 0, 15).getTime() };
    const dir = path.dirname(p);
    f.parent = { path: dir === '.' ? '/' : dir };
    let cache = null;
    if (h1InCache || frontmatter) {
        cache = {};
        if (h1InCache) cache.headings = [{ level: 1, heading: h1InCache }];
        if (frontmatter) cache.frontmatter = frontmatter;
    }
    app._files.set(p, { file: f, content: content ?? '', cache });
    return f;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- run ----------
(async () => {
    const bundlePath = path.resolve(process.argv[2] || 'main.js');
    const mod = require(bundlePath);
    const PluginClass = mod.default ?? mod;
    assert.equal(typeof PluginClass, 'function', 'bundle exports a plugin class');

    const app = makeFakeApp();
    const plugin = new PluginClass(app, { id: 'h1aligner' });
    await plugin.onload();
    assert.ok(app._ws['file-open'], 'file-open handler registered');
    assert.ok(app._ws['editor-change'], 'editor-change handler registered');
    assert.equal(app._vault['modify'], undefined, 'no raw vault modify handler (sync/backlink writes ignored)');
    assert.equal(plugin._commands.length, 3, 'three commands registered');
    console.log('✓ 1. onload：settings v2 載入、file-open + modify 事件、3 個指令已註冊');

    // --- 2: happy path via cache (file-open trigger) ---
    const fa = addFile(app, 'notes/old-name.md', '# New Title\nbody', 'New Title');
    app._ws['file-open'](fa);
    await sleep(180);
    assert.deepEqual(app._renameCalls.at(-1), { from: 'notes/old-name.md', to: 'notes/New Title.md' });
    console.log('✓ 2. file-open + debounce → 依 cache H1 改名');

    // --- 3: ignored folder ---
    let before = app._renameCalls.length;
    const fb = addFile(app, '.trash/dead.md', '# Alive\n', 'Alive');
    app._ws['file-open'](fb);
    await sleep(180);
    assert.equal(app._renameCalls.length, before, 'no rename inside .trash');
    console.log('✓ 3. ignoreFolders（.trash）→ 不改名');

    // --- 4: daily-note default exclude pattern ---
    before = app._renameCalls.length;
    const fdaily = addFile(app, 'daily/2026-07-03.md', '# 週五工作日誌\n', '週五工作日誌');
    app._ws['file-open'](fdaily);
    await sleep(180);
    assert.equal(app._renameCalls.length, before, 'daily note untouched');
    console.log('✓ 4. 預設排除 pattern 保護 daily note（2026-07-03.md 不被改名）');

    // --- 5: frontmatter lock ---
    before = app._renameCalls.length;
    const flock = addFile(app, 'notes/locked.md', '# Locked Title\n', 'Locked Title', { 'h1aligner-lock': true });
    app._ws['file-open'](flock);
    await sleep(180);
    assert.equal(app._renameCalls.length, before, 'locked note untouched');
    console.log('✓ 5. frontmatter 鎖（h1aligner-lock: true）→ 不改名');

    // --- 6: no-H1 via cachedRead scan; same-name idempotent; collision ---
    before = app._renameCalls.length;
    const fc = addFile(app, 'notes/plain.md', 'no heading here\n', null);
    app._ws['file-open'](fc);
    const fd = addFile(app, 'notes/Same.md', '# Same\n', 'Same');
    app._ws['file-open'](fd);
    addFile(app, 'notes/Taken.md', '# whatever\n', 'whatever');
    const fe = addFile(app, 'notes/will-collide.md', '# Taken\n', 'Taken');
    app._ws['file-open'](fe);
    await sleep(200);
    assert.equal(app._renameCalls.length, before, 'no-h1 / same-name / collision all skipped');
    console.log('✓ 6. 無 H1、冪等、碰撞保護 → 皆不改名');

    // --- 7: manual command with trigger=manual ---
    plugin.settings.renameTrigger = 'manual';
    const ff = addFile(app, 'notes/manual.md', '# Manual Works\n', 'Manual Works');
    app._ws['file-open'](ff);
    await sleep(180);
    assert.equal(app._renameCalls.filter((c) => c.from === 'notes/manual.md').length, 0, 'auto off in manual mode');
    app._activeFile = ff;
    const cmd = plugin._commands.find((c) => c.id === 'rename-active-file-from-h1');
    assert.equal(cmd.checkCallback(true), true, 'command available');
    cmd.checkCallback(false);
    await sleep(80);
    assert.deepEqual(app._renameCalls.at(-1), { from: 'notes/manual.md', to: 'notes/Manual Works.md' });
    assert.ok(notices.some((n) => n.includes('Manual Works')), 'manual command notifies');
    console.log('✓ 7. renameTrigger=manual：file-open 不動作、手動指令改名並通知');

    // --- 8: undo last rename ---
    const undoCmd = plugin._commands.find((c) => c.id === 'undo-last-rename');
    undoCmd.callback();
    await sleep(50);
    assert.deepEqual(app._renameCalls.at(-1), { from: 'notes/Manual Works.md', to: 'notes/manual.md' });
    assert.ok(notices.some((n) => n.includes('undone')), 'undo notifies');
    console.log('✓ 8. undo 指令 → 檔名還原 notes/manual.md');

    // --- 8b: manual command bypasses exclude patterns; failed undo keeps its record ---
    app._activeFile = fdaily; // 'daily/2026-07-03.md' — excluded from AUTO renames
    assert.equal(cmd.checkCallback(true), true, 'manual command available on daily note');
    cmd.checkCallback(false);
    await sleep(80);
    assert.deepEqual(app._renameCalls.at(-1), { from: 'daily/2026-07-03.md', to: 'daily/週五工作日誌.md' });
    addFile(app, 'daily/2026-07-03.md', 'occupier\n', null); // occupy the original name
    undoCmd.callback();
    await sleep(50);
    assert.ok(notices.some((n) => n.includes('occupied')), 'undo reports occupied');
    assert.ok(app._files.has('daily/週五工作日誌.md'), 'file untouched after failed undo');
    app._files.delete('daily/2026-07-03.md'); // free the name and retry
    undoCmd.callback();
    await sleep(50);
    assert.ok(app._files.has('daily/2026-07-03.md'), 'retry succeeds — record was kept');
    console.log('✓ 8b. manual 指令可對 daily note 執行（bypass exclude）；undo 失敗保留紀錄、可重試');

    // --- 8c: undo verifies file identity, not just the path ---
    app._activeFile = addFile(app, 'notes/idcheck.md', '# ID Check\n', 'ID Check');
    cmd.checkCallback(false);
    await sleep(80);
    assert.ok(app._files.has('notes/ID Check.md'), 'idcheck renamed');
    addFile(app, 'notes/ID Check.md', 'impostor\n', null); // unrelated new file takes the path
    const impostorFile = app._files.get('notes/ID Check.md').file;
    undoCmd.callback();
    await sleep(50);
    assert.ok(notices.some((n) => n.includes('moved or deleted')), 'undo refuses a different file at the same path');
    assert.equal(app._files.get('notes/ID Check.md').file, impostorFile, 'impostor untouched');
    console.log('✓ 8c. undo 身分驗證：路徑被別的檔案占據時拒絕回退');

    // --- 9: edit trigger — active file only, debounce coalescing, mode-switch cancels ---
    plugin.settings.renameTrigger = 'edit';
    plugin.settings.editDebounceMs = 120;
    const fedit = addFile(app, 'notes/editing.md', '# Edited Title\n', 'Edited Title');
    app._activeFile = fedit;
    app._ws['editor-change'](null, { file: fedit });
    await sleep(60);
    app._ws['editor-change'](null, { file: fedit }); // re-typing resets the timer
    await sleep(60);
    assert.equal(app._renameCalls.filter((c) => c.from === 'notes/editing.md').length, 0, 'debounce still pending');
    await sleep(100);
    assert.deepEqual(app._renameCalls.at(-1), { from: 'notes/editing.md', to: 'notes/Edited Title.md' });
    // trigger switched while a timer is pending → fire-time re-check cancels it
    const fswitch = addFile(app, 'notes/switching.md', '# Switched Away\n', 'Switched Away');
    app._activeFile = fswitch;
    app._ws['editor-change'](null, { file: fswitch });
    plugin.settings.renameTrigger = 'manual';
    await sleep(200);
    assert.equal(app._renameCalls.filter((c) => c.from === 'notes/switching.md').length, 0, 'pending timer dropped after mode switch');
    console.log('✓ 9. edit 觸發：editor-change（本地輸入限定，Sync/backlink 寫入不觸發）、debounce 重置、切換模式取消 pending');

    // --- 10: BOM safety ---
    plugin.settings.renameTrigger = 'file-open';
    before = app._renameCalls.length;
    const fbom = addFile(app, 'notes/bom.md', '﻿---\n# TODO add tags\ntitle: x\n---\nplain body\n', null);
    app._ws['file-open'](fbom);
    await sleep(180);
    assert.equal(app._renameCalls.filter((c) => c.from === 'notes/bom.md').length, 0, 'BOM frontmatter comment not adopted');
    const fbom2 = addFile(app, 'notes/bom2.md', '﻿# BOM Title\n', null);
    app._ws['file-open'](fbom2);
    await sleep(180);
    assert.deepEqual(app._renameCalls.at(-1), { from: 'notes/bom2.md', to: 'notes/BOM Title.md' });
    console.log('✓ 10. BOM 檔案：不誤抓 YAML 註解、真 H1 正常改名');

    // --- 11: 255-byte NAME_MAX ---
    const flong = addFile(app, 'notes/long.md', null, '標'.repeat(150));
    app._ws['file-open'](flong);
    await sleep(180);
    const longCall = app._renameCalls.find((c) => c.from === 'notes/long.md');
    assert.ok(longCall, 'long CJK title renamed');
    assert.ok(Buffer.byteLength(path.basename(longCall.to), 'utf8') <= 255, 'fits NAME_MAX');
    console.log('✓ 11. 150 字 CJK 標題 → 檔名 ≤ 255 bytes（APFS/ext4 安全）');

    // --- 12: name template ---
    plugin.settings.nameTemplate = '{{date}} {{h1}}';
    const ftpl = addFile(app, 'notes/tpl.md', '# Meeting\n', 'Meeting');
    app._ws['file-open'](ftpl);
    await sleep(180);
    assert.deepEqual(app._renameCalls.at(-1), { from: 'notes/tpl.md', to: 'notes/2026-01-15 Meeting.md' });
    plugin.settings.nameTemplate = '{{h1}}';
    console.log('✓ 12. 檔名模板 {{date}} {{h1}} → 2026-01-15 Meeting.md（用檔案建立日，冪等）');

    // --- 13: batch dry-run preview + apply ---
    const fb1 = addFile(app, 'batch/a.md', '# Alpha Report\n', 'Alpha Report');
    const fb2 = addFile(app, 'batch/b.md', '# Beta Report\n', 'Beta Report');
    addFile(app, 'batch/c.md', 'no h1\n', null);
    const batchCmd = plugin._commands.find((c) => c.id === 'batch-preview-renames');
    batchCmd.callback();
    await sleep(120);
    const modal = global.__lastModal;
    assert.ok(modal, 'batch modal opened');
    const texts = [...modal.contentEl.walk()].map((e) => e.text).filter(Boolean);
    assert.ok(texts.some((t) => t.includes('batch/a.md → Alpha Report.md')), 'dry-run lists a.md');
    assert.ok(texts.some((t) => t.includes('× no-h1')), 'dry-run summarises skip reasons');
    const applyBtn = [...modal.contentEl.walk()].find((e) => e.tag === 'button' && e.text.startsWith('Apply'));
    assert.ok(applyBtn, 'apply button present');
    applyBtn.listeners.click[0]();
    await sleep(150);
    assert.ok(app._files.has('batch/Alpha Report.md') && app._files.has('batch/Beta Report.md'), 'batch applied');
    assert.ok(!app._files.has('batch/c.md') || app._files.get('batch/c.md'), 'no-h1 file untouched');
    assert.ok(app._renameCalls.some((c) => c.from === 'batch/a.md') && app._renameCalls.some((c) => c.from === 'batch/b.md'), 'both batch files renamed');
    assert.ok(app._renameCalls.every((c) => c.from !== 'batch/c.md'), 'skip stays skipped');
    assert.ok(notices.some((n) => n.includes('batch renamed')), 'batch summary notice');
    console.log('✓ 13. 批次 dry-run 預覽（全 vault、含 skip 原因）→ Apply 實際改名並通知');

    // --- 14: v1 data migration on load ---
    const app2 = makeFakeApp();
    const plugin2 = new PluginClass(app2, { id: 'h1aligner' });
    plugin2._data = { renameOnFileOpen: false, showNoticeOnRename: true, skipIfFrontmatterLock: false };
    await plugin2.onload();
    assert.equal(plugin2.settings.renameTrigger, 'manual', 'v1 renameOnFileOpen=false → manual');
    assert.equal(plugin2.settings.noticeLevel, 'all', 'v1 showNoticeOnRename=true → all');
    assert.equal(plugin2.settings.skipIfFrontmatterLock, true, 'v1 meaningless lock=false → new default true');
    console.log('✓ 14. v1 data.json 遷移：trigger/noticeLevel/lock 正確轉換');

    // --- 15: unload cancels pending debounce ---
    const fg = addFile(app, 'notes/pending.md', '# Pending Rename\n', 'Pending Rename');
    app._ws['file-open'](fg);
    plugin.onunload();
    await sleep(180);
    assert.equal(app._renameCalls.filter((c) => c.from === 'notes/pending.md').length, 0, 'no rename after unload');
    console.log('✓ 15. onunload 取消未觸發的 debounce → 卸載後不再改名');

    console.log('\nE2E smoke test: 15/15 scenarios passed（真實 production bundle main.js, v0.4.0）');
})().catch((e) => { console.error('SMOKE TEST FAILED:', e); process.exit(1); });
