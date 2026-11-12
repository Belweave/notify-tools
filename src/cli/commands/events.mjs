// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { scopedRequest } from "../foundation/transport.mjs";

export async function handleEvents(context) {
  const { action, options, config } = context;
  if (action === "list" || action === undefined) {
    const query = new URLSearchParams();
    if (options.limit) {
      const limit = Number.parseInt(options.limit, 10);
      if (!/^\d+$/.test(options.limit) || limit < 1 || limit > 100) {
        throw new UsageError("--limit must be an integer from 1 to 100");
      }
      query.set("limit", String(limit));
    }
    const suffix = query.size > 0 ? `?${query}` : "";
    return { body: await scopedRequest(config, `/api/agent/events${suffix}`), exitCode: 0 };
  }
  throw new UsageError("Unknown command. Run notify events --help.");
}
