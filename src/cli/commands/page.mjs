// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { pageExitCode } from "../foundation/results.mjs";
import { scopedRequest } from "../foundation/transport.mjs";

export async function handlePage(context) {
  const { positionals, options, config } = context;
  {
    const groupId = positionals[1];
    const title = positionals.slice(2).join(" ");
    if (!groupId || !title) throw new UsageError("page requires a group ID and a title");
    const body = await scopedRequest(
      config,
      `/api/agent/oncall/${encodeURIComponent(groupId)}/pages`,
      {
        method: "POST",
        body: JSON.stringify({
          title,
          ...(options.body ? { body: options.body } : {}),
          ...(options.url ? { url: options.url } : {}),
          ...(options.app ? { appId: options.app } : {}),
          ...(options["dedup-key"] ? { dedupKey: options["dedup-key"] } : {}),
          ...(options.group ? { group: options.group } : {}),
        }),
      },
    );
    return { body, exitCode: pageExitCode(body) };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
