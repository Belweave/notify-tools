// SPDX-License-Identifier: Apache-2.0
import { parseDuration } from "../foundation/arguments.mjs";
import { UsageError } from "../foundation/errors.mjs";
import { interactionExitCode, waitForInteraction } from "../foundation/results.mjs";
import { request, scopedRequest } from "../foundation/transport.mjs";

export async function handleInteraction(context) {
  const { action, id, options, config, runtime } = context;
  if (action === "list") {
    return {
      body: await scopedRequest(config, "/api/agent/interactions"),
      exitCode: 0,
    };
  }
  if (action === "get" && id) {
    const body = await request(config, `/api/agent/interactions/${encodeURIComponent(id)}`);
    return { body, exitCode: interactionExitCode(body.interaction) };
  }
  if (action === "wait" && id) {
    const timeout = parseDuration(options.timeout ?? "60s");
    const body = await waitForInteraction(config, id, timeout, runtime);
    return {
      body,
      exitCode: body.timedOut ? 4 : interactionExitCode(body.interaction),
    };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
