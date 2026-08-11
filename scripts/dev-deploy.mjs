/**
 * dev-deploy.mjs — build the plugin and deploy it to local test vaults with
 * a marker that's visibly different from the last published release, so
 * it's obvious at a glance whether a vault is running local, unreleased
 * work or the real published version.
 *
 * IMPORTANT: this only ever touches manifest.json's `description` field,
 * never `version`. Obsidian's community-plugin update check flags any
 * installed version string that differs from what it has on record as "an
 * update is available" — an earlier version of this script changed
 * `version` instead, which made Obsidian repeatedly offer to "update" a
 * dev build back down to the last real release. One accidental tap on that
 * button silently overwrites all local unreleased work. `description` is
 * pure display text Obsidian never uses for version comparison, so this
 * can't happen.
 *
 * Never touches package.json/manifest.json/versions.json in the repo — the
 * marker only exists in the copies written to each vault.
 * `npm run version` (the real release flow, see RELEASING.md) is completely
 * unaffected by this.
 *
 * Usage: node scripts/dev-deploy.mjs
 */
import { execFileSync } from "child_process";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "fs";
import { join } from "path";

// This machine's local vaults only — not portable, not meant to be.
const VAULTS = [
    "/Users/aikenlin/Obsidian/ObsidianVault",
    "/Users/aikenlin/Obsidian/ObsidianTestVault/ObsidianTestVault",
];

console.log("Building...");
execFileSync("npm", ["run", "build"], { stdio: "inherit" });

const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
const dirty = execFileSync("git", ["status", "--porcelain"]).toString().trim().length > 0;
const marker = `[dev build ${commit}${dirty ? ".dirty" : ""}]`;

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
// manifest.json's own `version` is left untouched — see the file header.
manifest.description = `${manifest.description} ${marker}`;
const devManifest = JSON.stringify(manifest, null, 4) + "\n";

for (const vault of VAULTS) {
    const dest = join(vault, ".obsidian/plugins/heading-aligner");
    mkdirSync(dest, { recursive: true });
    copyFileSync("main.js", join(dest, "main.js"));
    writeFileSync(join(dest, "manifest.json"), devManifest);
    copyFileSync("styles.css", join(dest, "styles.css"));
    console.log(`Deployed ${marker} -> ${vault}`);
}

console.log(
    "\nReload the plugin (or restart Obsidian) in each vault to pick up the change.",
);
