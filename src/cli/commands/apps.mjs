// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { formatApp } from "../foundation/results.mjs";
import { appsRequest, scopedRequest } from "../foundation/transport.mjs";
import { requireId } from "../foundation/validation.mjs";

export async function handleApps(context) {
  const { action, id, options, config } = context;
  if (["get", "update", "revoke"].includes(action)) {
    const path = `/api/agent/apps/${requireId(id, `apps ${action}`)}`;
    let body;
    if (action === "get") body = await appsRequest(config, path);
    else if (action === "revoke") {
      body = await appsRequest(config, `${path}/revoke`, { method: "POST" });
    } else {
      if (options["public-client"] && options["private-client"]) {
        throw new UsageError("--public-client and --private-client cannot be used together");
      }
      if (options.icon && options["no-icon"]) {
        throw new UsageError("--icon and --no-icon cannot be used together");
      }
      if (options.project && options["no-project"]) {
        throw new UsageError("--project and --no-project cannot be used together");
      }
      const payload = {
        ...(options.name ? { name: options.name } : {}),
        ...(options.url ? { url: options.url } : {}),
        ...(options.icon ? { iconUrl: options.icon } : {}),
        ...(options["no-icon"] ? { iconUrl: null } : {}),
        ...(options.project ? { project: options.project } : {}),
        ...(options["no-project"] ? { project: null } : {}),
        ...(options["public-client"] ? { publicClient: true } : {}),
        ...(options["private-client"] ? { publicClient: false } : {}),
      };
      if (Object.keys(payload).length === 0) {
        throw new UsageError(
          "apps update requires --name, --url, --icon, --no-icon, --project, --no-project, --public-client, or --private-client",
        );
      }
      body = await appsRequest(config, path, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    }
    const suffix =
      action === "revoke"
        ? " (sign-in revoked)"
        : action === "update" && body.app.consentedAt === null
          ? " (approve sign-in on your phone)"
          : "";
    return {
      body,
      exitCode: 0,
      ...(options.json ? {} : { output: `${formatApp(body.app)}${suffix}` }),
    };
  }
  if (action === "create") {
    if (!options.name || !options.url)
      throw new UsageError("apps create requires --name and --url");
    const payload = {
      name: options.name,
      url: options.url,
      ...(options.icon ? { iconUrl: options.icon } : {}),
      ...(options.project ? { project: options.project } : {}),
      ...(options.team ? { teamId: options.team } : {}),
    };
    const body = await appsRequest(config, "/api/agent/apps", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return {
      body,
      exitCode: 0,
      ...(options.json
        ? {}
        : {
            output: `${formatApp(body.app)}${body.created ? "" : " (updated existing)"}`,
          }),
    };
  }
  if (action === "list") {
    const body = await appsRequest(config, "/api/agent/apps");
    return {
      body,
      exitCode: 0,
      ...(options.json
        ? {}
        : {
            output: body.apps.length > 0 ? body.apps.map(formatApp).join("\n") : "No apps",
          }),
    };
  }
  if (action === "remove") {
    if (!id) throw new UsageError("apps remove requires an app ID");
    const body = await appsRequest(config, `/api/agent/apps/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return {
      body,
      exitCode: 0,
      ...(options.json ? {} : { output: `Removed ${id}` }),
    };
  }
  if (action === "share") {
    if (!id) throw new UsageError("apps share requires an app ID");
    if (Boolean(options.team) === Boolean(options.personal)) {
      throw new UsageError("apps share requires exactly one of --team <team_id> or --personal");
    }
    const body = await scopedRequest(config, `/api/agent/apps/${encodeURIComponent(id)}/share`, {
      method: "POST",
      body: JSON.stringify({
        teamId: options.personal ? null : options.team,
        ...(options["no-notify"] ? { notify: false } : {}),
      }),
    });
    const where = body.app.team ? `shared with ${body.app.team.name}` : "personal";
    return {
      body,
      exitCode: 0,
      ...(options.json ? {} : { output: `${formatApp(body.app)} (${where})` }),
    };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
