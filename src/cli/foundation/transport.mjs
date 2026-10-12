// SPDX-License-Identifier: Apache-2.0
import { RequestError } from "./errors.mjs";

export async function request(config, path, init = {}) {
  let response;
  try {
    response = await fetch(`${String(config.apiUrl).replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
  } catch (error) {
    throw new RequestError(error instanceof Error ? error.message : "Network request failed", 0);
  }
  const body = await response
    .json()
    .catch(() => ({ error: `Request failed (${response.status})` }));
  if (!response.ok) throw new RequestError(body.error ?? "Request failed", response.status, body);
  return body;
}

export async function publicRequest(apiUrl, path, init = {}) {
  let response;
  try {
    response = await fetch(`${String(apiUrl).replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init.headers },
    });
  } catch (error) {
    throw new RequestError(error instanceof Error ? error.message : "Network request failed", 0);
  }
  const body = await response
    .json()
    .catch(() => ({ error: `Request failed (${response.status})` }));
  if (!response.ok) throw new RequestError(body.error ?? "Request failed", response.status, body);
  return body;
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
