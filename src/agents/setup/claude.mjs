// SPDX-License-Identifier: Apache-2.0
import { readJson, atomicWrite } from "../configuration/files.mjs";
import {
  removeGroups,
  isClaudeHandler,
  STATUS_MESSAGE,
  cleanEmptyHooks,
} from "../configuration/hooks.mjs";
import { homedir } from "node:os";
import { join } from "node:path";

export async function installClaude({ home = homedir(), entrypoint }) {
  const path = join(home, ".claude", "settings.json");
  const config = await readJson(path, {});
  config.value.hooks ??= {};
  const groups = removeGroups(config.value.hooks.PermissionRequest, isClaudeHandler);
  groups.push({
    matcher: "*",
    hooks: [
      {
        type: "command",
        command: entrypoint,
        args: ["permissions", "hook", "claude"],
        timeout: 330,
        statusMessage: STATUS_MESSAGE,
      },
    ],
  });
  config.value.hooks.PermissionRequest = groups;
  await atomicWrite(path, `${JSON.stringify(config.value, null, 2)}\n`, config.hash);
  return { agent: "claude", path };
}

export async function uninstallClaude({ home = homedir() }) {
  const path = join(home, ".claude", "settings.json");
  const config = await readJson(path, {});
  if (config.content === undefined) return { agent: "claude", removed: false };
  if (config.value.hooks?.PermissionRequest) {
    config.value.hooks.PermissionRequest = removeGroups(
      config.value.hooks.PermissionRequest,
      isClaudeHandler,
    );
    if (config.value.hooks.PermissionRequest.length === 0) {
      delete config.value.hooks.PermissionRequest;
    }
  }
  cleanEmptyHooks(config.value);
  await atomicWrite(path, `${JSON.stringify(config.value, null, 2)}\n`, config.hash);
  return { agent: "claude", removed: true };
}
