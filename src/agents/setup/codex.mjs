// SPDX-License-Identifier: Apache-2.0
import { readJson, atomicWrite, readOptional } from "../configuration/files.mjs";
import {
  removeGroups,
  isCodexHandler,
  shellQuote,
  STATUS_MESSAGE,
  cleanEmptyHooks,
} from "../configuration/hooks.mjs";
import { homedir } from "node:os";
import { join } from "node:path";

export async function installCodex({ home = homedir(), entrypoint }) {
  const path = join(home, ".codex", "hooks.json");
  const config = await readJson(path, {
    description: "Notify permission approvals.",
    hooks: {},
  });
  config.value.description ??= "Notify permission approvals.";
  config.value.hooks ??= {};
  const groups = removeGroups(config.value.hooks.PermissionRequest, isCodexHandler);
  groups.push({
    hooks: [
      {
        type: "command",
        command: `${shellQuote(entrypoint)} permissions hook codex`,
        timeout: 330,
        statusMessage: STATUS_MESSAGE,
      },
    ],
  });
  config.value.hooks.PermissionRequest = groups;
  await atomicWrite(path, `${JSON.stringify(config.value, null, 2)}\n`, config.hash);
  const toml = await readOptional(join(home, ".codex", "config.toml"));
  const warnings = [];
  if (toml && /^\s*\[\[?hooks\./m.test(toml)) {
    warnings.push("Codex also has inline hooks; review merged definitions in /hooks.");
  }
  return {
    agent: "codex",
    path,
    warnings,
    next: "Open Codex /hooks and trust the Notify hook.",
  };
}

export async function uninstallCodex({ home = homedir() }) {
  const path = join(home, ".codex", "hooks.json");
  const config = await readJson(path, {});
  if (config.content === undefined) return { agent: "codex", removed: false };
  if (config.value.hooks?.PermissionRequest) {
    config.value.hooks.PermissionRequest = removeGroups(
      config.value.hooks.PermissionRequest,
      isCodexHandler,
    );
    if (config.value.hooks.PermissionRequest.length === 0) {
      delete config.value.hooks.PermissionRequest;
    }
  }
  cleanEmptyHooks(config.value);
  await atomicWrite(path, `${JSON.stringify(config.value, null, 2)}\n`, config.hash);
  return { agent: "codex", removed: true };
}
