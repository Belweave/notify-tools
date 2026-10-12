// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { request } from "../foundation/transport.mjs";
import { writeConnectorSecret } from "../session/credentials.mjs";

export async function handleConnectors(context) {
  const { action, id, config, runtime } = context;
  if (action === "rotate-secret") {
    if (!id) throw new UsageError("connectors rotate-secret requires a connector ID");
    const rotated = await request(
      config,
      `/api/agent/connectors/${encodeURIComponent(id)}/rotate-secret`,
      { method: "POST" },
    );
    const callbackSecret =
      typeof rotated.callbackSecret === "string" ? rotated.callbackSecret : undefined;
    const connectorId = typeof rotated.connector?.id === "string" ? rotated.connector.id : id;
    if (callbackSecret) {
      runtime.stderr(`callbackSecret (shown once): ${callbackSecret}`);
      if (config.source === "file") {
        await writeConnectorSecret(config.path, connectorId, callbackSecret);
      }
    }
    const { callbackSecret: _secret, ...body } = rotated;
    return { body, exitCode: 0 };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
