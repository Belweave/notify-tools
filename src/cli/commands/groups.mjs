// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { scopedRequest } from "../foundation/transport.mjs";
import { parseIdList, parseMembers, requireId } from "../foundation/validation.mjs";

export async function groupsCommand(config, args, options) {
  const [action, groupId] = args;
  if (!options.team) throw new UsageError(`groups ${action ?? "list"} requires --team <team_id>`);
  const base = `/api/agent/teams/${encodeURIComponent(options.team)}/groups`;
  switch (action) {
    case "list":
      return scopedRequest(config, base);
    case "create": {
      const name = options.name;
      if (!name) throw new UsageError("groups create requires --name");
      return scopedRequest(config, base, {
        method: "POST",
        body: JSON.stringify({
          name,
          ...(options.members ? { memberIds: parseMembers(options.members) } : {}),
          ...(options.devices ? { deviceIds: parseIdList(options.devices, "devices") } : {}),
        }),
      });
    }
    case "get":
      return scopedRequest(config, `${base}/${requireId(groupId, "groups get")}`);
    case "update": {
      if (!groupId) throw new UsageError("groups update requires <group_id>");
      const payload = {
        ...(options.name ? { name: options.name } : {}),
        ...(options.members ? { memberIds: parseMembers(options.members) } : {}),
        ...(options.devices ? { deviceIds: parseIdList(options.devices, "devices") } : {}),
      };
      if (Object.keys(payload).length === 0) {
        throw new UsageError("groups update requires a field to change");
      }
      return scopedRequest(config, `${base}/${encodeURIComponent(groupId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }
    case "delete":
      return scopedRequest(config, `${base}/${requireId(groupId, "groups delete")}`, {
        method: "DELETE",
      });
    default:
      throw new UsageError("Unknown groups command. Run notify --help.");
  }
}

export async function handleGroups(context) {
  const { positionals, options, config } = context;
  {
    return {
      body: await groupsCommand(config, positionals.slice(1), options),
      exitCode: 0,
    };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
