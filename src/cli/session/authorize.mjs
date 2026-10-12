// SPDX-License-Identifier: Apache-2.0
import { parseDuration } from "../foundation/arguments.mjs";
import { RequestError, UsageError } from "../foundation/errors.mjs";
import { DEFAULT_API_URL, DEFAULT_SCOPES } from "../foundation/settings.mjs";
import { publicRequest, request } from "../foundation/transport.mjs";
import { configPath } from "./credentials.mjs";
import { spawn } from "node:child_process";
import { platform } from "node:os";

export function openBrowser(url) {
  const target = String(url);
  const command =
    platform() === "darwin"
      ? { file: "open", args: [target] }
      : platform() === "win32"
        ? {
            file: "rundll32.exe",
            args: ["url.dll,FileProtocolHandler", target],
          }
        : { file: "xdg-open", args: [target] };
  const child = spawn(command.file, command.args, {
    detached: true,
    shell: false,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => {});
  child.unref();
}

export async function login(options, env, runtime) {
  if (options.open && options["no-open"]) {
    throw new UsageError("--open and --no-open cannot be used together");
  }
  const apiUrl = env.NOTIFY_API_URL ?? DEFAULT_API_URL;
  const expiresInSeconds = parseDuration(options["expires-in"] ?? "90d");
  const timeoutSeconds = parseDuration(options.timeout ?? "10m");
  const clientName = options["client-name"] ?? "notify";
  const scopes = options.scope.length > 0 ? [...new Set(options.scope)] : DEFAULT_SCOPES;
  const started = await publicRequest(apiUrl, "/api/device-authorization/start", {
    method: "POST",
    body: JSON.stringify({ clientName, scopes, expiresInSeconds }),
  });

  runtime.stderr(`Code: ${started.userCode}`);
  runtime.stderr(`Authorize at: ${started.verificationUri}`);
  const shouldOpen = options.open || (!options["no-open"] && runtime.stderrIsTTY);
  if (shouldOpen) {
    try {
      runtime.openBrowser(started.verificationUriComplete);
    } catch (error) {
      runtime.stderr(
        `Could not open browser: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  const deadline = runtime.now() + Math.min(timeoutSeconds, started.expiresIn) * 1000;
  let interval = started.interval;
  while (runtime.now() < deadline) {
    await runtime.sleep(Math.min(interval * 1000, deadline - runtime.now()));
    if (runtime.now() >= deadline) break;
    let response;
    try {
      response = await publicRequest(apiUrl, "/api/device-authorization/token", {
        method: "POST",
        body: JSON.stringify({ deviceCode: started.deviceCode }),
      });
    } catch (error) {
      if (
        error instanceof RequestError &&
        ["authorization_pending", "slow_down"].includes(error.body?.error)
      ) {
        interval =
          Number(error.body?.interval) ||
          (error.body?.error === "slow_down" ? interval + 5 : interval);
        continue;
      }
      throw error;
    }

    const path = configPath(env);
    try {
      await runtime.writeConfig(path, {
        apiUrl,
        token: response.accessToken,
        tokenId: response.token.id,
      });
    } catch (error) {
      await request({ apiUrl, token: response.accessToken }, "/api/agent/auth/revoke", {
        method: "POST",
      }).catch(() => {});
      throw error;
    }
    return {
      authenticated: true,
      token: response.token,
      configPath: path,
    };
  }
  throw new RequestError("Authorization timed out", 408, {
    error: "expired_token",
  });
}
