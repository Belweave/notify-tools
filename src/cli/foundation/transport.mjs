// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from "node:crypto";
import { VERSION } from "../version.mjs";
import { RequestError } from "./errors.mjs";

export const USER_AGENT = `notify-tools/${VERSION}`;

/** Delays before retrying an idempotent write after a network or gateway failure. */
const RETRY_DELAYS_MS = [500, 2000];
const RETRYABLE_STATUS = new Set([0, 502, 503, 504]);

async function send(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new RequestError(error instanceof Error ? error.message : "Network request failed", 0);
  }
  return response;
}

async function parse(response) {
  const body = await response
    .json()
    .catch(() => ({ error: `Request failed (${response.status})` }));
  if (!response.ok) throw new RequestError(body.error ?? "Request failed", response.status, body);
  return body;
}

function base(apiUrl) {
  return String(apiUrl).replace(/\/$/, "");
}

/**
 * Authenticated JSON request. A write that carries an Idempotency-Key is
 * retried with the same key after a network failure or a gateway error, so a
 * retry can never create a second notification, prompt or activity.
 */
export async function request(config, path, init = {}) {
  const headers = {
    authorization: `Bearer ${config.token}`,
    "content-type": "application/json",
    "user-agent": USER_AGENT,
    ...init.headers,
  };
  const idempotent = Boolean(headers["Idempotency-Key"]);
  const sleep = config.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await send(`${base(config.apiUrl)}${path}`, { ...init, headers });
      return await parse(response);
    } catch (error) {
      const retryable =
        idempotent &&
        attempt < RETRY_DELAYS_MS.length &&
        error instanceof RequestError &&
        RETRYABLE_STATUS.has(error.status) &&
        !init.signal?.aborted;
      if (!retryable) throw error;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/** Builds Idempotency-Key headers: the caller's key, or a fresh one for this invocation. */
export function idempotencyHeaders(options) {
  return { "Idempotency-Key": options["idempotency-key"] ?? `notify-cli-${randomUUID()}` };
}

/** Authenticated request returning the exact response bytes. */
export async function requestBytes(config, path) {
  const response = await send(`${base(config.apiUrl)}${path}`, {
    headers: { authorization: `Bearer ${config.token}`, "user-agent": USER_AGENT },
  });
  if (!response.ok) await parse(response);
  return Buffer.from(await response.arrayBuffer());
}

export async function publicRequest(apiUrl, path, init = {}) {
  const response = await send(`${base(apiUrl)}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "user-agent": USER_AGENT, ...init.headers },
  });
  return parse(response);
}

/** Adds a re-login hint when a token predates the app scopes. */
export async function appsRequest(config, path, init) {
  try {
    return await request(config, path, init);
  } catch (error) {
    if (error instanceof RequestError && error.status === 403) {
      throw new RequestError(
        `${error.message}. Run notify auth login to grant app scopes (apps:read, apps:write).`,
        error.status,
        error.body,
      );
    }
    throw error;
  }
}

/** Adds a re-login hint naming the scopes a 403 reported as missing. */
export async function scopedRequest(config, path, init) {
  try {
    return await request(config, path, init);
  } catch (error) {
    const required = error instanceof RequestError ? error.body?.required : undefined;
    if (error instanceof RequestError && error.status === 403 && Array.isArray(required)) {
      throw new RequestError(
        `${error.message}. Run notify auth login --scope ... to grant ${required.join(", ")}.`,
        error.status,
        error.body,
      );
    }
    throw error;
  }
}
