// SPDX-License-Identifier: Apache-2.0
import { InterruptedError } from "./errors.mjs";
import { request } from "./transport.mjs";

/** Marks a command result whose stdout is raw text (for example CSV) instead of JSON. */
export const RAW_OUTPUT = Symbol("raw-output");

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
  return body.accepted === 0 && !(typeof body.queued === "number" && body.queued > 0) && !(typeof body.superseded === "number" && body.superseded > 0) ? 7 : 0;
}

/**
 * Long-polls an interaction until it is answered or the deadline passes. Ctrl-C
 * (runtime.onInterrupt) stops waiting cleanly: the prompt stays pending and the
 * error carries the last known state so the caller can print how to resume.
 */
export async function waitForInteraction(config, id, timeoutSeconds, runtime) {
  const now = runtime?.now ?? (() => Date.now());
  const deadline = now() + timeoutSeconds * 1000;
  const controller = new AbortController();
  const unsubscribe = runtime?.onInterrupt?.(() => controller.abort()) ?? (() => {});
  let body;
  try {
    while (true) {
      const remaining = Math.max(0, (deadline - now()) / 1000);
      try {
        body = await request(
          config,
          `/api/agent/interactions/${encodeURIComponent(id)}/wait?timeout=${Math.min(25, Math.round(remaining))}`,
          { signal: controller.signal },
        );
      } catch (error) {
        if (!controller.signal.aborted) throw error;
      }
      if (controller.signal.aborted) {
        throw new InterruptedError(
          `Stopped waiting. ${id} is still pending; resume with: notify interaction wait ${id}`,
          body ? { ...body, timedOut: true, interrupted: true } : { interaction: { id, status: "pending" }, timedOut: true, interrupted: true },
        );
      }
      if (TERMINAL.has(body.interaction.status)) return body;
      if (now() >= deadline) return { ...body, timedOut: true };
    }
  } finally {
    unsubscribe();
  }
}

export function formatApp(app) {
  return `${app.id}  ${app.name}  ${app.url}`;
}

/** A page that reached nobody exits 7 like an undelivered notify; merged repeats exit 0. */
export function pageExitCode(body) {
  return body.accepted === 0 && !body.deduplicated ? 7 : 0;
}
