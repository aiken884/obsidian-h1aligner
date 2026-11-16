import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        // `obsidian` ships types only; give runtime imports (parseYaml) a stub.
        alias: { obsidian: new URL('./tests/obsidian-stub.ts', import.meta.url).pathname },
    },
    test: {
        // styles.css is asserted on as raw text (tests/activity-modal.test.ts).
        css: { include: [/styles\.css/] },
        setupFiles: ['tests/setup.ts'],
        coverage: {
            // main.ts and settings-tab.ts are thin obsidian-coupled shells;
            // their logic lives in the pure modules below and their wiring is
            // exercised by the E2E smoke test against the built bundle.
            include: ['src/**/*.ts'],
        },
    },
});
