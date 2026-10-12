// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { scopedRequest } from "../foundation/transport.mjs";

export async function handleBilling(context) {
  const { action, config } = context;
  if (action === undefined) {
    return {
      body: await scopedRequest(config, "/api/agent/billing"),
      exitCode: 0,
    };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
