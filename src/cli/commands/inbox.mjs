// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { scopedRequest } from "../foundation/transport.mjs";
import { parseNonNegativeInteger, requireId } from "../foundation/validation.mjs";

export async function handleInbox(context) {
  const { action, id, options, config } = context;
  {
    if (action === "projects") {
      return {
        body: await scopedRequest(config, "/api/agent/inbox/projects"),
        exitCode: 0,
      };
    }
    if (action === "list" || action === "read-all") {
      const query = new URLSearchParams();
      if (options.project) query.set("project", options.project);
      if (action === "list") {
        if (options.limit) query.set("limit", parseNonNegativeInteger(options.limit, "limit"));
        if (options.unread) query.set("unread", "1");
        if (options.cursor) query.set("cursor", options.cursor);
      } else {
        // The read-through token bounds read-all to notifications that existed
        // when this command ran, so anything arriving meanwhile stays unread.
        query.set("limit", "1");
      }
      const suffix = query.size > 0 ? `?${query}` : "";
      const page = await scopedRequest(config, `/api/agent/inbox/notifications${suffix}`);
      if (action === "list") return { body: page, exitCode: 0 };
      const body = await scopedRequest(config, "/api/agent/inbox/notifications/read-all", {
        method: "POST",
        body: JSON.stringify({
          readThrough: page.readThroughToken,
          ...(options.project ? { project: options.project } : {}),
        }),
      });
      return { body, exitCode: 0 };
    }
    if (["get", "read", "unread"].includes(action)) {
      const path = `/api/agent/inbox/notifications/${requireId(id, `inbox ${action}`)}`;
      if (action === "get") return { body: await scopedRequest(config, path), exitCode: 0 };
      return {
        body: await scopedRequest(config, `${path}/${action}`, {
          method: "POST",
        }),
        exitCode: 0,
      };
    }
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
