#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { assertSupportedNode } from "../src/runtime/node.mjs";
import { readFile, mkdir, lstat, readlink, cp, symlink, chmod, rename } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

assertSupportedNode();

const source = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "node install.mjs [--prefix DIR] [--dry-run]\nDefault prefix: ~/.local. Installs a versioned release and bin/notify.",
  );
  process.exit(0);
}
let prefix = join(homedir(), ".local");
let dryRun = false;
for (let index = 0; index < args.length; index++) {
  if (args[index] === "--dry-run") dryRun = true;
  else if (args[index] === "--prefix" && args[index + 1] && !args[index + 1].startsWith("--"))
    prefix = resolve(args[++index]);
  else throw new Error(`Unknown or incomplete option: ${args[index]}`);
}
if (process.platform === "win32")
  throw new Error("On Windows, run node cli/notify.mjs directly from the extracted release.");
const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.version))
  throw new Error("Invalid release version.");
const releases = join(prefix, "share", "notify-tools");
const destination = join(releases, manifest.version);
const binary = join(prefix, "bin", "notify");
const target = join(destination, "cli", "notify.mjs");
try {
  const current = await lstat(binary);
  const existing = current.isSymbolicLink() ? resolve(dirname(binary), await readlink(binary)) : "";
  const suffix = existing.slice(releases.length + 1);
  if (
    !existing.startsWith(`${releases}/`) ||
    !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?\/cli\/notify\.mjs$/.test(suffix)
  )
    throw new Error(`Refusing to replace an unmanaged file: ${binary}`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let installed = false;
try {
  const current = JSON.parse(await readFile(join(destination, "manifest.json"), "utf8"));
  if (current.name !== manifest.name || current.version !== manifest.version)
    throw new Error(`Existing installation differs: ${destination}`);
  installed = true;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
console.log(
  `${dryRun ? "Would install" : "Installing"} Notify ${manifest.version} in ${destination}`,
);
if (!dryRun) {
  await mkdir(dirname(binary), { recursive: true });
  await mkdir(releases, { recursive: true });
  if (!installed) {
    // Copy to a unique staging directory; never overwrite an earlier release.
    const staging = `${destination}.install-${process.pid}-${Date.now()}`;
    await cp(source, staging, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await chmod(join(staging, "cli", "notify.mjs"), 0o755);
    try {
      await lstat(destination);
      throw new Error(`Destination already exists: ${destination}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await rename(staging, destination);
  }
  const temporary = `${binary}.install-${process.pid}-${Date.now()}`;
  await symlink(target, temporary);
  await rename(temporary, binary);
}
console.log(`Add ${join(prefix, "bin")} to PATH, then run: notify --help`);
