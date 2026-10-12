// SPDX-License-Identifier: Apache-2.0
import { build } from "esbuild";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const app = fileURLToPath(new URL("./", import.meta.url));
const out = resolve(root, "artifacts/microauth-playground");
const origin = new URL(process.env.APP_ORIGIN ?? "https://notify-microauth-playground.example.workers.dev");
if (origin.protocol !== "https:" || origin.origin !== origin.href.replace(/\/$/, "")) throw new Error("APP_ORIGIN must be an HTTPS origin");
await mkdir(out, { recursive: true });
await cp(resolve(app, "public"), resolve(out, "public"), { recursive: true });
await build({ entryPoints: [resolve(app, "worker.mjs")], outfile: resolve(out, "worker.mjs"), bundle: true, format: "esm", platform: "neutral", target: "es2022", external: ["node:crypto"], legalComments: "eof" });
await build({ entryPoints: [resolve(app, "browser.mjs")], outfile: resolve(out, "public/app.js"), bundle: true, format: "esm", platform: "browser", target: "es2022", legalComments: "eof" });
await writeFile(resolve(out, "wrangler.json"), JSON.stringify({
  name: "notify-microauth-playground",
  main: "worker.mjs",
  compatibility_date: "2026-10-01",
  compatibility_flags: ["nodejs_compat"],
  workers_dev: true,
  preview_urls: false,
  assets: { directory: "./public", binding: "ASSETS", run_worker_first: true },
  vars: { APP_ORIGIN: origin.origin, NOTIFY_APP_ID: process.env.NOTIFY_APP_ID ?? "" },
  durable_objects: { bindings: [{ name: "AUTH_STATE", class_name: "MicroAuthState" }] },
  migrations: [{ tag: "v1", new_sqlite_classes: ["MicroAuthState"] }],
  observability: { enabled: false },
}, null, 2));
console.log(`Built ${out}`);
