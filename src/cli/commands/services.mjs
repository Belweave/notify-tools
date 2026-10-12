// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { readStdinJson } from "../foundation/input.mjs";
import { request, scopedRequest } from "../foundation/transport.mjs";
import { requireId } from "../foundation/validation.mjs";

export async function handleServices(context) {
  const { group, action, id, options, config } = context;
  if (action === "list") {
    return { body: await request(config, "/api/agent/services"), exitCode: 0 };
  }
  if (action === "create") {
    if (options["reply-webhook"] && options["no-reply-webhook"]) {
      throw new UsageError("--reply-webhook cannot be combined with --no-reply-webhook");
    }
    const stdin = options.stdin ? await readStdinJson() : {};
    const title = options.title ?? stdin.title;
    if (!title) throw new UsageError("services create requires --title");
    const payload = {
      ...stdin,
      title,
      ...(options.image ? { imageUrl: options.image } : {}),
      ...(options.url ? { url: options.url } : {}),
      ...(options["reply-webhook"] ? { defaultReplyWebhookId: options["reply-webhook"] } : {}),
      ...(options["no-reply-webhook"] ? { defaultReplyWebhookId: null } : {}),
    };
    return {
      body: await request(config, "/api/agent/services", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
      exitCode: 0,
    };
  }
  if (action === "share") {
    if (Boolean(options.family) === Boolean(options.personal)) {
      throw new UsageError(
        "services share requires exactly one of --family <family_id> or --personal",
      );
    }
    return {
      body: await scopedRequest(
        config,
        `/api/agent/services/${requireId(id, "services share")}/share`,
        {
          method: "POST",
          body: JSON.stringify({
            familyId: options.personal ? null : options.family,
          }),
        },
      ),
      exitCode: 0,
    };
  }
  if (group === "services" && ["get", "update", "rotate", "remove"].includes(action)) {
    const path = `/api/agent/services/${requireId(id, `services ${action}`)}`;
    if (action === "get") return { body: await scopedRequest(config, path), exitCode: 0 };
    if (action === "rotate") {
      return {
        body: await scopedRequest(config, `${path}/rotate`, { method: "POST" }),
        exitCode: 0,
      };
    }
    if (action === "remove") {
      return {
        body: await scopedRequest(config, path, { method: "DELETE" }),
        exitCode: 0,
      };
    }
    const stdin = options.stdin ? await readStdinJson() : {};
    if (options["reply-webhook"] && options["no-reply-webhook"]) {
      throw new UsageError("--reply-webhook cannot be combined with --no-reply-webhook");
    }
    const payload = {
      ...stdin,
      ...(options.title ? { title: options.title } : {}),
      ...(options.image ? { imageUrl: options.image } : {}),
      ...(options.url ? { url: options.url } : {}),
      ...(options["reply-webhook"] ? { defaultReplyWebhookId: options["reply-webhook"] } : {}),
      ...(options["no-reply-webhook"] ? { defaultReplyWebhookId: null } : {}),
    };
    if (Object.keys(payload).length === 0) {
      throw new UsageError(
        "services update requires --title, --image, --url, --reply-webhook, --no-reply-webhook, or --stdin",
      );
    }
    return {
      body: await scopedRequest(config, path, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
      exitCode: 0,
    };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
