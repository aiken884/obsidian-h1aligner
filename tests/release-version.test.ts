import { describe, it, expect } from 'vitest';
import { checkReleaseVersion } from '../scripts/check-release-version.mjs';

const ok = {
    tag: '0.13.0',
    manifest: { version: '0.13.0', minAppVersion: '1.13.0' },
    pkg: { version: '0.13.0' },
    versions: { '0.12.0': '1.13.0', '0.13.0': '1.13.0' },
};

describe('checkReleaseVersion', () => {
    it('accepts a tag that matches manifest, package and versions.json', () => {
        expect(checkReleaseVersion(ok)).toEqual([]);
    });

    it('rejects a v-prefixed tag (the plugin loader needs the bare version)', () => {
        const errors = checkReleaseVersion({ ...ok, tag: 'v0.13.0' });
        expect(errors.join('\n')).toMatch(/v0\.13\.0/);
    });

    it('rejects a non-semver tag', () => {
        expect(checkReleaseVersion({ ...ok, tag: 'nightly' }).length).toBeGreaterThan(0);
        expect(checkReleaseVersion({ ...ok, tag: '' }).length).toBeGreaterThan(0);
    });

    it('rejects a manifest.json version that differs from the tag', () => {
        const errors = checkReleaseVersion({ ...ok, manifest: { ...ok.manifest, version: '0.12.0' } });
        expect(errors.join('\n')).toMatch(/manifest\.json/);
    });

    it('rejects a package.json version that differs from the tag', () => {
        const errors = checkReleaseVersion({ ...ok, pkg: { version: '0.12.0' } });
        expect(errors.join('\n')).toMatch(/package\.json/);
    });

    it('rejects a versions.json without an entry for the tag', () => {
        const errors = checkReleaseVersion({ ...ok, versions: { '0.12.0': '1.13.0' } });
        expect(errors.join('\n')).toMatch(/versions\.json/);
    });

    it('rejects a versions.json entry that is not the manifest minAppVersion', () => {
        const errors = checkReleaseVersion({ ...ok, versions: { '0.13.0': '1.8.7' } });
        expect(errors.join('\n')).toMatch(/minAppVersion/);
    });

    it('reports every problem at once', () => {
        const errors = checkReleaseVersion({
            tag: '0.13.0',
            manifest: { version: '0.12.0', minAppVersion: '1.13.0' },
            pkg: { version: '0.12.0' },
            versions: {},
        });
        expect(errors.length).toBe(3);
    });

    it('does not throw on missing or malformed inputs', () => {
        expect(() => checkReleaseVersion({ tag: '0.13.0', manifest: null, pkg: null, versions: null })).not.toThrow();
        expect(checkReleaseVersion({ tag: '0.13.0', manifest: null, pkg: null, versions: null }).length).toBeGreaterThan(0);
    });
});
