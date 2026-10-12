// SPDX-License-Identifier: Apache-2.0
import { normalize } from "./identity.mjs";

export const REQUEST_TIMEOUT_MS = 10_000;

export function authHeaders() {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return {};
  const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
  return {
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
  };
}

export async function request(serverUrl, path, directory, options = {}) {
  const url = new URL(path, serverUrl);
  if (directory) url.searchParams.set("directory", directory);
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      ...authHeaders(),
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = new Error(`OpenCode V1 request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return undefined;
  return response.json();
}

export async function listPending(serverUrl, directory) {
  const response = await request(serverUrl, "/permission", directory);
  if (!Array.isArray(response)) throw new Error("OpenCode V1 permission list was invalid");
  return response.map(normalize);
}

export async function reply(serverUrl, directory, permission, decision) {
  try {
    await request(serverUrl, `/permission/${encodeURIComponent(permission.id)}/reply`, directory, {
      method: "POST",
      body: JSON.stringify({
        reply: decision,
        ...(decision === "reject" ? { message: "Denied through Notify." } : {}),
      }),
    });
  } catch (error) {
    if (!permission.sessionID) throw error;
    await request(
      serverUrl,
      `/session/${encodeURIComponent(permission.sessionID)}/permissions/${encodeURIComponent(permission.id)}`,
      directory,
      { method: "POST", body: JSON.stringify({ response: decision }) },
    );
  }
}
