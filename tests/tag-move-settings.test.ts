import { describe, it, expect } from 'vitest';
import { batchSettingsFingerprint, DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';

describe('tag move settings normalization', () => {
    it('defaults: off, keep, empty ignore list', () => {
        expect(DEFAULT_SETTINGS.moveTagsToFrontmatter).toBe(false);
        expect(DEFAULT_SETTINGS.bodyTagHandling).toBe('keep');
        expect(DEFAULT_SETTINGS.tagsToIgnoreForMove).toEqual([]);
        const out = normalizeSettings(null);
        expect(out.moveTagsToFrontmatter).toBe(false);
        expect(out.bodyTagHandling).toBe('keep');
        expect(out.tagsToIgnoreForMove).toEqual([]);
    });

    it('accepts valid values', () => {
        const out = normalizeSettings({
            moveTagsToFrontmatter: true,
            bodyTagHandling: 'remove-tag',
            tagsToIgnoreForMove: ['a', 'b/c'],
        });
        expect(out.moveTagsToFrontmatter).toBe(true);
        expect(out.bodyTagHandling).toBe('remove-tag');
        expect(out.tagsToIgnoreForMove).toEqual(['a', 'b/c']);
    });

    it('rejects wrong-typed values back to defaults', () => {
        const out = normalizeSettings({
            moveTagsToFrontmatter: 'yes',
            bodyTagHandling: 'delete-everything',
            tagsToIgnoreForMove: 'not-an-array',
        });
        expect(out.moveTagsToFrontmatter).toBe(false);
        expect(out.bodyTagHandling).toBe('keep');
        expect(out.tagsToIgnoreForMove).toEqual([]);
    });

    it('strips leading # and empty entries from the ignore list', () => {
        const out = normalizeSettings({
            tagsToIgnoreForMove: ['#tag', '  #a/b  ', '', '   ', 42, '#'],
        });
        expect(out.tagsToIgnoreForMove).toEqual(['tag', 'a/b']);
    });

    it('does not share the default ignore array between instances', () => {
        const a = normalizeSettings(null);
        a.tagsToIgnoreForMove.push('mutated');
        expect(normalizeSettings(null).tagsToIgnoreForMove).toEqual([]);
        expect(DEFAULT_SETTINGS.tagsToIgnoreForMove).toEqual([]);
    });

    it('changing any tag-move setting invalidates the batch fingerprint', () => {
        const base = batchSettingsFingerprint(DEFAULT_SETTINGS);
        expect(batchSettingsFingerprint({ ...DEFAULT_SETTINGS, moveTagsToFrontmatter: true })).not.toBe(base);
        expect(batchSettingsFingerprint({ ...DEFAULT_SETTINGS, bodyTagHandling: 'remove-tag' })).not.toBe(base);
        expect(batchSettingsFingerprint({ ...DEFAULT_SETTINGS, tagsToIgnoreForMove: ['x'] })).not.toBe(base);
    });
});
