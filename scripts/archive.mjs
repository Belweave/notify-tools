// SPDX-License-Identifier: Apache-2.0
import { assertSupportedNode } from "../src/runtime/node.mjs";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
assertSupportedNode();

const { version } = JSON.parse(await readFile("dist/manifest.json", "utf8"));
const folder = `artifacts/release-${version}-${Date.now()}`;
await mkdir(folder, { recursive: true });
const filename = `notify-tools-${version}.tar.gz`;
execFileSync("tar", ["-czf", `${folder}/${filename}`, "-C", "dist", "."], {
  stdio: "inherit",
  env: { ...process.env, COPYFILE_DISABLE: "1" },
});
const digest = createHash("sha256")
  .update(await readFile(`${folder}/${filename}`))
  .digest("hex");
await writeFile(`${folder}/SHA256SUMS`, `${digest}  ${filename}\n`);
console.log(folder);
