/**
 * E2E smoke test v0.4.0: load the REAL production bundle (main.js) with a
 * stubbed `obsidian` module and drive the plugin through its runtime paths.
 */
if (typeof global.window === 'undefined') global.window = global; // window.* timer shim
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
        this.attributes = {};
        this.classList = { add() {} };
    }
    createEl(tag, opts) { const el = new FakeEl(tag, opts); this.children.push(el); return el; }
    createDiv(opts) { return this.createEl('div', opts); }
    createSpan(opts) { return this.createEl('span', opts); }
    empty() { this.children = []; }
    setText(t) { this.text = t; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
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
class PluginSettingTab {
    constructor(app, plugin) {
        this.app = app;
        this.plugin = plugin;
        this.containerEl = new FakeEl('div');
    }
}
class TextAreaComponent {
    constructor(settingEl) {
        this.inputEl = new FakeEl('textarea');
        settingEl.children.push(this.inputEl);
    }
    setPlaceholder(value) { this.inputEl.placeholder = value; return this; }
    setValue(value) { this.inputEl.value = value; return this; }
    onChange(cb) { this.inputEl.onChange = cb; return this; }
}
class Setting {
    constructor(containerEl) {
        this.settingEl = new FakeEl('div');
        containerEl.children.push(this.settingEl);
    }
    setName() { return this; } setDesc() { return this; } setHeading() { return this; }
    addToggle() { return this; } addText() { return this; }
    addTextArea(cb) { cb(new TextAreaComponent(this.settingEl)); return this; }
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
function getLanguage() { return 'en'; }
function normalizePath(p) {
    return String(p).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
}

const obsidianStub = { Plugin, PluginSettingTab, Setting, Modal, Notice, TAbstractFile, TFile, normalizePath, getLanguage };

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
            configDir: '.obsidian',
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
            async processFrontMatter(file, cb) {
                const e = files.get(file.path);
                if (!e) throw new Error('ENOENT ' + file.path);
                e.fm = e.fm || {};
                cb(e.fm);
            },
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
    const plugin = new PluginClass(app, { id: 'heading-aligner' });
    plugin.onload();
    await sleep(80); // initialize() is async behind the void boundary
    assert.ok(app._ws['file-open'], 'file-open handler registered');
    assert.ok(app._ws['editor-change'], 'editor-change handler registered');
    assert.equal(app._vault['modify'], undefined, 'no raw vault modify handler (sync/backlink writes ignored)');
    assert.equal(plugin._commands.length, 4, 'four commands registered');
    const onboarding = global.__lastModal;
    assert.ok(onboarding, 'onboarding modal shown on first run');
    // Before the user answers, automatic triggers must stay gated.
    const fgate = addFile(app, 'notes/pre-consent.md', '# Consent Gate\n', 'Consent Gate');
    app._ws['file-open'](fgate);
    await sleep(180);
    assert.equal(app._renameCalls.length, 0, 'no auto-rename before onboarding consent');
    const keepBtn = [...onboarding.contentEl.walk()].find((e) => e.tag === 'button' && e.text.includes('Keep automatic'));
    assert.ok(keepBtn, 'keep-automatic button present');
    keepBtn.listeners.click[0]();
    onboarding.close();
    await sleep(20);
    assert.equal(plugin.settings.onboardingShown, true, 'onboarding flag persisted');
    assert.equal(plugin.settings.renameTrigger, 'file-open', 'kept automatic trigger');
    console.log('✓ 1. onload：settings v2、editor-change 事件、4 個指令、onboarding 首次顯示並保存選擇');

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

    // --- 4b: Settings validate exclude-pattern drafts inline ---
    plugin._settingTab.display();
    const excludeInput = [...plugin._settingTab.containerEl.walk()].find(
        (e) => e.tag === 'textarea' && e.placeholder === '^\\d{4}-\\d{2}-\\d{2}$',
    );
    assert.ok(excludeInput, 'exclude-pattern textarea rendered in Settings');
    const noticesBeforePatternEdit = notices.length;
    await excludeInput.onChange('^stable$\n[broken');
    assert.deepEqual(plugin.settings.excludePatterns, ['^\\d{4}-\\d{2}-\\d{2}$'], 'invalid draft keeps active patterns');
    assert.equal(plugin.settings.excludePatternsDraft, '^stable$\n[broken', 'invalid draft persists separately');
    assert.equal(excludeInput.attributes['aria-invalid'], 'true', 'textarea exposes invalid state');
    const settingTexts = [...plugin._settingTab.containerEl.walk()].map((e) => e.text).filter(Boolean);
    assert.ok(settingTexts.some((t) => t.includes('Invalid pattern(s)')), 'inline validation message rendered');
    assert.ok(settingTexts.some((t) => t.includes('Currently active rules')), 'active rules remain visible while the draft is invalid');
    assert.equal(notices.length, noticesBeforePatternEdit, 'typing invalid patterns does not show a Notice');
    await excludeInput.onChange('^stable$');
    assert.deepEqual(plugin.settings.excludePatterns, ['^stable$'], 'valid draft becomes active');
    assert.equal(plugin.settings.excludePatternsDraft, undefined, 'valid draft clears pending state');
    assert.equal(excludeInput.attributes['aria-invalid'], 'false', 'textarea clears invalid state');
    await excludeInput.onChange('^\\d{4}-\\d{2}-\\d{2}$');
    console.log('✓ 4b. 設定頁：無效 pattern 即時 inline 驗證、保留有效規則、修正後才套用');

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

    // --- 9b: 'both' trigger — file-open AND editor-change both rename ---
    plugin.settings.renameTrigger = 'both';
    const fboth1 = addFile(app, 'notes/both-open.md', '# Both Open\n', 'Both Open');
    app._ws['file-open'](fboth1);
    await sleep(180);
    assert.ok(app._files.has('notes/Both Open.md'), 'both: file-open renames');
    const fboth2 = addFile(app, 'notes/both-edit.md', '# Both Edit\n', 'Both Edit');
    plugin.settings.editDebounceMs = 120;
    app._ws['editor-change'](null, { file: fboth2 });
    await sleep(250);
    assert.ok(app._files.has('notes/Both Edit.md'), 'both: editor-change renames');
    console.log('✓ 9b. both 模式：開檔與編輯後兩種事件都會改名');

    // --- 9c: 'leave' trigger — renames the note you switched AWAY from ---
    plugin.settings.renameTrigger = 'leave';
    const fl = addFile(app, 'notes/leave-me.md', '# Left Behind\n', 'Left Behind');
    app._ws['file-open'](fl); // becomes the active note
    await sleep(180);
    assert.ok(app._files.has('notes/leave-me.md'), 'leave: current note untouched while open');
    const felse = addFile(app, 'notes/elsewhere.md', '# elsewhere\n', 'elsewhere');
    app._ws['file-open'](felse); // switching away → previous note renames
    await sleep(180);
    assert.ok(app._files.has('notes/Left Behind.md'), 'leave: previous note renamed after switching away');
    plugin.settings.renameTrigger = 'file-open';
    console.log('✓ 9c. leave 模式：正在看的檔案不動，切走後前一個檔案改名');

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

    // --- 13: invalid exclude-pattern drafts block all writes but keep preview available ---
    plugin.settings.excludePatternsDraft = '[broken';
    const finvalid = addFile(app, 'notes/invalid-config.md', '# Must Stay\n', 'Must Stay');
    before = app._renameCalls.length;
    app._ws['file-open'](finvalid);
    await sleep(180);
    assert.equal(app._renameCalls.length, before, 'invalid pattern draft blocks automatic renames');
    app._activeFile = finvalid;
    cmd.checkCallback(false);
    await sleep(80);
    assert.equal(app._renameCalls.length, before, 'invalid pattern draft blocks manual renames');
    const batchCmd = plugin._commands.find((c) => c.id === 'batch-preview-renames');
    batchCmd.callback();
    await sleep(120);
    const invalidModal = global.__lastModal;
    const invalidTexts = [...invalidModal.contentEl.walk()].map((e) => e.text).filter(Boolean);
    assert.ok(invalidTexts.some((t) => t.includes('Fix the invalid exclude patterns')), 'preview explains that writes are paused');
    const blockedApply = [...invalidModal.contentEl.walk()].find((e) => e.tag === 'button' && e.text.startsWith('Apply'));
    assert.equal(blockedApply.disabled, true, 'apply is disabled while the pattern draft is invalid');
    assert.equal(blockedApply.attributes['aria-disabled'], 'true', 'disabled apply exposes its state to assistive technology');
    invalidModal.close();
    delete plugin.settings.excludePatternsDraft;
    console.log('✓ 13. 無效排除規則草稿：仍可預覽，但自動、手動與批次改名都被安全暫停');

    // --- 14: batch dry-run preview + grouped apply ---
    const fb1 = addFile(app, 'batch/a.md', '# Alpha Report\n', 'Alpha Report');
    const fb2 = addFile(app, 'batch/b.md', '# Beta Report\n', 'Beta Report');
    const fbConflict = addFile(app, 'batch/duplicate.md', '# Alpha Report\n', 'Alpha Report');
    addFile(app, 'batch/c.md', 'no h1\n', null);
    batchCmd.callback();
    await sleep(120);
    const modal = global.__lastModal;
    assert.ok(modal, 'batch modal opened');
    const texts = [...modal.contentEl.walk()].map((e) => e.text).filter(Boolean);
    assert.ok(texts.some((t) => t.includes('batch/a.md → Alpha Report.md')), 'dry-run lists a.md');
    assert.ok(texts.some((t) => t.startsWith('Rename (')), 'renames have their own review group');
    assert.ok(texts.some((t) => t.startsWith('Conflicts (')), 'conflicts have their own review group');
    assert.ok(texts.some((t) => t.startsWith('Skipped (')), 'skips have their own review group');
    assert.ok(texts.some((t) => t.includes('Duplicate target in this batch')), 'duplicate targets explain the conflict');
    const applyBtn = [...modal.contentEl.walk()].find((e) => e.tag === 'button' && e.text.startsWith('Apply'));
    assert.ok(applyBtn, 'apply button present');
    plugin.settings.excludePatterns = ['^a$'];
    applyBtn.listeners.click[0]();
    await sleep(100);
    assert.ok(app._files.has('batch/a.md') && app._files.has('batch/b.md'), 'changed settings prevent applying a stale preview');
    assert.ok(notices.some((n) => n.includes('settings changed since this preview')), 'stale preview explains why apply stopped');
    plugin.settings.excludePatterns = ['^\\d{4}-\\d{2}-\\d{2}$'];
    batchCmd.callback();
    await sleep(120);
    const refreshedModal = global.__lastModal;
    const refreshedApply = [...refreshedModal.contentEl.walk()].find(
        (e) => e.tag === 'button' && e.text.startsWith('Apply'),
    );
    assert.ok(refreshedApply, 'fresh preview restores apply');
    refreshedApply.listeners.click[0]();
    await sleep(150);
    assert.ok(app._files.has('batch/Alpha Report.md') && app._files.has('batch/Beta Report.md'), 'batch applied');
    assert.equal(fbConflict.path, 'batch/duplicate.md', 'batch conflict stays untouched');
    assert.ok(!app._files.has('batch/c.md') || app._files.get('batch/c.md'), 'no-h1 file untouched');
    assert.ok(app._renameCalls.some((c) => c.from === 'batch/a.md') && app._renameCalls.some((c) => c.from === 'batch/b.md'), 'both batch files renamed');
    assert.ok(app._renameCalls.every((c) => c.from !== 'batch/c.md'), 'skip stays skipped');
    assert.ok(notices.some((n) => n.includes('batch renamed')), 'batch summary notice');
    console.log('✓ 14. 批次 dry-run 預覽依可改名、衝突、略過分流 → 設定變更拒絕舊預覽，Apply 只改可改名項目');

    // --- 15: v1 data migration on load ---
    const app2 = makeFakeApp();
    const plugin2 = new PluginClass(app2, { id: 'heading-aligner' });
    plugin2._data = { renameOnFileOpen: false, showNoticeOnRename: true, skipIfFrontmatterLock: false };
    plugin2.onload();
    await sleep(80);
    assert.equal(plugin2.settings.renameTrigger, 'manual', 'v1 renameOnFileOpen=false → manual');
    assert.equal(plugin2.settings.noticeLevel, 'all', 'v1 showNoticeOnRename=true → all');
    assert.equal(plugin2.settings.skipIfFrontmatterLock, true, 'v1 meaningless lock=false → new default true');
    const app3 = makeFakeApp();
    const plugin3 = new PluginClass(app3, { id: 'heading-aligner' });
    plugin3._data = { onboardingShown: true };
    global.__lastModal = null;
    plugin3.onload();
    await sleep(80);
    assert.equal(global.__lastModal, null, 'onboarding not shown again once flagged');
    console.log('✓ 15. v1 data.json 遷移正確；onboardingShown=true 不再顯示 onboarding');

    // --- 16: aliases + activity log ---
    plugin.settings.preserveOldNameAsAlias = true;
    const fal = addFile(app, 'notes/alias-src.md', '# Alias Target\n', 'Alias Target');
    app._ws['file-open'](fal);
    await sleep(180);
    assert.ok(app._files.has('notes/Alias Target.md'), 'alias case renamed');
    const fmEntry = app._files.get('notes/Alias Target.md').fm;
    assert.deepEqual(fmEntry.aliases, ['alias-src'], 'old basename preserved as alias');
    plugin.settings.preserveOldNameAsAlias = false;
    const actCmd = plugin._commands.find((c) => c.id === 'show-activity');
    actCmd.callback();
    await sleep(20);
    const actModal = global.__lastModal;
    const actTexts = [...actModal.contentEl.walk()].map((e) => e.text).filter(Boolean);
    assert.ok(actTexts.some((t) => t.includes('notes/alias-src.md') && t.includes('Alias Target')), 'activity lists the rename');
    assert.ok(actTexts.some((t) => t.includes('[file-open]')), 'activity records the trigger source');
    console.log('✓ 16. aliases：舊檔名寫入 frontmatter；activity 紀錄含來源與結果');

    // --- 17: unload cancels pending debounce ---
    const fg = addFile(app, 'notes/pending.md', '# Pending Rename\n', 'Pending Rename');
    app._ws['file-open'](fg);
    plugin.onunload();
    await sleep(180);
    assert.equal(app._renameCalls.filter((c) => c.from === 'notes/pending.md').length, 0, 'no rename after unload');
    console.log('✓ 17. onunload 取消未觸發的 debounce → 卸載後不再改名');

    console.log('\nE2E smoke test: 20/20 scenarios passed（真實 production bundle main.js, v0.10.0）');
})().catch((e) => { console.error('SMOKE TEST FAILED:', e); process.exit(1); });
