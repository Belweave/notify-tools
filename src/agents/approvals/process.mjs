// SPDX-License-Identifier: Apache-2.0
import { spawn } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const notifyPath =
  typeof NOTIFY_BUNDLED_CLI !== "undefined" && NOTIFY_BUNDLED_CLI
    ? process.argv[1]
    : join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "bin", "notify.mjs");

export function notifyEnvironment() {
  return {
    ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
    ...(process.env.USER ? { USER: process.env.USER } : {}),
    ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
    ...(process.env.NOTIFY_CONFIG ? { NOTIFY_CONFIG: process.env.NOTIFY_CONFIG } : {}),
    ...(process.env.XDG_CONFIG_HOME ? { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME } : {}),
    ...(process.env.APPDATA ? { APPDATA: process.env.APPDATA } : {}),
  };
}

export function runNotify(args, input, captureOutput = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [notifyPath, ...args], {
      env: notifyEnvironment(),
      stdio: [input === undefined ? "ignore" : "pipe", captureOutput ? "pipe" : "ignore", "ignore"],
    });
    const chunks = [];
    if (captureOutput) {
      child.stdout.on("data", (chunk) => {
        if (chunks.reduce((total, item) => total + item.length, 0) < 1024 * 1024)
          chunks.push(chunk);
      });
    }
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve({
        code: code ?? 1,
        signal,
        output: captureOutput ? Buffer.concat(chunks).toString("utf8") : "",
      });
    });
    if (input !== undefined) child.stdin.end(input);
  });
}
