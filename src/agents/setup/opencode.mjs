// SPDX-License-Identifier: Apache-2.0
import { readOptional, atomicWrite, digest } from "../configuration/files.mjs";
import { spawn } from "node:child_process";
import { mkdir, access, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export const LABEL = "ai.belweave.notify-permission-bridge";

export function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function launchAgent({ home = homedir(), entrypoint }) {
  const stateDirectory = join(
    home,
    "Library",
    "Application Support",
    "Notify",
    "permission-bridge",
  );
  const logDirectory = join(home, "Library", "Logs", "Notify");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(entrypoint)}</string>
    <string>permissions</string>
    <string>daemon</string>
    <string>opencode</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(`${dirname(process.execPath)}:${dirname(entrypoint)}:/usr/local/bin:/usr/bin:/bin`)}</string>
  </dict>
  <key>WorkingDirectory</key><string>${xml(stateDirectory)}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>Umask</key><integer>63</integer>
  <key>StandardOutPath</key><string>${xml(join(logDirectory, "permission-bridge.log"))}</string>
  <key>StandardErrorPath</key><string>${xml(join(logDirectory, "permission-bridge.log"))}</string>
</dict>
</plist>
`;
}

export function openCodeV1Plugin({ entrypoint }) {
  return `import { spawn } from "node:child_process";

const notify = ${JSON.stringify(entrypoint)};
const relevant = new Set(["server.connected", "permission.asked", "permission.updated"]);

export const NotifyPermissionsV1Plugin = async ({ serverUrl, directory }) => ({
  event: async ({ event }) => {
    if (!relevant.has(event.type)) return;
    const child = spawn(notify, ["permissions", "opencode-v1-event"], {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.once("error", () => {});
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ serverUrl: String(serverUrl), directory, event }));
    child.unref();
  },
});
`;
}

export function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} failed`))));
  });
}

export async function installOpenCode({
  home = homedir(),
  entrypoint,
  platform = process.platform,
  runCommand = run,
}) {
  if (platform !== "darwin") throw new Error("OpenCode service setup currently supports macOS.");
  const path = join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
  const pluginPath = join(home, ".config", "opencode", "plugin", "notify-permissions-v1.js");
  const stateDirectory = join(
    home,
    "Library",
    "Application Support",
    "Notify",
    "permission-bridge",
  );
  const logDirectory = join(home, "Library", "Logs", "Notify");
  await mkdir(stateDirectory, { recursive: true, mode: 0o700 });
  await mkdir(logDirectory, { recursive: true, mode: 0o700 });
  const currentPlugin = await readOptional(pluginPath);
  await atomicWrite(
    pluginPath,
    openCodeV1Plugin({ entrypoint }),
    currentPlugin === undefined ? undefined : digest(currentPlugin),
  );
  const current = await readOptional(path);
  await atomicWrite(
    path,
    launchAgent({ home, entrypoint }),
    current === undefined ? undefined : digest(current),
  );
  const domain = `gui/${process.getuid()}`;
  await runCommand("launchctl", ["bootout", domain, path]).catch(() => {});
  await runCommand("launchctl", ["bootstrap", domain, path]);
  const notifier = join(home, ".config", "opencode", "plugins", "mobile-code-notifications.js");
  const warnings = [];
  if (
    await access(notifier)
      .then(() => true)
      .catch(() => false)
  ) {
    warnings.push(
      "OpenCode already has a mobile notification plugin; permission alerts may duplicate.",
    );
  }
  return { agent: "opencode", path, pluginPath, warnings };
}

export async function uninstallOpenCode({
  home = homedir(),
  platform = process.platform,
  runCommand = run,
}) {
  const path = join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
  const pluginPath = join(home, ".config", "opencode", "plugin", "notify-permissions-v1.js");
  if (platform === "darwin") {
    await runCommand("launchctl", ["bootout", `gui/${process.getuid()}`, path]).catch(() => {});
  }
  await rm(path, { force: true });
  await rm(pluginPath, { force: true });
  return { agent: "opencode", removed: true };
}
