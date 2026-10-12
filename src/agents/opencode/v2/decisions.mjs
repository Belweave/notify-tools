// SPDX-License-Identifier: Apache-2.0
import {
  askNotifyPermission,
  permissionSummary,
  stableIdempotencyKey,
} from "../../approval-api.mjs";
import { decisionKey } from "./identity.mjs";

export const decisions = new Map();

export function coalescedPermissionDecision(request, location, ask = askNotifyPermission) {
  const id = decisionKey(request, location);
  const existing = decisions.get(id);
  if (existing) return existing;
  const summary = permissionSummary({
    agent: "OpenCode",
    cwd: location?.directory,
    toolName: request.action,
    resourceCount: request.resources.length,
  });
  const decision = ask({
    ...summary,
    idempotencyKey: stableIdempotencyKey("opencode-permission", [request.sessionID, request.id]),
  });
  decisions.set(id, decision);
  const cleanup = () => {
    if (decisions.get(id) === decision) decisions.delete(id);
  };
  void decision.then(cleanup, cleanup);
  return decision;
}
