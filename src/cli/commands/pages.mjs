// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { scopedRequest } from "../foundation/transport.mjs";
import { parseNonNegativeInteger, requireId } from "../foundation/validation.mjs";

export async function handlePages(context) {
  const { action, id, options, config } = context;
  {
    if (action === "list") {
      if (!options.team) throw new UsageError("pages list requires --team <team_id>");
      const query = new URLSearchParams({
        status: options.all ? "all" : "open",
      });
      if (options.limit) query.set("limit", parseNonNegativeInteger(options.limit, "limit"));
      if (options.cursor) query.set("cursor", options.cursor);
      const path = `/api/agent/teams/${encodeURIComponent(options.team)}/pages?${query}`;
      return { body: await scopedRequest(config, path), exitCode: 0 };
    }
    if (action === "get" || action === "resolve") {
      const path = `/api/agent/pages/${requireId(id, `pages ${action}`)}`;
      if (action === "get") return { body: await scopedRequest(config, path), exitCode: 0 };
      return {
        body: await scopedRequest(config, `${path}/resolve`, {
          method: "POST",
          body: JSON.stringify(options.note ? { note: options.note } : {}),
        }),
        exitCode: 0,
      };
    }
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
