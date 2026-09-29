#!/usr/bin/env node
/**
 * check-release-version.mjs — fail a release build early when the pushed tag
 * does not match the version files.
 *
 * The community plugin loader needs the GitHub release tag to be exactly the
 * manifest version (no `v` prefix), and `versions.json` must map that version
 * to the manifest's `minAppVersion`. `release.yml` runs this as its first step
 * so a mismatched tag never reaches the build/attest/draft-release steps.
 *
 * Usage: node scripts/check-release-version.mjs [tag]   (default: $GITHUB_REF_NAME)
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+$/;

/**
 * Pure check. Returns a list of human-readable problems (empty = consistent).
 * Never throws, so a malformed input is reported instead of crashing the step.
 *
 * @param {{ tag: unknown, manifest: any, pkg: any, versions: any }} input
 * @returns {string[]}
 */
export function checkReleaseVersion({ tag, manifest, pkg, versions }) {
    const errors = [];
    if (typeof tag !== 'string' || !SEMVER.test(tag)) {
        errors.push(`tag "${String(tag)}" is not a bare X.Y.Z version (no "v" prefix)`);
        return errors;
    }
    const manifestVersion = manifest && manifest.version;
    if (manifestVersion !== tag) {
        errors.push(`manifest.json version "${String(manifestVersion)}" does not match tag "${tag}"`);
    }
    const pkgVersion = pkg && pkg.version;
    if (pkgVersion !== tag) {
        errors.push(`package.json version "${String(pkgVersion)}" does not match tag "${tag}"`);
    }
    const minApp = manifest && manifest.minAppVersion;
    const mapped = versions && Object.prototype.hasOwnProperty.call(versions, tag) ? versions[tag] : undefined;
    if (mapped === undefined) {
        errors.push(`versions.json has no entry for "${tag}"`);
    } else if (mapped !== minApp) {
        errors.push(
            `versions.json maps "${tag}" to "${String(mapped)}" but manifest.json minAppVersion is "${String(minApp)}"`,
        );
    }
    return errors;
}

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
    let errors;
    try {
        errors = checkReleaseVersion({
            tag,
            manifest: readJson('manifest.json'),
            pkg: readJson('package.json'),
            versions: readJson('versions.json'),
        });
    } catch (e) {
        errors = [`could not read the version files: ${e instanceof Error ? e.message : String(e)}`];
    }
    if (errors.length > 0) {
        for (const message of errors) console.error(`::error::${message}`);
        process.exit(1);
    }
    console.log(`Release tag ${tag} matches manifest.json, package.json and versions.json.`);
}
