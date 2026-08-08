/**
 * onboarding-modal.test.ts — unit coverage for OnboardingModal.
 *
 * The e2e smoke test (tests/e2e/e2e-smoke.cjs) only ever clicks the
 * "Keep automatic" button. This file drives the two paths it doesn't
 * reach: the "Manual only" button (onChoice('manual')) and dismissal
 * without a choice — onClose() firing onChoice(null), exactly as Obsidian
 * does on Esc or a click outside the modal.
 *
 * The `obsidian` package ships type declarations only (its package.json
 * "main" is ""), so the real Modal class can't be constructed in Node.
 * vi.mock stubs just enough of it — a DOM-ish contentEl with
 * createEl/createDiv/addEventListener — to drive OnboardingModal's real,
 * unmodified onOpen()/onClose() logic. Same technique as
 * activity-modal.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { OnboardingModal } from '../src/onboarding-modal';

interface FakeEl {
    tag: string;
    text: string;
    children: FakeEl[];
    listeners: Record<string, Array<() => void>>;
    walk(): Generator<FakeEl>;
}

vi.mock('obsidian', () => {
    class FakeElImpl implements FakeEl {
        tag: string;
        text: string;
        children: FakeElImpl[] = [];
        listeners: Record<string, Array<() => void>> = {};
        classList = { add: (..._cls: string[]) => {} };
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
        empty(): void {
            this.children = [];
        }
        addEventListener(evt: string, cb: () => void): void {
            (this.listeners[evt] = this.listeners[evt] || []).push(cb);
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

function buttons(contentEl: unknown): FakeEl[] {
    return [...(contentEl as FakeEl).walk()].filter((e) => e.tag === 'button');
}

describe('OnboardingModal', () => {
    it('"Manual only" calls onChoice(\'manual\') and does not ALSO fire onChoice(null) via onClose', () => {
        const onChoice = vi.fn(async (_trigger: 'file-open' | 'manual' | null) => {});
        const modal = new OnboardingModal({} as unknown as App, onChoice);
        modal.open();

        const [manual] = buttons(modal.contentEl);
        expect(manual.text).toBe('Start with Manual only');

        manual.listeners.click[0]();

        // The handler sets `chose = true` before calling close(), so
        // onClose()'s dismissal guard must not double-report.
        expect(onChoice).toHaveBeenCalledTimes(1);
        expect(onChoice).toHaveBeenCalledWith('manual');
    });

    it('"Keep automatic" calls onChoice(\'file-open\') (control case, already covered by e2e too)', () => {
        const onChoice = vi.fn(async (_trigger: 'file-open' | 'manual' | null) => {});
        const modal = new OnboardingModal({} as unknown as App, onChoice);
        modal.open();

        const [, keep] = buttons(modal.contentEl);
        expect(keep.text).toBe('Keep automatic (on file open)');

        keep.listeners.click[0]();

        expect(onChoice).toHaveBeenCalledTimes(1);
        expect(onChoice).toHaveBeenCalledWith('file-open');
    });

    it('dismissing without a choice (Esc / click-outside → onClose directly) calls onChoice(null)', () => {
        const onChoice = vi.fn(async (_trigger: 'file-open' | 'manual' | null) => {});
        const modal = new OnboardingModal({} as unknown as App, onChoice);
        modal.open();

        // Obsidian invokes onClose() directly on Esc / click-outside —
        // neither button's click handler ran first.
        modal.close();

        expect(onChoice).toHaveBeenCalledTimes(1);
        expect(onChoice).toHaveBeenCalledWith(null);
    });
});
