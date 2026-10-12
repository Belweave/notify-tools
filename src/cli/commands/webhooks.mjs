// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { readStdinJson } from "../foundation/input.mjs";
import { scopedRequest } from "../foundation/transport.mjs";
import { requireId } from "../foundation/validation.mjs";

export async function handleWebhooks(context) {
  const { action, id, options, config } = context;
  {
    if (action === "list") {
      return {
        body: await scopedRequest(config, "/api/agent/webhooks"),
        exitCode: 0,
      };
    }
    if (["get", "test", "rotate-secret", "remove", "delete"].includes(action)) {
      const path = `/api/agent/webhooks/${requireId(id, `webhooks ${action}`)}`;
      const suffix = ["test", "rotate-secret"].includes(action) ? `/${action}` : "";
      const method =
        action === "get" ? "GET" : ["remove", "delete"].includes(action) ? "DELETE" : "POST";
      return {
        body: await scopedRequest(config, `${path}${suffix}`, { method }),
        exitCode: 0,
      };
    }
    if (action === "create" || action === "update") {
      if (options.enabled && options.disabled) {
        throw new UsageError("--enabled cannot be combined with --disabled");
      }
      const stdin = options.stdin ? await readStdinJson() : {};
      const payload = {
        ...stdin,
        ...(options.name ? { name: options.name } : {}),
        ...(options.url ? { url: options.url } : {}),
        ...(options.preset ? { preset: options.preset } : {}),
        ...(options.enabled ? { enabled: true } : {}),
        ...(options.disabled ? { enabled: false } : {}),
      };
      if (action === "create" && (!payload.name || !payload.url)) {
        throw new UsageError("webhooks create requires --name and --url, or --stdin");
      }
      if (action === "update" && Object.keys(payload).length === 0) {
        throw new UsageError(
          "webhooks update requires --name, --url, --preset, --enabled, --disabled, or --stdin",
        );
      }
      const path =
        action === "create"
          ? "/api/agent/webhooks"
          : `/api/agent/webhooks/${requireId(id, "webhooks update")}`;
      return {
        body: await scopedRequest(config, path, {
          method: action === "create" ? "POST" : "PATCH",
          body: JSON.stringify(payload),
        }),
        exitCode: 0,
      };
    }
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
