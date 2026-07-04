/**
 * onboarding-modal.ts — one-time first-run explanation of the one-way
 * H1 → filename contract, with a choice between the automatic default
 * and a cautious Manual-only start.
 */
import { App, Modal } from 'obsidian';
import { t } from './i18n';

export class OnboardingModal extends Modal {
    private chose = false;

    /**
     * onChoice(null) means the modal was dismissed (Esc / click outside):
     * record onboarding as done without changing any setting.
     */
    constructor(
        app: App,
        private readonly onChoice: (trigger: 'file-open' | 'manual' | null) => Promise<void>,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h3', { text: t('onboard.title') });
        contentEl.createEl('p', { text: t('onboard.body1') });
        contentEl.createEl('p', { text: t('onboard.body2') });

        const buttons = contentEl.createDiv();
        buttons.classList.add('h1aligner-buttons');

        const manual = buttons.createEl('button', { text: t('onboard.manualOnly') });
        manual.addEventListener('click', () => {
            this.chose = true;
            this.close();
            void this.onChoice('manual');
        });

        const keep = buttons.createEl('button', { text: t('onboard.keepAuto') });
        keep.classList.add('mod-cta');
        keep.addEventListener('click', () => {
            this.chose = true;
            this.close();
            void this.onChoice('file-open');
        });
    }

    onClose(): void {
        this.contentEl.empty();
        // Dismissal still counts as "seen" — otherwise the one-time dialog
        // would reappear on every launch.
        if (!this.chose) void this.onChoice(null);
    }
}
