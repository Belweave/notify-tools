// SPDX-License-Identifier: Apache-2.0
import { readOptional } from "../configuration/files.mjs";
import { STATUS_MESSAGE } from "../configuration/hooks.mjs";
import { LABEL } from "./opencode.mjs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export async function installationStatus({ home = homedir() } = {}) {
  const claude = await readOptional(join(home, ".claude", "settings.json"));
  const codex = await readOptional(join(home, ".codex", "hooks.json"));
  const openCodePath = join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
  const openCodeV1Path = join(home, ".config", "opencode", "plugin", "notify-permissions-v1.js");
  return {
    claude: claude ? claude.includes(STATUS_MESSAGE) : false,
    codex: codex ? codex.includes("permissions hook codex") : false,
    opencode: {
      v1: await access(openCodeV1Path)
        .then(() => true)
        .catch(() => false),
      v2: await access(openCodePath)
        .then(() => true)
        .catch(() => false),
    },
  };
}
