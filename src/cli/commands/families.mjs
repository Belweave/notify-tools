// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { scopedRequest } from "../foundation/transport.mjs";
import { requireId } from "../foundation/validation.mjs";
import { teamsCommand } from "./teams.mjs";

export async function familiesCommand(config, args, options) {
  const [action, id, ...rest] = args;
  const allowed = [
    "list",
    "create",
    "get",
    "members",
    "rename",
    "delete",
    "leave",
    "invite",
    "invites",
    "revoke-invite",
    "remove-member",
  ];
  if (!allowed.includes(action))
    throw new UsageError("Unknown families command. Run notify --help.");
  if (options.domain || (options.role && options.role !== "member")) {
    throw new UsageError("Families support member invitations only, without domain invitations.");
  }
  if (action === "create") {
    const name = [id, ...rest].filter(Boolean).join(" ") || options.name;
    if (!name) throw new UsageError("families create requires a name");
    return scopedRequest(config, "/api/agent/teams", {
      method: "POST",
      body: JSON.stringify({ name, kind: "family" }),
    });
  }
  if (action === "list") {
    const body = await scopedRequest(config, "/api/agent/teams");
    return {
      ...body,
      teams: body.teams.filter((team) => team.kind === "family"),
    };
  }
  const existing = await scopedRequest(
    config,
    `/api/agent/teams/${requireId(id, `families ${action}`)}`,
  );
  if (existing.team?.kind !== "family") throw new UsageError("This ID does not identify a Family.");
  if (action === "get") return existing;
  if (action === "members") return { members: existing.members };
  return teamsCommand(config, args, options);
}

export async function handleFamilies(context) {
  const { positionals, options, config } = context;
  {
    return {
      body: await familiesCommand(config, positionals.slice(1), options),
      exitCode: 0,
    };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
