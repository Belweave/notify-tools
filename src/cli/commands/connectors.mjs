// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { request, scopedRequest } from "../foundation/transport.mjs";
import { requireId } from "../foundation/validation.mjs";
import { configPath, writeConnectorSecret } from "../session/credentials.mjs";

export async function handleConnectors(context) {
  const { action, id, options, config, env, runtime } = context;
  if (action === "list") {
    return { body: await scopedRequest(config, "/api/agent/connectors"), exitCode: 0 };
  }
  if (action === "get" || action === "remove") {
    const path = `/api/agent/connectors/${requireId(id, `connectors ${action}`)}`;
    return {
      body: await scopedRequest(config, path, action === "remove" ? { method: "DELETE" } : undefined),
      exitCode: 0,
    };
  }
  if (action === "update") {
    const path = `/api/agent/connectors/${requireId(id, "connectors update")}`;
    if (options.enabled && options.disabled) {
      throw new UsageError("--enabled cannot be combined with --disabled");
    }
    if (options.oncall && options["no-oncall"]) {
      throw new UsageError("--oncall cannot be combined with --no-oncall");
    }
    const payload = {
      ...(options.name ? { name: options.name } : {}),
      ...(options.enabled ? { enabled: true } : {}),
      ...(options.disabled ? { enabled: false } : {}),
      ...(options.oncall ? { oncallGroupId: options.oncall } : {}),
      ...(options["no-oncall"] ? { oncallGroupId: null } : {}),
    };
    if (Object.keys(payload).length === 0) {
      throw new UsageError(
        "connectors update requires --name, --enabled, --disabled, --oncall or --no-oncall",
      );
    }
    return {
      body: await scopedRequest(config, path, { method: "PATCH", body: JSON.stringify(payload) }),
      exitCode: 0,
    };
  }
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

  throw new UsageError("Unknown command. Run notify connectors --help.");
}
