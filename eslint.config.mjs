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
    { ignores: ['main.js', 'tests/**', 'node_modules/**', '*.mjs'] },
);
