// SPDX-License-Identifier: Apache-2.0
import { askNotifyPermission, permissionSummary, uniqueIdempotencyKey } from "../approval-api.mjs";
import { readHookInput } from "./input.mjs";

export function hookDecision(_agent, allow, message = "Denied through Notify.") {
  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: allow ? { behavior: "allow" } : { behavior: "deny", message },
    },
  };
}

export async function handlePermissionHook(agent, input, ask = askNotifyPermission) {
  if (input?.hook_event_name !== "PermissionRequest") {
    return hookDecision(agent, false, "Invalid permission request; denied by Notify policy.");
  }
  const agentName = agent === "claude" ? "Claude Code" : "Codex";
  const summary = permissionSummary({
    agent: agentName,
    cwd: input.cwd,
    toolName: input.tool_name,
    resourceCount: 1,
  });
  const decision = await ask({
    ...summary,
    idempotencyKey: uniqueIdempotencyKey(`${agent}-permission`),
  });
  return hookDecision(agent, decision === "approved");
}

export async function runPermissionHook(agent) {
  try {
    const input = await readHookInput();
    return await handlePermissionHook(agent, input);
  } catch {
    return hookDecision(agent, false, "Permission bridge failed; denied by policy.");
  }
}

export { readHookInput } from "./input.mjs";
