/**
 * dev-deploy.mjs — build the plugin and deploy it to local test vaults with
 * a version string that's visibly different from the last published
 * release, so Obsidian's plugin list makes it obvious at a glance whether
 * a vault is running local, unreleased work or the real published version.
 *
 * Never touches package.json/manifest.json/versions.json in the repo — the
 * dev version string only exists in the copies written to each vault.
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

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const [major, minor] = pkg.version.split(".").map(Number);
const nextVersion = `${major}.${minor + 1}.0`;
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
const dirty = execFileSync("git", ["status", "--porcelain"]).toString().trim().length > 0;
const devVersion = `${nextVersion}-dev+${commit}${dirty ? ".dirty" : ""}`;

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = devVersion;
const devManifest = JSON.stringify(manifest, null, 4) + "\n";

for (const vault of VAULTS) {
    const dest = join(vault, ".obsidian/plugins/heading-aligner");
    mkdirSync(dest, { recursive: true });
    copyFileSync("main.js", join(dest, "main.js"));
    writeFileSync(join(dest, "manifest.json"), devManifest);
    copyFileSync("styles.css", join(dest, "styles.css"));
    console.log(`Deployed ${devVersion} -> ${vault}`);
}

console.log(
    "\nReload the plugin (or restart Obsidian) in each vault to pick up the new version.",
);
