// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { request } from "../foundation/transport.mjs";
import { rm } from "node:fs/promises";

export async function handleAuth(context) {
  const { action, config } = context;
  if (action === "logout") {
    let revoked = false;
    try {
      await request(config, "/api/agent/auth/revoke", { method: "POST" });
      revoked = true;
    } catch {
      // Local credentials are removed even if the server is unreachable or already revoked.
    }
    if (config.source === "file") await rm(config.path, { force: true });
    return {
      body: {
        authenticated: false,
        revoked,
        credentialsRemoved: config.source === "file",
      },
      exitCode: 0,
    };
  }
  if (action === "status") {
    return {
      body: await request(config, "/api/agent/auth/status"),
      exitCode: 0,
    };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
