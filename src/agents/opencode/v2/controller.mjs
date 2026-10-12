// SPDX-License-Identifier: Apache-2.0
import { createOpenCodeClient } from "./client.mjs";
import { coalescedPermissionDecision } from "./decisions.mjs";
import { fingerprint, key } from "./identity.mjs";
import { Service } from "@opencode-ai/client/service";

export const jobs = new Map();

export const shutdown = new AbortController();

export async function replyIfCurrent(client, original, reply) {
  let current;
  try {
    current = await client.permission.get({
      sessionID: original.sessionID,
      requestID: original.id,
    });
  } catch {
    return;
  }
  if (fingerprint(current) !== fingerprint(original)) return;
  try {
    await client.permission.reply({
      sessionID: original.sessionID,
      requestID: original.id,
      reply,
      ...(reply === "reject" ? { message: "Denied through Notify." } : {}),
    });
  } catch {
    // The exact request may have been answered by another client.
  }
}

export function startRequest(client, request, location) {
  const id = key(request);
  if (jobs.has(id)) return;
  const job = { settled: false };
  jobs.set(id, job);
  void (async () => {
    try {
      const decision = await coalescedPermissionDecision(request, location);
      if (!job.settled) {
        await replyIfCurrent(client, request, decision === "approved" ? "once" : "reject");
      }
    } catch {
      if (!job.settled) await replyIfCurrent(client, request, "reject");
    } finally {
      jobs.delete(id);
    }
  })();
}

export function settleRequest(sessionID, requestID) {
  const job = jobs.get(`${sessionID}:${requestID}`);
  if (job) job.settled = true;
  jobs.delete(`${sessionID}:${requestID}`);
}

export async function reconcile(client) {
  const locations = await client.debug.location.list();
  await Promise.all(
    locations.map(async (location) => {
      try {
        const pending = await client.permission.request.list({
          location: {
            directory: location.directory,
            ...(location.workspaceID ? { workspace: location.workspaceID } : {}),
          },
        });
        for (const request of pending.data) startRequest(client, request, pending.location);
      } catch {
        // A location can disappear while reconciliation is running.
      }
    }),
  );
}

export async function connect() {
  const endpoint = await Service.discover();
  if (!endpoint) return undefined;
  return createOpenCodeClient(endpoint);
}

export function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function runOpenCodeV2Bridge() {
  process.on("SIGINT", () => shutdown.abort());
  process.on("SIGTERM", () => shutdown.abort());
  while (!shutdown.signal.aborted) {
    const client = await connect().catch(() => undefined);
    if (!client) {
      await sleep(1000);
      continue;
    }
    let timer;
    try {
      await reconcile(client);
      timer = setInterval(() => void reconcile(client).catch(() => {}), 30_000);
      for await (const event of client.event.subscribe({
        signal: shutdown.signal,
      })) {
        if (event.type === "permission.asked") {
          startRequest(client, event.data, event.location);
        } else if (event.type === "permission.replied") {
          settleRequest(event.data.sessionID, event.data.requestID);
        }
      }
      if (!shutdown.signal.aborted) await sleep(1000);
    } catch {
      if (!shutdown.signal.aborted) await sleep(1000);
    } finally {
      if (timer) clearInterval(timer);
    }
  }
}
