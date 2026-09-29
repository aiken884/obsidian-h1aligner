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
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { App } from 'obsidian';
import { ActivityModal } from '../src/activity-modal';
import { ActivityLog } from '../src/activity-log';

interface FakeEl {
    tag: string;
    text: string;
    children: FakeEl[];
    addedClasses: string[];
    listeners: Record<string, Array<() => void>>;
    walk(): Generator<FakeEl>;
}

vi.mock('obsidian', () => {
    class FakeElImpl implements FakeEl {
        tag: string;
        text: string;
        children: FakeElImpl[] = [];
        addedClasses: string[] = [];
        classList = { add: (...cls: string[]) => this.addedClasses.push(...cls) };
        listeners: Record<string, Array<() => void>> = {};
        addEventListener(evt: string, cb: () => void): void {
            (this.listeners[evt] = this.listeners[evt] ?? []).push(cb);
        }
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

    const notices: string[] = [];
    class Notice {
        constructor(message: string) {
            notices.push(message);
        }
    }
    (globalThis as Record<string, unknown>).__notices = notices;

    return { Modal, App, Notice };
});

const notices = (): string[] => (globalThis as unknown as { __notices: string[] }).__notices;

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    notices().length = 0;
});

function openWithTwoEntries(): { copy: FakeEl; expected: string } {
    // Pin the time text so the expected string is a literal, not derived from the code under test.
    vi.spyOn(Date.prototype, 'toLocaleTimeString').mockImplementation(function (this: Date) {
        return `T${this.getTime()}`;
    });
    const log = new ActivityLog();
    log.record({ ts: 1, path: 'a.md', source: 'file-open', outcome: 'renamed', newName: 'Alpha' });
    log.record({ ts: 2, path: 'b.md', source: 'manual', outcome: 'no-h1' });
    const modal = new ActivityModal({} as unknown as App, log);
    modal.open();
    const contentEl = modal.contentEl as unknown as FakeEl;
    const copy = contentEl.children.find((c) => c.tag === 'button') as FakeEl;
    const expected = 'T2  [manual]  b.md  (no-h1)\nT1  [file-open]  a.md  → Alpha';
    return { copy, expected };
}

describe('ActivityModal Copy button', () => {
    it('is absent when the log is empty', () => {
        const modal = new ActivityModal({} as unknown as App, new ActivityLog());
        modal.open();
        const contentEl = modal.contentEl as unknown as FakeEl;
        expect([...contentEl.walk()].some((e) => e.tag === 'button')).toBe(false);
    });

    it('writes exactly the newest-first row text to the clipboard and reports the count', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        const { copy, expected } = openWithTwoEntries();
        expect(copy.text).toBe('Copy');
        copy.listeners.click[0]();
        expect(writeText).toHaveBeenCalledTimes(1);
        expect(writeText).toHaveBeenCalledWith(expected);
        await Promise.resolve();
        await Promise.resolve();
        expect(notices()).toEqual(['H1Aligner: activity log copied (2)']);
    });

    it('shows the failure notice when the write is rejected', async () => {
        const writeText = vi.fn().mockRejectedValue(new Error('denied'));
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        const { copy } = openWithTwoEntries();
        copy.listeners.click[0]();
        await Promise.resolve();
        await Promise.resolve();
        expect(notices()).toEqual(['H1Aligner: could not copy to the clipboard']);
    });

    it('shows the failure notice (and does not throw) when the clipboard API is missing', () => {
        vi.stubGlobal('navigator', {});
        const { copy } = openWithTwoEntries();
        expect(() => copy.listeners.click[0]()).not.toThrow();
        expect(notices()).toEqual(['H1Aligner: could not copy to the clipboard']);
    });

    it('shows the failure notice when writeText throws synchronously', () => {
        vi.stubGlobal('navigator', {
            clipboard: {
                writeText: () => {
                    throw new Error('sync');
                },
            },
        });
        const { copy } = openWithTwoEntries();
        expect(() => copy.listeners.click[0]()).not.toThrow();
        expect(notices()).toEqual(['H1Aligner: could not copy to the clipboard']);
    });
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
        expect(contentEl.children.map((c) => c.tag)).toEqual(['h3', 'button', 'div']);
        const list = contentEl.children[2];
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
