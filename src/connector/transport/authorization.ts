// SPDX-License-Identifier: Apache-2.0
export function secureControlOrigin(url: string): string {
  const parsed = new URL(url);
  const loopback = ["127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (
    parsed.username ||
    parsed.password ||
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
  ) {
    throw new Error(
      "Notify and relay control URLs require HTTPS (HTTP is allowed only on loopback)",
    );
  }
  return parsed.origin;
}

/** Add credentials only to this relay's exact tunnel-creation endpoint. */
export function authorizeRelayCreate(
  relayApi: string,
  token: string,
  send: typeof fetch = globalThis.fetch,
): typeof fetch {
  const allowedOrigin = secureControlOrigin(relayApi);
  return (input, init) => {
    const source = input instanceof Request ? input : undefined;
    const address = source?.url ?? String(input);
    const method = (init?.method ?? source?.method ?? "GET").toUpperCase();
    let target: URL | undefined;
    try {
      target = new URL(address);
    } catch {
      /* The underlying fetch reports invalid input. */
    }
    const path = target?.pathname.replace(/\/+/g, "/").replace(/\/+$/, "") || "/";
    if (
      method !== "POST" ||
      target?.origin !== allowedOrigin ||
      path !== "/api/tunnel" ||
      target.username ||
      target.password
    )
      return send(input, init);
    const headers = new Headers(init?.headers ?? source?.headers);
    if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
    return source
      ? send(new Request(source, { ...init, headers }))
      : send(input, { ...init, headers });
  };
}
/** @deprecated Pass authorizeRelayCreate() to your tunnel factory instead. */
export function installRelayCreateAuth(relayApi: string, token: string): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = authorizeRelayCreate(relayApi, token, previous);
  return () => {
    globalThis.fetch = previous;
  };
}
