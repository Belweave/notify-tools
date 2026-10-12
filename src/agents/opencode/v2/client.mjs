// SPDX-License-Identifier: Apache-2.0
import { Service } from "@opencode-ai/client/service";

export const MAX_SSE_BUFFER_BYTES = 16 * 1024 * 1024;

export const REQUEST_TIMEOUT_MS = 10_000;

export function headers(endpoint) {
  return { ...Service.headers(endpoint) };
}

export async function request(endpoint, path, options = {}) {
  const { signal, ...requestOptions } = options;
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await fetch(new URL(path, endpoint.url), {
    ...requestOptions,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: {
      ...headers(endpoint),
      ...(requestOptions.body ? { "content-type": "application/json" } : {}),
      ...requestOptions.headers,
    },
  });
  if (!response.ok) {
    const error = new Error(`OpenCode request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return undefined;
  return response.json();
}

export async function* subscribe(endpoint, signal) {
  const response = await fetch(new URL("/api/event", endpoint.url), {
    headers: headers(endpoint),
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error(`OpenCode event stream failed: ${response.status}`);
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    if (Buffer.byteLength(buffer) > MAX_SSE_BUFFER_BYTES) {
      throw new Error("OpenCode event exceeded the buffer limit");
    }
    while (true) {
      const boundary = buffer.search(/\r?\n\r?\n/);
      if (boundary < 0) break;
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) yield JSON.parse(data);
    }
  }
}

export function createOpenCodeClient(endpoint) {
  return {
    debug: {
      location: {
        list: () => request(endpoint, "/api/debug/location"),
      },
    },
    permission: {
      request: {
        list: ({ location } = {}) => {
          const url = new URL("/api/permission/request", endpoint.url);
          if (location?.directory) url.searchParams.set("location[directory]", location.directory);
          if (location?.workspace) url.searchParams.set("location[workspace]", location.workspace);
          return request(endpoint, url);
        },
      },
      get: async ({ sessionID, requestID }) => {
        const response = await request(
          endpoint,
          `/api/session/${encodeURIComponent(sessionID)}/permission/${encodeURIComponent(requestID)}`,
        );
        return response.data;
      },
      reply: ({ sessionID, requestID, reply, message }) =>
        request(
          endpoint,
          `/api/session/${encodeURIComponent(sessionID)}/permission/${encodeURIComponent(requestID)}/reply`,
          {
            method: "POST",
            body: JSON.stringify({ reply, ...(message ? { message } : {}) }),
          },
        ),
    },
    event: {
      subscribe: ({ signal } = {}) => subscribe(endpoint, signal),
    },
  };
}
