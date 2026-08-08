/**
 * activity-modal.test.ts — unit coverage for ActivityModal, in particular
 * the empty-log branch (entries.length === 0 renders a "no activity yet"
 * message and returns before building any rows). Every existing scenario
 * that opens this modal — in tests/e2e/e2e-smoke.cjs — does so only after
 * at least one rename has already been recorded, so that early return has
 * never actually run before this file.
 *
 * See onboarding-modal.test.ts for why `obsidian`'s Modal needs a stub
 * here (the package ships type declarations only, no runtime module).
 * ActivityLog itself is a pure module (no obsidian import), so the real
 * class is used directly rather than faked.
 */
import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { ActivityModal } from '../src/activity-modal';
import { ActivityLog } from '../src/activity-log';

interface FakeEl {
    tag: string;
    text: string;
    children: FakeEl[];
    addedClasses: string[];
    walk(): Generator<FakeEl>;
}

vi.mock('obsidian', () => {
    class FakeElImpl implements FakeEl {
        tag: string;
        text: string;
        children: FakeElImpl[] = [];
        addedClasses: string[] = [];
        classList = { add: (...cls: string[]) => this.addedClasses.push(...cls) };
        constructor(tag = 'div', opts?: { text?: string }) {
            this.tag = tag;
            this.text = opts?.text ?? '';
        }
        createEl(tag: string, opts?: { text?: string }): FakeElImpl {
            const el = new FakeElImpl(tag, opts);
            this.children.push(el);
            return el;
        }
        createDiv(opts?: { text?: string }): FakeElImpl {
            return this.createEl('div', opts);
        }
        createSpan(opts?: { text?: string }): FakeElImpl {
            return this.createEl('span', opts);
        }
        empty(): void {
            this.children = [];
        }
        *walk(): Generator<FakeElImpl> {
            yield this;
            for (const c of this.children) yield* c.walk();
        }
    }

    class Modal {
        contentEl = new FakeElImpl('div');
        onOpen?: () => void;
        onClose?: () => void;
        constructor(_app: unknown) {}
        open(): void {
            this.onOpen?.();
        }
        close(): void {
            this.onClose?.();
        }
    }

    class App {}

    return { Modal, App };
});

describe('ActivityModal', () => {
    it('renders "no activity yet" and builds no row list when the log is genuinely empty', () => {
        const log = new ActivityLog();
        const modal = new ActivityModal({} as unknown as App, log);
        modal.open();

        const contentEl = modal.contentEl as unknown as FakeEl;
        // h3 title + the empty-state <p>, nothing else — in particular no
        // 'div' list container, proving the function returned before
        // reaching the row-building loop.
        expect(contentEl.children.map((c) => c.tag)).toEqual(['h3', 'p']);
        expect(contentEl.children[1].text).toBe('No rename activity this session yet.');
    });

    it('renders one row per entry, newest first, with a dim class on non-renamed outcomes, when the log has entries', () => {
        const log = new ActivityLog();
        log.record({ ts: 1, path: 'a.md', source: 'file-open', outcome: 'renamed', newName: 'Alpha' });
        log.record({ ts: 2, path: 'b.md', source: 'manual', outcome: 'no-h1' });
        const modal = new ActivityModal({} as unknown as App, log);
        modal.open();

        const contentEl = modal.contentEl as unknown as FakeEl;
        expect(contentEl.children.map((c) => c.tag)).toEqual(['h3', 'div']);
        const list = contentEl.children[1];
        expect(list.children.length).toBe(2);

        // entries() reverses to newest-first: b.md (no-h1) then a.md (renamed).
        const [row0, row1] = list.children;
        expect(row0.children[0].text).toContain('b.md');
        expect(row0.children[0].text).toContain('(no-h1)');
        expect(row0.addedClasses).toContain('h1aligner-dim');

        expect(row1.children[0].text).toContain('a.md');
        expect(row1.children[0].text).toContain('→ Alpha');
        expect(row1.addedClasses).not.toContain('h1aligner-dim');
    });
});
