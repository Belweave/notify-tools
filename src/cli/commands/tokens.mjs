// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { scopedRequest } from "../foundation/transport.mjs";
import { requireId } from "../foundation/validation.mjs";

export async function handleTokens(context) {
  const { action, id, config } = context;
  if (action === "list") {
    return {
      body: await scopedRequest(config, "/api/agent/tokens"),
      exitCode: 0,
    };
  }
  if (action === "revoke") {
    const path = `/api/agent/tokens/${requireId(id, "tokens revoke")}`;
    return {
      body: await scopedRequest(config, path, { method: "DELETE" }),
      exitCode: 0,
    };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
