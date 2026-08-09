/**
 * batch-modal.test.ts — proves the batch preview's reason column and the
 * manual-command skip Notice (src/notice.ts) describe every RenameSkipReason
 * identically, both going through the shared src/skip-reason.ts mapping
 * instead of either surface leaking the raw internal enum value.
 *
 * The `obsidian` package ships type declarations only (its package.json
 * "main" is ""), so the real Modal class can't be constructed in Node.
 * vi.mock stubs just enough of it to drive BatchPreviewModal's real,
 * unmodified onOpen() logic. Same technique as activity-modal.test.ts /
 * onboarding-modal.test.ts.
 */
import { describe, it, expect, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
import { BatchPreviewModal, BatchItem } from '../src/batch-modal';
import { noticeFor } from '../src/notice';
import { describeSkipReason } from '../src/skip-reason';
import type { RenameOutcome, RenameSkipReason } from '../src/rename-service';

interface FakeEl {
    tag: string;
    text: string;
    children: FakeEl[];
    addedClasses: string[];
    open?: boolean;
    walk(): Generator<FakeEl>;
}

vi.mock('obsidian', () => {
    class FakeElImpl implements FakeEl {
        tag: string;
        text: string;
        children: FakeElImpl[] = [];
        addedClasses: string[] = [];
        open?: boolean;
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
        addEventListener(): void {
            // Not exercised: this suite never clicks buttons.
        }
        setAttribute(): void {
            // Not exercised: this suite always passes canApply: true with
            // zero renamable items, so the disabled/aria-describedby path
            // in onOpen() never runs.
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

// Every RenameSkipReason the manual command can actually surface as a skip
// (i.e. everything but 'none', which is the "not skipped" case) — the same
// list notice.test.ts exercises for noticeFor().
const SKIP_REASONS: RenameSkipReason[] = [
    'no-h1',
    'locked',
    'case-only',
    'collision',
    'empty-after-sanitize',
    'same-name',
    'in-progress',
];

function makeItem(reason: RenameSkipReason): BatchItem {
    return {
        file: {} as TFile,
        from: 'note.md',
        to: null,
        status: reason === 'collision' ? 'conflict' : 'skipped',
        reason,
    };
}

function buildModal(items: BatchItem[]): BatchPreviewModal {
    return new BatchPreviewModal(
        {} as unknown as App,
        items,
        true,
        false,
        async () => {},
    );
}

describe('BatchPreviewModal reason column', () => {
    it.each(SKIP_REASONS)(
        "describeReason(%s) matches the shared describeSkipReason mapping — same text notice.ts's manual skip Notice shows for this exact RenameSkipReason",
        (reason) => {
            const modal = buildModal([]);
            // describeReason is private; tests reach it the same way the
            // real per-row and grouped-count rendering paths do (both call
            // `this.describeReason(item)` with a { reason } shaped object).
            const fromBatchModal = (
                modal as unknown as { describeReason(item: { reason: string }): string }
            ).describeReason({ reason });

            expect(fromBatchModal).toBe(describeSkipReason(reason));

            // Cross-check against the actual manual-command Notice text for
            // the same RenameSkipReason, proving the two user-facing
            // surfaces agree, not just that they both call the same helper.
            const outcome: RenameOutcome = { skipped: reason, newName: null };
            const manualNotice = noticeFor(outcome, true, 'off');
            expect(manualNotice).toBe(`H1Aligner: skipped (${fromBatchModal})`);

            // Regression guard: neither surface leaks the raw enum value.
            expect(fromBatchModal).not.toBe(reason);
        },
    );

    it('renders the localized reason (not the raw enum value) in the actual DOM for a skipped group', () => {
        const items = ['no-h1', 'locked'].map((r) => makeItem(r as RenameSkipReason));
        const modal = buildModal(items);
        modal.open();

        const contentEl = modal.contentEl as unknown as FakeEl;
        const allText = [...contentEl.walk()].map((e) => e.text).join(' | ');

        expect(allText).toContain(describeSkipReason('no-h1'));
        expect(allText).toContain(describeSkipReason('locked'));
        // The raw enum values must not appear as standalone rendered text.
        expect(allText).not.toContain('1 × no-h1');
        expect(allText).not.toContain('1 × locked');
    });

    it('renders the localized reason in the actual DOM for a conflict row (collision)', () => {
        const modal = buildModal([makeItem('collision')]);
        modal.open();

        const contentEl = modal.contentEl as unknown as FakeEl;
        const allText = [...contentEl.walk()].map((e) => e.text).join(' | ');

        expect(allText).toContain(describeSkipReason('collision'));
        expect(allText).not.toContain('note.md collision');
    });
});
