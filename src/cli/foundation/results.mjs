// SPDX-License-Identifier: Apache-2.0
import { request } from "./transport.mjs";

export const TERMINAL = new Set([
  "approved",
  "denied",
  "yes",
  "no",
  "replied",
  "canceled",
  "expired",
]);

export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export function interactionExitCode(interaction) {
  if (interaction.status === "denied" || interaction.status === "no") return 5;
  if (interaction.status === "canceled" || interaction.status === "expired") return 4;
  return 0;
}

/** `--poll` waits this long at most for an instant answer before returning. */
export const POLL_TIMEOUT_SECONDS = 20;

export function dispatchExitCode(body) {
  return body.accepted === 0 && !(typeof body.queued === "number" && body.queued > 0) ? 7 : 0;
}

export async function waitForInteraction(config, id, timeoutSeconds, runtime) {
  const now = runtime?.now ?? (() => Date.now());
  const deadline = now() + timeoutSeconds * 1000;
  let body;
  while (true) {
    const remaining = Math.max(0, (deadline - now()) / 1000);
    body = await request(
      config,
      `/api/agent/interactions/${encodeURIComponent(id)}/wait?timeout=${Math.min(25, remaining)}`,
    );
    if (TERMINAL.has(body.interaction.status)) return body;
    if (now() >= deadline) return { ...body, timedOut: true };
  }
}

export function formatApp(app) {
  return `${app.id}  ${app.name}  ${app.url}`;
}

/** A page that reached nobody exits 7 like an undelivered notify; merged repeats exit 0. */
export function pageExitCode(body) {
  return body.accepted === 0 && !body.deduplicated ? 7 : 0;
}
