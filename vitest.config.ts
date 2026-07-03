import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        coverage: {
            // main.ts and settings-tab.ts are thin obsidian-coupled shells;
            // their logic lives in the pure modules below and their wiring is
            // exercised by the E2E smoke test against the built bundle.
            include: ['src/**/*.ts'],
        },
    },
});
