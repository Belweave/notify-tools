// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { miniAppsCommand } from "./mini-app-package.mjs";
import { UsageError } from "../foundation/errors.mjs";
import { requestBytes, scopedRequest } from "../foundation/transport.mjs";

export async function handleMiniApps({ action, id, positionals, options, config }) {
  if (options.output !== undefined && action !== "archive") {
    throw new UsageError("--output applies only to mini-apps archive");
  }
  if (action === "archive" && options.output) {
    if (!/^[a-f0-9]{64}$/.test(id ?? "")) throw new UsageError("archive requires package SHA-256");
    // The package ID is the SHA-256 of the archive, so the exact bytes are verifiable.
    const bytes = await requestBytes(config, `/api/agent/mini-apps/${id}/archive`);
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== id) throw new Error("Downloaded archive does not match its package ID; nothing was written");
    try {
      await writeFile(options.output, bytes, { flag: "wx", mode: 0o644 });
    } catch (error) {
      if (error?.code === "EEXIST") throw new UsageError(`${options.output} already exists; choose a new --output path`);
      throw error;
    }
    return { body: { packageId: id, path: options.output, bytes: bytes.length }, exitCode: 0 };
  }
  return { body: await miniAppsCommand(action, id, positionals[3],
    (path, init) => scopedRequest(config, path, init), options), exitCode: 0 };
}
