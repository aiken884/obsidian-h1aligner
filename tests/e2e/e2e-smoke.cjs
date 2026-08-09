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
            async process(file, cb) {
                const e = files.get(file.path);
                if (!e) throw new Error('ENOENT ' + file.path);
                e.content = cb(e.content);
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
                // Capture BEFORE deleting: content must survive the rename —
                // reading files.get(newPath) here would always miss (that
                // path doesn't exist yet) and silently wipe the body.
                const oldEntry = files.get(file.path);
                files.delete(file.path);
                file.path = newPath;
                file.basename = path.basename(newPath, '.md');
                file.name = path.basename(newPath);
                files.set(newPath, {
                    file,
                    content: oldEntry ? oldEntry.content : '',
                    // The cache carries over, not null: Obsidian's
                    // metadataCache does not synchronously re-index on
                    // rename (confirmed during this feature's design
                    // research — rename does not fire a 'changed' event).
                    // The last-known cache is still contentually valid
                    // since a rename changes the path, not the file body.
                    cache: oldEntry ? oldEntry.cache : null,
                });
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
    const parentPath = dir === '.' ? '/' : dir;
    f.parent = {
        path: parentPath,
        // Live-computed, like real Obsidian's TFolder.children: derived from
        // the vault's CURRENT file set (not a snapshot taken at addFile()
        // time), so later addFile()/renameFile()/_files.delete() calls in
        // the same scenario keep it correct automatically — no separate
        // bookkeeping to keep in sync, and no stale entries after a test
        // frees a name via app._files.delete().
        get children() {
            return [...app._files.values()]
                .map((e) => e.file)
                .filter((sib) => {
                    const sd = path.dirname(sib.path);
                    return (sd === '.' ? '/' : sd) === parentPath;
                });
        },
    };
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

/** Build an InlineTag whose position matches its literal place inside `body`. */
function tagAt(body, tag) {
    const offset = body.indexOf(tag);
    if (offset < 0) throw new Error(`tag ${tag} not found in body`);
    const before = body.slice(0, offset);
    const line = (before.match(/\n/g) || []).length;
    const col = offset - (before.lastIndexOf('\n') + 1);
    return {
        tag,
        position: {
            start: { line, col, offset },
            end: { line, col: col + tag.length, offset: offset + tag.length },
        },
    };
}

/** addFile() + a cache carrying both an H1 heading (with position) and inline tags. */
function addTaggedFile(app, p, h1, body, tagNames) {
    const content = `# ${h1}\n\n${body}`;
    const f = addFile(app, p, content, null);
    const headingLine = `# ${h1}`;
    const tags = tagNames.map((t) => tagAt(content, t));
    app._files.get(p).cache = {
        headings: [{
            level: 1,
            heading: h1,
            position: {
                start: { line: 0, col: 0, offset: 0 },
                end: { line: 0, col: headingLine.length, offset: headingLine.length },
            },
        }],
        tags,
    };
    return f;
}

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
    // Drain the one still-valid, older entry left on the stack after 8b
    // first: Fix A makes an invalidated TOP entry fall through to the next
    // valid entry beneath it instead of stopping (see scenario 23), so this
    // scenario — which tests the identity-rejection notice in isolation —
    // needs a stack containing ONLY the one entry it is about to corrupt.
    undoCmd.callback();
    await sleep(50);
    assert.deepEqual(
        app._renameCalls.at(-1),
        { from: 'notes/New Title.md', to: 'notes/old-name.md' },
        'setup: drain the older valid history entry so 8c starts from an empty stack',
    );
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

    // --- 18: experimental tag move — main.ts wiring (adversarial-review findings) ---
    plugin.settings.moveTagsToFrontmatter = true;
    plugin.settings.bodyTagHandling = 'remove-hash';

    // 18a: edit-triggered rename must NEVER move tags, even though the H1
    // still differs from the basename (so the rename itself does fire).
    plugin.settings.renameTrigger = 'edit';
    plugin.settings.editDebounceMs = 60;
    const ftagEdit = addTaggedFile(app, 'notes/tag-edit-src.md', 'Tag Edit Target', 'text #keepme here', ['#keepme']);
    app._activeFile = ftagEdit;
    app._ws['editor-change'](null, { file: ftagEdit });
    await sleep(140);
    assert.ok(app._files.has('notes/Tag Edit Target.md'), 'edit trigger still renames by H1');
    const editedEntry = app._files.get('notes/Tag Edit Target.md');
    assert.ok(editedEntry.content.includes('#keepme'), 'edit-triggered rename never moves tags — body untouched');
    assert.ok(!editedEntry.fm || !editedEntry.fm.tags, 'edit-triggered rename writes no frontmatter tags');
    console.log('✓ 18a. edit 觸發：H1 驅動的改名照常執行，但 tag 搬移的安全閘門擋下（main.ts allowTagMove 接線）');

    // 18b: file-open trigger with no recent edit → tag DOES move, and the
    // activity log records the formatted detail ('+1 tags').
    plugin.settings.renameTrigger = 'file-open';
    const ftagOpen = addTaggedFile(app, 'notes/tag-open-src.md', 'Tag Open Target', 'text #moveme here', ['#moveme']);
    app._ws['file-open'](ftagOpen);
    await sleep(180);
    assert.ok(app._files.has('notes/Tag Open Target.md'), 'file-open trigger renames by H1');
    const openedEntry = app._files.get('notes/Tag Open Target.md');
    assert.ok(!openedEntry.content.includes('#moveme') && openedEntry.content.includes('moveme'), 'remove-hash strips # but keeps the word');
    assert.ok(openedEntry.fm && openedEntry.fm.tags && openedEntry.fm.tags.includes('moveme'), 'tag written into frontmatter');
    actCmd.callback();
    await sleep(20);
    const tagActTexts = [...global.__lastModal.contentEl.walk()].map((e) => e.text).filter(Boolean);
    assert.ok(tagActTexts.some((t) => t.includes('Tag Open Target') && t.includes('+1 tags')), 'activity log shows the tagMoveDetail formatted string');
    console.log('✓ 18b. file-open 觸發（未在打字中）：tag 正確搬移，activity log 顯示 +1 tags');

    // 18c: batch apply must honour the SAME "typing in progress" guard as
    // every other trigger (adversarial-review finding — this was the actual
    // bug: batch apply used to call renameFromH1() with no options at all,
    // so allowTagMove silently defaulted to true regardless of a moments-ago edit).
    plugin.settings.renameTrigger = 'file-open';
    // Generous window: the batch scan below walks every file accumulated
    // across this whole suite before Apply even runs, which on its own can
    // take longer than a short debounce — a tight window would let the
    // guard "pass" this test for the wrong reason (elapsed, not enforced).
    plugin.settings.editDebounceMs = 30_000;
    const ftagBatch = addTaggedFile(app, 'batch/tag-guard-src.md', 'Tag Guard Renamed', 'text #halftype here', ['#halftype']);
    app._ws['editor-change'](null, { file: ftagBatch }); // marks it "just edited" — no rename fires from this alone (trigger is file-open)
    batchCmd.callback();
    await sleep(120);
    const guardApply = [...global.__lastModal.contentEl.walk()].find((e) => e.tag === 'button' && e.text.startsWith('Apply'));
    assert.ok(guardApply, 'batch apply button present for the tag-guard candidate');
    guardApply.listeners.click[0]();
    await sleep(150);
    assert.ok(app._files.has('batch/Tag Guard Renamed.md'), 'batch apply still renames by H1');
    const batchGuardEntry = app._files.get('batch/Tag Guard Renamed.md');
    assert.ok(batchGuardEntry.content.includes('#halftype'), 'batch apply honours the typing-in-progress guard — body untouched');
    assert.ok(!batchGuardEntry.fm || !batchGuardEntry.fm.tags, 'batch apply honours the typing-in-progress guard — no frontmatter tags written');
    console.log('✓ 18c. batch apply：套用前一刻剛編輯過的候選檔案，tag 搬移比照其他觸發路徑被安全閘門擋下（修正繞過漏洞）');

    plugin.settings.moveTagsToFrontmatter = false;
    plugin.settings.bodyTagHandling = 'keep';

    // --- 19: 'leave' race — switching straight back to the note you just
    // left, before its debounced rename fires, must NOT rename the note
    // currently being viewed (bug fix #1 regression). Opening a DIFFERENT
    // file schedules a 'leave' rename keyed by the PATH being left; switching
    // back to that file is a file-open event for a DIFFERENT path (whatever
    // was active in between), so it does not cancel the already-pending
    // timer — only the fire-time getActiveFile() re-check can still catch it.
    plugin.settings.renameTrigger = 'leave';
    plugin.settings.fileOpenDebounceMs = 150;
    const fLeaveAnchor = addFile(app, 'notes/leave-anchor.md', '# Leave Anchor\n', 'Leave Anchor');
    app._activeFile = fLeaveAnchor;
    app._ws['file-open'](fLeaveAnchor); // establish a known "previous" file
    await sleep(200);
    const fLeaveRace = addFile(app, 'notes/leave-race.md', '# Leave Race\n', 'Leave Race');
    app._activeFile = fLeaveRace;
    app._ws['file-open'](fLeaveRace); // switch to the race file (schedules the anchor's own, unrelated leave-rename)
    await sleep(200);
    before = app._renameCalls.length;
    app._activeFile = fLeaveAnchor;
    app._ws['file-open'](fLeaveAnchor); // leave the race file → schedules renaming it after 150ms
    await sleep(50);
    app._activeFile = fLeaveRace;
    app._ws['file-open'](fLeaveRace); // switch straight back before that 150ms timer fires
    await sleep(220); // well past the 150ms — the pending timer has fired by now
    assert.equal(
        app._renameCalls.filter((c) => c.from === 'notes/leave-race.md').length,
        0,
        "leave: a pending rename of the note just left must be skipped once the user switched straight back to it before the timer fired (bug #1 regression — without the fire-time getActiveFile() re-check this renames the note currently on screen)",
    );
    assert.ok(app._files.has('notes/leave-race.md'), 'race file untouched — still at its original path');
    plugin.settings.fileOpenDebounceMs = 100;
    plugin.settings.renameTrigger = 'file-open';
    console.log("✓ 19. leave 模式競態：debounce 尚未觸發前切回原筆記 → 不改名目前正在看的筆記（bug #1 回歸測試）");

    // --- 20: 'both' race — a file-open event on a file that already has a
    // PENDING edit-sourced schedule for the same path (e.g. refocusing a
    // second pane on the note you're mid-typing in) must NOT replace the
    // long edit-pause debounce with the much shorter file-open delay (bug
    // fix #2 regression — pendingRenameSource lets scheduleRename tell them
    // apart and drop the file-open reschedule instead of cutting the window
    // short).
    plugin.settings.renameTrigger = 'both';
    plugin.settings.editDebounceMs = 300;
    plugin.settings.fileOpenDebounceMs = 60;
    const fBothGuard = addFile(app, 'notes/both-guard.md', '# Both Guard Renamed\n', 'Both Guard Renamed');
    app._ws['editor-change'](null, { file: fBothGuard }); // mid-edit: schedules a 300ms edit-sourced rename
    await sleep(40);
    app._ws['file-open'](fBothGuard); // refocus / second pane on the SAME file, still mid-edit
    await sleep(100); // > fileOpenDebounceMs (60ms) but well under editDebounceMs (300ms)
    assert.equal(
        app._renameCalls.filter((c) => c.from === 'notes/both-guard.md').length,
        0,
        'both: a same-file file-open event must not cut the pending edit debounce short with the shorter file-open delay (bug #2 regression)',
    );
    await sleep(250); // now past the original 300ms edit debounce
    assert.deepEqual(
        app._renameCalls.at(-1),
        { from: 'notes/both-guard.md', to: 'notes/Both Guard Renamed.md' },
        'the original edit-sourced debounce still fires undisturbed on its own schedule',
    );
    plugin.settings.fileOpenDebounceMs = 100;
    plugin.settings.editDebounceMs = 2000;
    plugin.settings.renameTrigger = 'file-open';
    console.log("✓ 20. both 模式競態：同檔案 file-open 不會截斷正在等待的 edit debounce（bug #2 回歸測試）");

    // --- 21: batch-apply race guards — an H1 edited between preview
    // generation and clicking Apply must abort that one item (counted as
    // "changed"), never rename it onto the stale preview target, and leave
    // an unaffected sibling in the same batch to apply normally; a real
    // write failure on another item is counted as "failed", not silently
    // swallowed. Both notices are asserted on the SAME apply.
    const fStaleA = addFile(app, 'batch/stale-a.md', '# Stale Original\n', 'Stale Original');
    const fStaleB = addFile(app, 'batch/stale-b.md', '# Stale Sibling\n', 'Stale Sibling');
    const fFailC = addFile(app, 'batch/fail-c.md', '# Fail C Renamed\n', 'Fail C Renamed');
    batchCmd.callback();
    await sleep(150);
    const staleModal = global.__lastModal;
    const staleTexts = [...staleModal.contentEl.walk()].map((e) => e.text).filter(Boolean);
    assert.ok(staleTexts.some((t) => t.includes('batch/stale-a.md → Stale Original.md')), 'preview captured the H1 as it was at scan time');
    // The user edits stale-a's H1 AFTER the preview was generated but
    // BEFORE clicking Apply — the fresh per-item dry run inside Apply must
    // notice the target no longer matches and abort just this item.
    app._files.get('batch/stale-a.md').cache.headings[0].heading = 'Stale Edited';
    app._files.get('batch/stale-a.md').content = '# Stale Edited\n';
    // A real filesystem write failure on fail-c — undetectable by the dry-run
    // pre-check (dryRun never calls renameFile), so it must surface as the
    // separate "failed" counter, not as "changed".
    const originalRenameFile = app.fileManager.renameFile;
    app.fileManager.renameFile = async (file, newPath) => {
        if (file.path === 'batch/fail-c.md') throw new Error('simulated filesystem write failure');
        return originalRenameFile(file, newPath);
    };
    const staleApply = [...staleModal.contentEl.walk()].find((e) => e.tag === 'button' && e.text.startsWith('Apply'));
    assert.ok(staleApply, 'apply button present for the stale/fail batch');
    const noticesBeforeStaleApply = notices.length;
    staleApply.listeners.click[0]();
    await sleep(200);
    app.fileManager.renameFile = originalRenameFile;
    assert.ok(!app._files.has('batch/Stale Original.md'), 'the edited candidate is NOT renamed onto the stale preview target');
    assert.ok(app._files.has('batch/stale-a.md'), 'the edited candidate stays at its original path — Apply aborted it rather than overwriting with a stale name');
    assert.ok(app._files.has('batch/Stale Sibling.md'), 'an unaffected sibling in the same batch still applies normally');
    assert.ok(app._files.has('batch/fail-c.md'), 'the write-failure candidate stays at its original path — the failed rename never took effect');
    const staleNotices = notices.slice(noticesBeforeStaleApply);
    assert.ok(staleNotices.some((n) => n.includes('changed since preview')), 'apply notice reports the H1-changed-since-preview count');
    assert.ok(staleNotices.some((n) => n.includes('skipped/failed')), 'apply notice reports the real write-failure count separately (failed-item counter)');
    console.log("✓ 21. batch apply 競態閘門：預覽後 H1 被編輯的項目中止且不誤改名、同批次其他項目照常套用；真實寫入失敗計入 failed 並個別通知");

    // --- 22: undo's occupancy check is case- and NFC-insensitive via a
    // file.parent.children sibling scan (exercised now that addFile()
    // populates .children like real Obsidian's TFolder does). An
    // NFD-encoded sibling name folds to the same key as the NFC original —
    // an exact-path lookup misses it, but the sibling scan must not.
    plugin.settings.renameTrigger = 'file-open';
    const NFC_E = 'é'; // 'é', precomposed
    const NFD_E = 'é'; // 'e' + combining acute accent — same glyph, different code units
    const origBase = 'caf' + NFC_E; // "café" (NFC)
    const foldedSiblingBase = 'caf' + NFD_E; // visually "café" too, but NFD-encoded
    assert.notEqual(origBase, foldedSiblingBase, 'sanity: the NFC and NFD forms are literally different strings');
    const fFold = addFile(app, `notes/${origBase}.md`, '# Folded Target\n', 'Folded Target');
    app._ws['file-open'](fFold);
    await sleep(180);
    assert.ok(app._files.has('notes/Folded Target.md'), 'setup: café.md renamed to Folded Target.md');
    // A sibling appears at an NFD-encoded name — a different literal path,
    // so the exact getAbstractFileByPath lookup on the original path misses it.
    addFile(app, `notes/${foldedSiblingBase}.md`, 'occupier\n', null);
    assert.equal(app.vault.getAbstractFileByPath(`notes/${origBase}.md`), null, 'sanity: exact-path index misses the NFD sibling (different code units)');
    const noticesBeforeFoldUndo = notices.length;
    undoCmd.callback();
    await sleep(50);
    assert.ok(
        notices.slice(noticesBeforeFoldUndo).some((n) => n.includes('occupied')),
        'undo refuses: an NFC/case-folded sibling occupies the target name (undoLastRename sibling scan)',
    );
    assert.ok(app._files.has('notes/Folded Target.md'), 'undo aborted — file stays at its renamed path, not moved back onto the occupied name');
    console.log("✓ 22. undo NFC/大小寫不敏感佔用檢查：file.parent.children 掃描擋下回退（folded 同名 sibling 存在）");

    // --- 23: undo skips an invalidated TOP history entry and falls through
    // to the next, still-valid, OLDER entry instead of getting permanently
    // stuck (Fix A regression — previously a single invalidated top entry
    // stayed on top of the stack forever, blocking undo from ever reaching
    // anything beneath it). Isolated fresh app/plugin so the history stack
    // contains ONLY the two entries this scenario builds.
    const app4 = makeFakeApp();
    const plugin4 = new PluginClass(app4, { id: 'heading-aligner' });
    plugin4._data = { onboardingShown: true };
    plugin4.onload();
    await sleep(80);
    const undoCmd4 = plugin4._commands.find((c) => c.id === 'undo-last-rename');

    const fUndoA = addFile(app4, 'notes/undo-a.md', '# Undo A Renamed\n', 'Undo A Renamed');
    app4._ws['file-open'](fUndoA);
    await sleep(180);
    assert.ok(app4._files.has('notes/Undo A Renamed.md'), 'setup: undo-a renamed — the OLDER history entry');

    const fUndoB = addFile(app4, 'notes/undo-b.md', '# Undo B Renamed\n', 'Undo B Renamed');
    app4._ws['file-open'](fUndoB);
    await sleep(180);
    assert.ok(app4._files.has('notes/Undo B Renamed.md'), 'setup: undo-b renamed — the TOP (newer) history entry');

    // Invalidate the TOP entry's identity: remove the TFile the rename
    // service captured, and put an UNRELATED new TFile at the exact same
    // path — path resolution still succeeds but now returns a different
    // TFile object, so undo's identity check must reject it.
    app4._files.delete('notes/Undo B Renamed.md');
    const impostor = addFile(app4, 'notes/Undo B Renamed.md', 'impostor body\n', null);
    assert.notEqual(
        app4._files.get('notes/Undo B Renamed.md').file,
        fUndoB,
        'sanity: the impostor is a different TFile object than the one originally renamed',
    );

    const noticesBeforeFirstUndo4 = notices.length;
    undoCmd4.callback();
    await sleep(50);
    assert.ok(
        !notices.slice(noticesBeforeFirstUndo4).some((n) => n.includes('moved or deleted')),
        'undo does not report "moved" for the invalid top entry — it fell through to the older valid entry instead of getting stuck',
    );
    assert.deepEqual(
        app4._renameCalls.at(-1),
        { from: 'notes/Undo A Renamed.md', to: 'notes/undo-a.md' },
        'undo skipped the invalid TOP entry and undid the next, still-valid entry beneath it',
    );
    assert.ok(app4._files.has('notes/undo-a.md'), 'the older, still-valid entry was successfully undone');
    assert.equal(
        app4._files.get('notes/Undo B Renamed.md').file,
        impostor,
        'the impostor sitting at the invalidated path is left completely untouched',
    );

    // The invalid entry must be gone for good — a second undo call must not
    // retry it (the stack now holds nothing else, so nothing should happen).
    const renameCallCountAfterFirstUndo4 = app4._renameCalls.length;
    undoCmd4.callback();
    await sleep(50);
    assert.equal(
        app4._renameCalls.length,
        renameCallCountAfterFirstUndo4,
        'second undo call touches nothing — the invalidated entry is gone from the stack for good, not retried',
    );
    console.log('✓ 23. undo 遇到堆疊頂端身分驗證失敗的紀錄時，跳過並改復原下一筆較舊但仍有效的紀錄，而非卡死（Fix A 回歸測試）');

    // --- 24: scheduleRename's debounce bookkeeping must stay keyed by the
    // path CAPTURED at schedule time, even if the file is renamed (by this
    // plugin's own manual command, batch apply, or externally) before the
    // debounce timer fires — otherwise the fire-time cleanup deletes the
    // wrong map key, permanently orphaning a stale pendingRenameSource entry
    // under the OLD path (Fix B regression). Isolated fresh app/plugin.
    const app5 = makeFakeApp();
    const plugin5 = new PluginClass(app5, { id: 'heading-aligner' });
    plugin5._data = { onboardingShown: true };
    plugin5.onload();
    await sleep(80);
    plugin5.settings.renameTrigger = 'edit';
    plugin5.settings.editDebounceMs = 150;
    const cmd5 = plugin5._commands.find((c) => c.id === 'rename-active-file-from-h1');

    const fOrphan = addFile(app5, 'notes/orphan-src.md', '# Orphan Target\n', 'Orphan Target');
    app5._ws['editor-change'](null, { file: fOrphan }); // schedules a 150ms edit-sourced rename keyed by 'notes/orphan-src.md'
    await sleep(50); // well before the 150ms debounce fires

    // Simulate the file being renamed out from under the pending debounce —
    // here via this plugin's OWN manual command, the exact case named in the
    // fix's rationale (batch apply / external rename are the same shape).
    app5._activeFile = fOrphan;
    assert.equal(cmd5.checkCallback(true), true, 'manual command available on the file with a pending debounce');
    cmd5.checkCallback(false);
    await sleep(80);
    assert.deepEqual(
        app5._renameCalls.at(-1),
        { from: 'notes/orphan-src.md', to: 'notes/Orphan Target.md' },
        'manual command renamed the file while the automatic edit-debounce was still pending',
    );
    const renameCallCountBeforeFire5 = app5._renameCalls.length;

    // Let the original 150ms edit-debounce fire now (well past 150ms total
    // elapsed since it was scheduled). The file is already correctly named,
    // so this must be a harmless no-op — never a crash, never a wrong rename.
    await sleep(150);
    assert.equal(
        app5._renameCalls.length,
        renameCallCountBeforeFire5,
        'the stale debounce firing after the manual rename is a no-op — the file already matches its H1, so no crash and no incorrect extra rename',
    );

    // The critical proof: a BRAND NEW file reusing the exact OLD path string
    // must get a completely normal schedule+fire cycle. Without the fix, the
    // fire-time cleanup above deleted the wrong map key, so the
    // pendingRenameSource entry set at 'notes/orphan-src.md' → 'edit' was
    // NEVER removed — a later file-open-sourced schedule for that same path
    // hits the file-open/edit conflict guard and is silently dropped forever.
    plugin5.settings.renameTrigger = 'file-open';
    plugin5.settings.fileOpenDebounceMs = 100;
    const fReused = addFile(app5, 'notes/orphan-src.md', '# Reused Path Renamed\n', 'Reused Path Renamed');
    app5._ws['file-open'](fReused);
    await sleep(180);
    assert.ok(
        app5._files.has('notes/Reused Path Renamed.md'),
        'a new file reusing the OLD path string still gets a normal schedule+fire cycle — no permanently-orphaned pendingRenameSource entry silently blocks it (Fix B regression)',
    );
    console.log('✓ 24. 檔案在 debounce 尚未觸發前被改名（手動指令/外部）→ fire-time 清理仍對齊排程時的路徑，不留下永久孤兒項目擋住之後重用該路徑字串的正常改名（Fix B 回歸測試）');

    console.log('\nE2E smoke test: 31/31 scenarios passed（真實 production bundle main.js, v0.10.0）');
})().catch((e) => { console.error('SMOKE TEST FAILED:', e); process.exit(1); });
