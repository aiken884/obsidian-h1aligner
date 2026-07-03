/**
 * version-bump.mjs — runs from the `npm version` lifecycle script.
 *
 * npm has already bumped package.json when this runs; we mirror the new
 * version into manifest.json and add a versions.json entry mapping it to
 * the current minAppVersion. `.npmrc` sets tag-version-prefix="" so the
 * git tag npm creates is `X.Y.Z` (no `v`), as the Obsidian release
 * pipeline requires.
 */
import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
    console.error("version-bump.mjs must run via `npm version <patch|minor|major>`");
    process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 4) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 4) + "\n");
