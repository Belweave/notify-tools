// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { readStdinJson } from "../foundation/input.mjs";
import { scopedRequest } from "../foundation/transport.mjs";
import { requireId, rotationFromOptions } from "../foundation/validation.mjs";

export async function oncallCommand(config, args, options) {
  const [action, groupId, ...rest] = args;
  const groupPath = () => `/api/agent/oncall/${requireId(groupId, `oncall ${action}`)}`;
  switch (action) {
    case "list":
      if (!options.team) throw new UsageError("oncall list requires --team <team_id>");
      return scopedRequest(config, `/api/agent/teams/${encodeURIComponent(options.team)}/oncall`);
    case "me":
      return scopedRequest(config, "/api/agent/oncall/me");
    case "get":
      return scopedRequest(config, groupPath());
    case "create": {
      const stdin = options.stdin ? await readStdinJson() : {};
      if (!options.team) throw new UsageError("oncall create requires --team <team_id>");
      const name = options.name ?? stdin.name;
      const rotation = rotationFromOptions(options, stdin.rotation);
      if (!name || !rotation?.memberIds) {
        throw new UsageError("oncall create requires --name and --members");
      }
      const payload = {
        ...stdin,
        name,
        rotation: {
          period: "daily",
          handoffAt: "09:00",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          ...rotation,
        },
      };
      return scopedRequest(config, `/api/agent/teams/${encodeURIComponent(options.team)}/oncall`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    case "update": {
      const stdin = options.stdin ? await readStdinJson() : {};
      let rotation = rotationFromOptions(options, stdin.rotation);
      if (rotation) {
        // The server replaces the whole rotation, so fill unchanged fields
        // (including the original start, which keeps the order) from the group.
        const { group } = await scopedRequest(config, groupPath());
        rotation = {
          memberIds: group.rotation.members.map((member) => member.userId),
          period: group.rotation.period,
          handoffAt: group.rotation.handoffAt,
          timezone: group.rotation.timezone,
          startsAt: group.rotation.startsAt,
          ...rotation,
        };
      }
      const payload = {
        ...stdin,
        ...(options.name ? { name: options.name } : {}),
        ...(rotation ? { rotation } : {}),
      };
      if (Object.keys(payload).length === 0) {
        throw new UsageError("oncall update requires a field to change (or --stdin)");
      }
      return scopedRequest(config, groupPath(), { method: "PATCH", body: JSON.stringify(payload) });
    }
    case "override": {
      if (!options.user || !options["starts-at"] || !options["ends-at"]) {
        throw new UsageError("oncall override requires --user, --starts-at, and --ends-at");
      }
      return scopedRequest(config, `${groupPath()}/overrides`, {
        method: "POST",
        body: JSON.stringify({
          userId: options.user,
          startsAt: options["starts-at"],
          endsAt: options["ends-at"],
        }),
      });
    }
    case "remove-override": {
      const [overrideId] = rest;
      if (!overrideId)
        throw new UsageError("oncall remove-override requires <group_id> <override_id>");
      return scopedRequest(config, `${groupPath()}/overrides/${encodeURIComponent(overrideId)}`, {
        method: "DELETE",
      });
    }
    default:
      throw new UsageError("Unknown oncall command. Run notify --help.");
  }
}

export async function handleOncall({ config, positionals, options }) {
  return { body: await oncallCommand(config, positionals.slice(1), options), exitCode: 0 };
}
