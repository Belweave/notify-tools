// SPDX-License-Identifier: Apache-2.0
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir, readdir, cp, chmod, rename } from "node:fs/promises";
import { dirname, resolve, relative, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const pkg = JSON.parse(await readFile("package.json", "utf8"));
// Preserve previous build output for inspection instead of deleting it.
try {
  await rename("dist", `artifacts/build-${Date.now()}`);
} catch (error) {
  if (error.code === "ENOENT") {
    await mkdir("artifacts", { recursive: true });
    try {
      await rename("dist", `artifacts/build-${Date.now()}`);
    } catch (retry) {
      if (retry.code !== "ENOENT") throw retry;
    }
  } else throw error;
}
await mkdir("dist", { recursive: true });
const common = {
  bundle: true,
  format: "esm",
  target: "node22",
  splitting: true,
  metafile: true,
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
};
const outputs = [];
outputs.push(
  await build({
    ...common,
    platform: "node",
    entryPoints: { notify: "bin/notify.mjs" },
    outdir: "dist/cli",
    define: { NOTIFY_BUNDLED_CLI: "true" },
  }),
);
outputs.push(
  await build({
    ...common,
    platform: "node",
    entryPoints: {
      server: "src/microauth/server.ts",
      connector: "src/connector/index.ts",
    },
    outdir: "dist/sdk",
  }),
);
outputs.push(
  await build({
    ...common,
    platform: "browser",
    target: "es2022",
    entryPoints: { browser: "src/microauth/browser.ts" },
    outdir: "dist/sdk",
  }),
);
await chmod("dist/cli/notify.mjs", 0o755);
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc"], {
  stdio: "inherit",
});
await cp("dist/types", "dist/sdk/types", { recursive: true });
await cp("node_modules/jose/dist/types", "dist/sdk/types/jose", {
  recursive: true,
});
async function declarations(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await declarations(path);
    else if (entry.name.endsWith(".d.ts")) {
      let jose = relative(dirname(path), "dist/sdk/types/jose/index.mjs").split("\\").join("/");
      if (!jose.startsWith(".")) jose = `./${jose}`;
      const content = (await readFile(path, "utf8"))
        .replace(/(["'][^"']+)\.js(["'])/g, "$1.mjs$2")
        .replace(/(["'])jose\1/g, JSON.stringify(jose));
      await writeFile(path.replace(/\.d\.ts$/, ".d.mts"), content);
    }
  }
}
await declarations("dist/sdk/types");
for (const [name, entry] of Object.entries({
  browser: "microauth/browser",
  server: "microauth/server",
  connector: "connector/index",
})) {
  await writeFile(`dist/sdk/${name}.d.mts`, `export * from './types/${entry}.mjs';\n`);
}
const packages = new Map();
for (const result of outputs)
  for (const input of Object.keys(result.metafile.inputs)) {
    if (!input.includes("node_modules/")) continue;
    let dir = dirname(resolve(input));
    while (dir !== dirname(dir)) {
      try {
        const dependency = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
        if (dependency.name) {
          packages.set(`${dependency.name}@${dependency.version}`, {
            dir,
            dependency,
          });
          break;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      dir = dirname(dir);
    }
  }
await mkdir("dist/licenses", { recursive: true });
const notices = [];
for (const [id, { dir, dependency }] of [...packages].sort()) {
  let licenseDirectory = dir;
  let names = (await readdir(dir)).filter((name) =>
    /^(license|licence|copying|notice)(\.|$)/i.test(name),
  );
  if (!names.some((name) => /^(license|licence|copying)/i.test(name))) {
    const upstream = dependency.name.startsWith("@opencode-ai/")
      ? "opencode"
      : dependency.name.startsWith("@opentunnel/")
        ? "opentunnel"
        : undefined;
    if (upstream) {
      licenseDirectory = `third-party/${upstream}`;
      names = (await readdir(licenseDirectory)).filter((name) =>
        /^(license|notice)(\.|$)/i.test(name),
      );
    }
  }
  if (!names.some((name) => /^(license|licence|copying)/i.test(name)))
    throw new Error(`Missing bundled dependency license: ${id}`);
  const destination = `dist/licenses/${id.replaceAll("/", "__")}`;
  await mkdir(destination, { recursive: true });
  for (const name of names) await cp(join(licenseDirectory, name), join(destination, name));
  notices.push(`${id} — ${dependency.license ?? "see included license"}`);
}
await writeFile(
  "dist/THIRD-PARTY-NOTICES.txt",
  `Bundled third-party software\n\n${notices.join("\n")}\n\nFull license and notice texts are in licenses/.\n`,
);
for (const name of ["LICENSE", "README.md", "skills"])
  await cp(name, `dist/${name}`, { recursive: true });
await cp("scripts/install.mjs", "dist/install.mjs");
await mkdir("dist/examples/microauth", { recursive: true });
await writeFile(
  "dist/examples/microauth/node-session.mjs",
  (await readFile("examples/microauth/node-session.mjs", "utf8")).replace(
    "../../dist/sdk/server.mjs",
    "../../sdk/server.mjs",
  ),
);
await writeFile(
  "dist/manifest.json",
  `${JSON.stringify({ name: pkg.name, version: pkg.version, license: pkg.license, node: pkg.engines.node }, null, 2)}\n`,
);
await writeFile(
  "artifacts/build-metafiles.json",
  JSON.stringify(outputs.map((result) => result.metafile)),
);
