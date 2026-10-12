// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { request, scopedRequest } from "../foundation/transport.mjs";
import { requireId } from "../foundation/validation.mjs";

export async function handleDevices(context) {
  const { action, id, config } = context;
  if (action === "list") {
    return { body: await request(config, "/api/agent/devices"), exitCode: 0 };
  }
  if (action === "remove") {
    const path = `/api/agent/devices/${requireId(id, "devices remove")}`;
    return {
      body: await scopedRequest(config, path, { method: "DELETE" }),
      exitCode: 0,
    };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
