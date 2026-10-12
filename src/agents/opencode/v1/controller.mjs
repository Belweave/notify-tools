// SPDX-License-Identifier: Apache-2.0
import {
  askNotifyPermission,
  permissionSummary,
  stableIdempotencyKey,
} from "../../approval-api.mjs";
import { listPending, reply } from "./http.mjs";
import { fingerprint, normalize, jobKey } from "./identity.mjs";

export const jobs = new Map();

export async function replyIfCurrent(serverUrl, directory, original, decision) {
  let current;
  try {
    current = (await listPending(serverUrl, directory)).find((item) => item.id === original.id);
  } catch {
    return;
  }
  if (!current || fingerprint(current) !== fingerprint(original)) return;
  await reply(serverUrl, directory, original, decision).catch(() => {});
}

export function startRequest(serverUrl, directory, request, ask = askNotifyPermission) {
  const permission = normalize(request);
  const id = jobKey(serverUrl, directory, permission.id);
  if (!permission.id || !permission.sessionID) return Promise.resolve();
  const existing = jobs.get(id);
  if (existing) return existing.promise;
  const job = { settled: false, promise: undefined };
  jobs.set(id, job);
  job.promise = (async () => {
    try {
      const summary = permissionSummary({
        agent: "OpenCode",
        cwd: directory,
        toolName: permission.action,
        resourceCount: permission.resources.length,
      });
      const decision = await ask({
        ...summary,
        idempotencyKey: stableIdempotencyKey("opencode-v1-permission", [
          serverUrl,
          directory,
          permission.id,
        ]),
      });
      if (!job.settled) {
        await replyIfCurrent(
          serverUrl,
          directory,
          permission,
          decision === "approved" ? "once" : "reject",
        );
      }
    } finally {
      jobs.delete(id);
    }
  })().catch(() => {});
  return job.promise;
}

export async function reconcile(serverUrl, directory, ask) {
  const pending = await listPending(serverUrl, directory);
  await Promise.all(pending.map((request) => startRequest(serverUrl, directory, request, ask)));
}

export async function handleOpenCodeV1Event(
  { serverUrl, directory, event },
  ask = askNotifyPermission,
) {
  try {
    if (event.type === "permission.asked" || event.type === "permission.updated") {
      await startRequest(serverUrl, directory, event.properties, ask);
    } else if (event.type === "server.connected") {
      await reconcile(serverUrl, directory, ask);
    }
  } catch {
    // V1 dispatch does not await event hooks; all failures stay contained.
  }
}
