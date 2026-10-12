// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { request } from "../foundation/transport.mjs";
import { configPath, writeConnectorSecret } from "../session/credentials.mjs";

export async function handleConnectors(context) {
  const { action, id, config, env, runtime } = context;
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
      let secretPath;
      try {
        secretPath = await writeConnectorSecret(
          config.path ?? configPath(env),
          connectorId,
          callbackSecret,
        );
      } catch {
        throw new Error(
          "Callback signing secret rotated but could not be saved. Fix local storage and rotate again.",
        );
      }
      runtime.stderr(`Callback signing secret saved to ${secretPath}`);
    }
    const { callbackSecret: _secret, ...body } = rotated;
    return { body, exitCode: 0 };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
