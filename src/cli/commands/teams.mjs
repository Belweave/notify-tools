// SPDX-License-Identifier: Apache-2.0
import { RequestError, UsageError } from "../foundation/errors.mjs";
import { requestBytes, scopedRequest } from "../foundation/transport.mjs";
import { RAW_OUTPUT } from "../foundation/results.mjs";
import { requireId } from "../foundation/validation.mjs";

const AUDIT_FORMATS = ["json", "csv"];

async function auditCommand(config, teamPath, options) {
  const query = new URLSearchParams();
  for (const key of ["action", "actor", "from", "to", "cursor"]) {
    if (options[key]) query.set(key, options[key]);
  }
  if (options.limit) {
    const limit = Number.parseInt(options.limit, 10);
    if (!/^\d+$/.test(options.limit) || limit < 1 || limit > 1000) {
      throw new UsageError("--limit must be an integer from 1 to 1000");
    }
    query.set("limit", String(limit));
  }
  if (options.format && !AUDIT_FORMATS.includes(options.format)) {
    throw new UsageError("--format must be json or csv");
  }
  if (options.format === "csv") {
    query.set("format", "csv");
    const bytes = await requestBytes(config, `${teamPath}/audit?${query}`);
    return { [RAW_OUTPUT]: bytes.toString("utf8") };
  }
  const suffix = query.size > 0 ? `?${query}` : "";
  return scopedRequest(config, `${teamPath}/audit${suffix}`);
}

export const TEAM_ROLES = ["owner", "admin", "member"];

export async function teamsCommand(config, args, options) {
  const [action, teamId, ...rest] = args;
  const base = "/api/agent/teams";
  const teamPath = () => `${base}/${requireId(teamId, `teams ${action}`)}`;
  switch (action) {
    case "list":
      return scopedRequest(config, base);
    case "create": {
      const name = [teamId, ...rest].filter(Boolean).join(" ") || options.name;
      if (!name) throw new UsageError("teams create requires a name");
      try {
        return await scopedRequest(config, base, {
          method: "POST",
          body: JSON.stringify({ name }),
        });
      } catch (error) {
        // Notify currently creates only free families; existing teams keep working.
        if (
          error instanceof RequestError &&
          (error.status === 403 || error.status === 400) &&
          !Array.isArray(error.body?.required)
        ) {
          throw new RequestError(
            `${error.message}. New workplace teams cannot be created at the moment; use notify families create "${name}" for a free family.`,
            error.status,
            error.body,
          );
        }
        throw error;
      }
    }
    case "get":
      return scopedRequest(config, teamPath());
    case "members":
      return { members: (await scopedRequest(config, teamPath())).members };
    case "rename": {
      const name = rest.join(" ") || options.name;
      if (!name) throw new UsageError("teams rename requires a new name");
      return scopedRequest(config, teamPath(), {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
    }
    case "delete":
      return scopedRequest(config, teamPath(), { method: "DELETE" });
    case "leave":
      return scopedRequest(config, `${teamPath()}/leave`, { method: "POST" });
    case "role": {
      const [userId, role] = rest;
      if (!userId || !TEAM_ROLES.includes(role)) {
        throw new UsageError("teams role requires <team_id> <user_id> <owner|admin|member>");
      }
      return scopedRequest(config, `${teamPath()}/members/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
    }
    case "remove-member": {
      const [userId] = rest;
      if (!userId) throw new UsageError("teams remove-member requires <team_id> <user_id>");
      return scopedRequest(config, `${teamPath()}/members/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
    }
    case "invite": {
      if (options.role && !["admin", "member"].includes(options.role)) {
        throw new UsageError("--role must be member or admin");
      }
      return scopedRequest(config, `${teamPath()}/invites`, {
        method: "POST",
        body: JSON.stringify({
          ...(options.email ? { email: options.email } : {}),
          ...(options.domain ? { domain: options.domain } : {}),
          ...(options.role ? { role: options.role } : {}),
        }),
      });
    }
    case "invites":
      return scopedRequest(config, `${teamPath()}/invites`);
    case "apps":
      return scopedRequest(config, `${teamPath()}/apps`);
    case "devices":
      return scopedRequest(config, `${teamPath()}/devices`);
    case "audit":
      return auditCommand(config, teamPath(), options);
    case "revoke-invite": {
      const [inviteId] = rest;
      if (!inviteId) throw new UsageError("teams revoke-invite requires <team_id> <invite_id>");
      return scopedRequest(config, `${teamPath()}/invites/${encodeURIComponent(inviteId)}`, {
        method: "DELETE",
      });
    }
    case "domain": {
      const domain = rest[0] || options.domain;
      if (!domain) throw new UsageError("teams domain requires <team_id> <domain>");
      return scopedRequest(config, `${teamPath()}/domain`, {
        method: "POST",
        body: JSON.stringify({ domain }),
      });
    }
    case "verify-domain":
      return scopedRequest(config, `${teamPath()}/domain/verify`, {
        method: "POST",
      });
    case "update": {
      const payload = {};
      const name = rest.join(" ") || options.name;
      if (name) payload.name = name;
      if (options["auto-join"]) payload.autoJoinVerifiedDomain = true;
      if (options["no-auto-join"]) payload.autoJoinVerifiedDomain = false;
      if (options["no-retention"]) payload.retentionDays = null;
      else if (options.retention) {
        const days = Number(options.retention);
        if (![7, 30, 90, 365].includes(days)) {
          throw new UsageError("--retention must be 7, 30, 90, or 365");
        }
        payload.retentionDays = days;
      }
      if (options["no-domain"]) {
        const cleared = await scopedRequest(config, `${teamPath()}/domain`, {
          method: "DELETE",
        });
        if (Object.keys(payload).length === 0 && !options.domain) return cleared;
      }
      if (options.domain) {
        const requested = await scopedRequest(config, `${teamPath()}/domain`, {
          method: "POST",
          body: JSON.stringify({ domain: options.domain }),
        });
        if (Object.keys(payload).length === 0) return requested;
      }
      if (Object.keys(payload).length === 0) {
        throw new UsageError("teams update requires a field to change");
      }
      return scopedRequest(config, teamPath(), {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }
    default:
      throw new UsageError("Unknown teams command. Run notify --help.");
  }
}

export async function handleTeams(context) {
  const { positionals, options, config } = context;
  const body = await teamsCommand(config, positionals.slice(1), options);
  if (body && Object.hasOwn(body, RAW_OUTPUT)) {
    return { body: {}, output: body[RAW_OUTPUT].replace(/\n$/, ""), exitCode: 0 };
  }
  return { body, exitCode: 0 };
}
