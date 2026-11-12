// SPDX-License-Identifier: Apache-2.0
import { RequestError } from "../foundation/errors.mjs";
import { DEFAULT_API_URL, DEFAULT_SCOPES } from "../foundation/settings.mjs";
import { publicRequest, request } from "../foundation/transport.mjs";
import { loadConfig } from "../session/credentials.mjs";
import { VERSION } from "../version.mjs";
import { skillStatus } from "./skills.mjs";

const DAY_MS = 86_400_000;

function check(name, status, detail, hint) {
  return { name, status, detail, ...(hint ? { hint } : {}) };
}

/**
 * Checks the local runtime, sign-in, scopes, phones and API reachability. It
 * never prints a token: only its source, name, scopes and expiry.
 */
export async function handleDoctor({ options, env, runtime }) {
  const checks = [];
  const now = runtime?.now?.() ?? Date.now();
  checks.push(check("cli", "ok", `Notify Tools ${VERSION} on Node.js ${process.versions.node}`));

  let config;
  try {
    config = await loadConfig(env);
    checks.push(
      check(
        "credentials",
        "ok",
        config.source === "environment" ? "Using NOTIFY_TOKEN from the environment" : `Saved credentials in ${config.path}`,
      ),
    );
  } catch (error) {
    checks.push(
      check("credentials", "fail", error instanceof Error ? error.message : "No credentials",
        "Run notify auth login, or set NOTIFY_TOKEN for CI."),
    );
  }
  const apiUrl = config?.apiUrl ?? env.NOTIFY_API_URL ?? DEFAULT_API_URL;

  try {
    const health = await publicRequest(apiUrl, "/api/health");
    checks.push(
      check("api", health.ok === true ? "ok" : "warn", `${apiUrl} is reachable${health.ok === true ? "" : " but reports a problem"}`),
    );
  } catch (error) {
    const network = error instanceof RequestError && error.status === 0;
    checks.push(
      check("api", "fail", `${apiUrl} ${network ? "could not be reached" : `answered ${error.status ?? "an error"}`}`,
        network ? "Check the network, proxy settings and NOTIFY_API_URL." : undefined),
    );
  }

  if (config) {
    try {
      const status = await request(config, "/api/agent/auth/status");
      const scopes = status.token?.scopes ?? [];
      const missing = DEFAULT_SCOPES.filter((scope) => !scopes.includes(scope));
      checks.push(check("sign-in", "ok", `Signed in${status.token?.name ? ` as connection "${status.token.name}"` : ""}`));
      checks.push(
        missing.length === 0
          ? check("scopes", "ok", `${scopes.length} scopes granted`)
          : check("scopes", "warn", `Missing ${missing.join(", ")}`,
              `Commands needing these fail with exit 3. Grant them with notify auth login ${missing.map((scope) => `--scope ${scope}`).join(" ")}`),
      );
      const expiresAt = status.token?.expiresAt ? Date.parse(status.token.expiresAt) : Number.NaN;
      if (Number.isFinite(expiresAt)) {
        const days = Math.floor((expiresAt - now) / DAY_MS);
        checks.push(
          days < 7
            ? check("expiry", "warn", `Token expires ${status.token.expiresAt}`, "Run notify auth login before it expires.")
            : check("expiry", "ok", `Token expires in ${days} days`),
        );
      }
      if (scopes.includes("devices:read")) {
        const { devices = [] } = await request(config, "/api/agent/devices");
        checks.push(
          devices.length > 0
            ? check("devices", "ok", `${devices.length} registered phone${devices.length === 1 ? "" : "s"}`)
            : check("devices", "warn", "No registered phones; notifications reach nobody",
                "Open Notify on the phone, sign in to the same account and allow notifications."),
        );
      }
    } catch (error) {
      const auth = error instanceof RequestError && (error.status === 401 || error.status === 403);
      checks.push(
        check("sign-in", "fail", error instanceof Error ? error.message : "Sign-in check failed",
          auth ? "The token is missing, revoked or expired. Run notify auth login." : undefined),
      );
    }
  }

  try {
    const skills = await skillStatus({ env });
    const stale = skills.filter((entry) => entry.installed && entry.version !== VERSION);
    if (stale.length > 0) {
      checks.push(
        check("skills", "warn",
          `Agent skills from ${[...new Set(stale.map((entry) => entry.version ?? "unknown"))].join(", ")} installed for ${[...new Set(stale.map((entry) => entry.agent))].join(", ")}`,
          "Update them with notify skills install."),
      );
    } else if (skills.some((entry) => entry.installed)) {
      checks.push(check("skills", "ok", `Agent skills ${VERSION} installed`));
    }
  } catch {
    // Skill status is informational; an unreadable directory is not a setup failure.
  }

  const failed = checks.find((entry) => entry.status === "fail");
  const exitCode = !failed
    ? 0
    : failed.name === "api" && /could not be reached/.test(failed.detail)
      ? 6
      : ["credentials", "sign-in"].includes(failed.name)
        ? 3
        : 1;
  const body = { ok: !failed, version: VERSION, apiUrl, checks };
  if (options.json) return { body, exitCode };
  const mark = { ok: "ok  ", warn: "warn", fail: "FAIL" };
  const output = checks
    .map((entry) => `${mark[entry.status]}  ${entry.name}: ${entry.detail}${entry.hint ? `\n      ${entry.hint}` : ""}`)
    .join("\n");
  return { body, exitCode, output };
}
