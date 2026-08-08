import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    ...obsidianmd.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parserOptions: { project: './tsconfig.json' },
        },
        rules: {
            // Declarative settings API requires Obsidian 1.13+; this plugin
            // supports 1.8+ (getLanguage floor). Revisit when the floor rises.
            'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
        },
    },
    {
        // settings-tab.ts implements BOTH the declarative Settings API
        // (getSettingDefinitions/getControlValue/setControlValue,
        // refreshDomState, SettingGroup#listEl — all 1.13.0+) AND the
        // imperative display() fallback for < 1.13.0. Obsidian itself only
        // ever calls one or the other depending on the running app version,
        // so the 1.13.0+ calls are unreachable on older runtimes and safe.
        // `no-unsupported-api` can't be scoped below file granularity and
        // this project disallows inline eslint-disable for it (see below),
        // so the floor is raised for this file only. Trade-off: display()
        // itself is no longer checked against the real 1.8.0 floor here —
        // if it's edited to call something newer than 1.8.0, this won't
        // catch it. Keep display() free of anything newer than 1.8.0 by hand.
        files: ['src/settings-tab.ts'],
        rules: {
            'obsidianmd/no-unsupported-api': ['error', { minAppVersion: '1.13.0' }],
        },
    },
    { ignores: ['main.js', 'tests/**', 'node_modules/**', '*.mjs'] },
);
