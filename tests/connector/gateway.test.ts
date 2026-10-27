import { createServer, type IncomingHttpHeaders, request } from "node:http";
import { connect } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { type AccessIdentity, createAccessGateway } from "../../src/connector/gateway";

const upstreamFailure = vi.hoisted(() => ({ enabled: false }));
vi.mock("node:http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:http")>();
  return {
    ...actual,
    request: (...args: unknown[]) => {
      const options = args[0];
      if (
        upstreamFailure.enabled &&
        options &&
        typeof options === "object" &&
        "hostname" in options
      )
        throw new Error("Injected upstream construction failure");
      return (actual.request as (...args: unknown[]) => ReturnType<typeof actual.request>)(...args);
    },
  };
});
const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup.length = 0;
  vi.useRealTimers();
  vi.restoreAllMocks();
  upstreamFailure.enabled = false;
});
const origin = "https://work.tunnel.clawchest.com";
const callbackBody = JSON.stringify({ interactionId: "int_callback", answer: "yes" });
const callbackSignature = `v1=${"a".repeat(64)}`;
const forgedForwardingHeaders = Object.fromEntries(
  [
    "x-real-ip",
    "client-ip",
    "x-client-ip",
    "x-cluster-client-ip",
    "x-originating-ip",
    "x-remote-ip",
    "x-remote-addr",
    "true-client-ip",
    "cf-connecting-ip",
    "cf-ipcountry",
    "via",
    "x-original-forwarded-for",
    "x-original-forwarded-host",
    "forwarded",
    "x-forwarded-for",
  ].map((name) => [name, "203.0.113.7"]),
);
const callbackHeaders = {
  "content-type": "application/json",
  "notify-timestamp": "1791840000",
  "notify-signature": callbackSignature,
};
async function setup(
  recheckMs = 20,
  callbackPath = "/approval-receiver",
  onCheck?: (pass: string) => Promise<void>,
  additionalPasses: string[] = [],
  responseHeaders: Record<string, string> = {},
  onConsume?: (pass: string) => Promise<void>,
  rawResponse?: string,
) {
  let hits = 0,
    upgrades = 0,
    checks = 0,
    revoked = false;
  let received: IncomingHttpHeaders = {};
  let receivedPath: string | undefined,
    receivedBody = "",
    callbackUsed = false;
  const upstreamSockets = new Set<import("node:net").Socket>();
  const upstream = createServer((req, res) => {
    hits++;
    received = req.headers;
    receivedPath = req.url;
    receivedBody = "";
    req.on("data", (chunk) => {
      receivedBody += chunk;
    });
    req.on("end", () => {
      if (rawResponse) {
        req.socket.end(rawResponse);
        return;
      }
      res.writeHead(200, responseHeaders).end("private employer content");
    });
  });
  upstream.on("connection", (socket) => {
    upstreamSockets.add(socket);
    socket.on("close", () => upstreamSockets.delete(socket));
  });
  upstream.on("upgrade", (req, socket) => {
    upgrades++;
    received = req.headers;
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: test\r\n\r\n",
    );
    socket.on("data", (data) => socket.write(data));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  cleanup.push(() => {
    for (const socket of upstreamSockets) socket.destroy();
    return new Promise<void>((resolve) => upstream.close(() => resolve()));
  });
  const address = upstream.address();
  if (!address || typeof address === "string") throw Error();
  const used = new Set<string>();
  const identity: AccessIdentity = {
    subject: "pairwise",
    appId: "app_work",
    teamId: "team_work",
    teamRole: "member",
    expiresAt: Math.floor(Date.now() / 1000) + 60,
  };
  const gateway = await createAccessGateway({
    target: `127.0.0.1:${address.port}`,
    routeName: "work",
    recheckMs,
    authorizeCallback: async (input) => {
      if (
        revoked ||
        callbackUsed ||
        input.body !== callbackBody ||
        input.signature !== callbackSignature ||
        input.timestamp !== callbackHeaders["notify-timestamp"]
      )
        throw Error("Callback denied");
      callbackUsed = true;
      return { path: callbackPath };
    },
    authorize: async (pass, consume) => {
      if (consume) await onConsume?.(pass);
      if (!consume) {
        checks++;
        await onCheck?.(pass);
      }
      if (
        revoked ||
        !["signed-pass", "signed-pass-second", ...additionalPasses].includes(pass) ||
        (consume && used.has(pass)) ||
        (!consume && !used.has(pass))
      )
        throw Error("deny");
      if (consume) used.add(pass);
      return { ...identity };
    },
  });
  cleanup.push(gateway.close);
  const call = (
    path: string,
    headers: Record<string, string> = {},
    body?: string,
    method?: string,
  ) =>
    new Promise<{ status: number; body: string; headers: IncomingHttpHeaders }>(
      (resolve, reject) => {
        const req = request(
          `http://${gateway.target}${path}`,
          {
            method: method ?? (body === undefined ? "GET" : "POST"),
            headers: { host: new URL(origin).host, ...headers },
          },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("aborted", () => reject(new Error("Response aborted")));
            res.on("error", reject);
            res.on("end", () =>
              resolve({ status: res.statusCode ?? 0, body, headers: res.headers }),
            );
          },
        );
        req.on("error", reject);
        req.end(body);
      },
    );
  const exchange = (pass = "signed-pass") =>
    call(
      "/.notify/session",
      { origin, "content-type": "application/json" },
      JSON.stringify({ pass }),
    );
  return {
    gateway,
    call,
    exchange,
    counts: () => ({ hits, upgrades, checks }),
    received: () => received,
    receivedCallback: () => ({ path: receivedPath, body: receivedBody }),
    revoke: () => {
      revoked = true;
    },
    identity,
  };
}
it("never forwards missing, invalid, replayed, cross-origin or pre-registration requests", async () => {
  const env = await setup();
  expect((await env.call("/")).status).toBe(503);
  env.gateway.setOrigin(origin);
  for (const path of ["/", "/bundle.js", "/favicon.ico", "/api/data"])
    expect((await env.call(path)).status).toBe(401);
  const bootstrap = await env.call("/", { accept: "text/html" });
  expect(bootstrap.body).toContain("Connect with Notify");
  expect(bootstrap.body).not.toContain("private employer");
  expect(
    (
      await env.call(
        "/.notify/session",
        { origin: "https://evil.example", "content-type": "application/json" },
        '{"pass":"signed-pass"}',
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await env.call(
        "/.notify/session",
        { origin, "content-type": "application/json" },
        '{"pass":"fake"}',
      )
    ).status,
  ).toBe(401);
  expect(env.counts().hits).toBe(0);
  const accepted = await env.exchange();
  expect(accepted.status).toBe(204);
  expect(accepted.headers["set-cookie"]?.[0]).toMatch(/HttpOnly; Secure; SameSite=Strict/);
  expect((await env.exchange()).status).toBe(401);
  const cookie = accepted.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  expect(
    (await env.call("/bundle.js", { cookie, origin: "https://sibling.tunnel.clawchest.com" }))
      .status,
  ).toBe(403);
  expect((await env.call("/bundle.js", { cookie, "sec-fetch-site": "same-site" })).status).toBe(
    403,
  );
  const asset = await env.call("/bundle.js", {
    cookie: `${cookie}; app_session=ok`,
    "x-notify-team-id": "evil",
    "x-notify-subject": "admin",
    authorization: "Bearer must-not-forward",
    ...forgedForwardingHeaders,
  });
  expect(asset.status).toBe(200);
  expect(asset.headers["cache-control"]).toBe("no-store");
  expect(env.received()["x-notify-team-id"]).toBe("team_work");
  expect(env.received()["x-notify-subject"]).toBe("pairwise");
  expect(env.received().authorization).toBeUndefined();
  expect(env.received().cookie).toBe("app_session=ok");
  for (const name of Object.keys(forgedForwardingHeaders))
    expect(env.received()[name], name).toBeUndefined();
  expect(env.received()["x-forwarded-host"]).toBe(new URL(origin).host);
  expect(env.received()["x-forwarded-proto"]).toBe("https");
  env.revoke();
  expect((await env.call("/bundle.js", { cookie })).status).toBe(401);
  expect(env.counts().hits).toBe(1);
});
it("lets sibling and cross-site document navigations reach sign-in or the live session", async () => {
  const env = await setup();
  env.gateway.setOrigin(origin);
  const navigation = { accept: "text/html", "sec-fetch-dest": "document" };
  for (const site of ["same-site", "cross-site"]) {
    const headers = { ...navigation, "sec-fetch-site": site };
    const signedOut = await env.call("/", headers);
    expect(signedOut.status).toBe(401);
    expect(signedOut.headers["content-type"]).toContain("text/html");
    expect(signedOut.body).toContain("Connect with Notify");
    expect((await env.call("/", headers, undefined, "HEAD")).status).toBe(401);
  }
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  for (const site of ["same-site", "cross-site"]) {
    const headers = { ...navigation, "sec-fetch-site": site, cookie };
    expect((await env.call("/", headers)).status).toBe(200);
    expect((await env.call("/", headers, undefined, "HEAD")).status).toBe(200);
    for (const badOrigin of ["https://sibling.tunnel.clawchest.com", "null"])
      expect((await env.call("/", { ...headers, origin: badOrigin })).status).toBe(403);
    expect((await env.call("/bundle.js", { cookie, "sec-fetch-site": site })).status).toBe(403);
    expect((await env.call("/", { ...headers, "sec-fetch-dest": "iframe" })).status).toBe(403);
    expect((await env.call("/", headers, "form", "POST")).status).toBe(403);
    expect(
      (
        await env.call(
          "/.notify/session",
          { ...headers, origin, "content-type": "application/json" },
          '{"pass":"signed-pass-second"}',
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await env.call(
          "/.notify/callback",
          { ...callbackHeaders, "sec-fetch-site": site },
          callbackBody,
        )
      ).status,
    ).toBe(403);
  }
  expect(env.counts().hits).toBe(4);
});
function ws(
  target: string,
  cookie?: string,
  path = "/socket",
  headers: Record<string, string> = {},
) {
  const [host, port] = target.split(":");
  const socket = connect(Number(port), host ?? "127.0.0.1");
  const response = new Promise<string>((resolve, reject) => {
    socket.once("error", reject);
    socket.once("data", (chunk) => resolve(chunk.toString()));
  });
  socket.on("connect", () =>
    socket.write(
      `GET ${path} HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: ${origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGVzdA==\r\n${cookie ? `Cookie: ${cookie}\r\n` : ""}${Object.entries(
        headers,
      )
        .map(([name, value]) => `${name}: ${value}\r\n`)
        .join("")}\r\n`,
    ),
  );
  return { socket, response };
}
it("blocks unauthenticated WS upgrades and closes authorized sockets on revocation", async () => {
  const env = await setup();
  env.gateway.setOrigin(origin);
  const denied = ws(env.gateway.target);
  expect(await denied.response).toContain("401");
  denied.socket.destroy();
  expect(env.counts().upgrades).toBe(0);
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const allowed = ws(env.gateway.target, cookie);
  expect(await allowed.response).toContain("101");
  expect(env.counts().upgrades).toBe(1);
  const closed = new Promise<void>((resolve) => allowed.socket.once("close", () => resolve()));
  env.revoke();
  await closed;
});
it("strips forged forwarding headers from WebSocket upgrades", async () => {
  const env = await setup();
  env.gateway.setOrigin(origin);
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const allowed = ws(env.gateway.target, cookie, "/socket", forgedForwardingHeaders);
  expect(await allowed.response).toContain("101");
  allowed.socket.destroy();
  for (const name of Object.keys(forgedForwardingHeaders))
    expect(env.received()[name], name).toBeUndefined();
  expect(env.received()["x-notify-subject"]).toBe("pairwise");
  expect(env.received()["x-forwarded-host"]).toBe(new URL(origin).host);
  expect(env.received()["x-forwarded-proto"]).toBe("https");
});
it("expires sessions and open sockets no later than the signed pass", async () => {
  const env = await setup(15_000);
  env.gateway.setOrigin(origin);
  env.identity.expiresAt = Math.floor(Date.now() / 1000) + 1;
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const allowed = ws(env.gateway.target, cookie);
  expect(await allowed.response).toContain("101");
  await new Promise<void>((resolve) => allowed.socket.once("close", () => resolve()));
  expect((await env.call("/", { cookie })).status).toBe(401);
});

it("delivers signed callbacks only through the dedicated backend-authorized endpoint", async () => {
  const env = await setup();
  env.gateway.setOrigin(origin);
  for (const path of [
    "/approval-receiver",
    "/bundle.js",
    "/.notify/callback?path=/secret",
    "/.notify/callback/secret",
  ]) {
    expect((await env.call(path, callbackHeaders, callbackBody)).status).toBe(403);
  }
  expect((await env.call("/.notify/callback", callbackHeaders)).status).toBe(403);
  expect((await env.call("/.notify/callback", callbackHeaders, callbackBody, "PUT")).status).toBe(
    403,
  );
  expect(
    (await env.call("/.notify/callback", { ...callbackHeaders, origin }, callbackBody)).status,
  ).toBe(403);
  expect(
    (
      await env.call(
        "/.notify/callback",
        { ...callbackHeaders, "notify-signature": `v1=${"b".repeat(64)}` },
        callbackBody,
      )
    ).status,
  ).toBe(401);
  expect(
    (await env.call("/.notify/callback", callbackHeaders, '{"interactionId":"other"}')).status,
  ).toBe(401);
  expect(env.counts().hits).toBe(0);
  for (const authorization of ["Bearer callback-credential", "Basic forged", ""]) {
    expect(
      (await env.call("/.notify/callback", { ...callbackHeaders, authorization }, callbackBody))
        .status,
    ).toBe(403);
  }
  expect(env.counts().hits).toBe(0);
  const accepted = await env.call(
    "/.notify/callback",
    {
      ...callbackHeaders,
      cookie: "sensitive=never",
      "x-notify-subject": "fake-admin",
      "x-forwarded-host": "evil.test",
    },
    callbackBody,
  );
  expect(accepted.status).toBe(204);
  expect(accepted.body).toBe("");
  expect(env.receivedCallback()).toEqual({ path: "/approval-receiver", body: callbackBody });
  expect(env.received().authorization).toBeUndefined();
  expect(env.received()["notify-signature"]).toBe(callbackSignature);
  expect(env.received()["notify-timestamp"]).toBe(callbackHeaders["notify-timestamp"]);
  expect(env.received()["x-notify-subject"]).toBeUndefined();
  expect(env.received()["x-forwarded-host"]).toBeUndefined();
  expect(env.received().cookie).toBeUndefined();
  expect((await env.call("/.notify/callback", callbackHeaders, callbackBody)).status).toBe(401);
  expect(env.counts().hits).toBe(1);
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const upgrade = ws(env.gateway.target, cookie, "/.notify/callback");
  expect(await upgrade.response).toContain("403");
  upgrade.socket.destroy();
  expect(env.counts().upgrades).toBe(0);
  const killed = await setup();
  killed.gateway.setOrigin(origin);
  killed.revoke();
  expect((await killed.call("/.notify/callback", callbackHeaders, callbackBody)).status).toBe(401);
  expect(killed.counts().hits).toBe(0);
});
it("rejects an invalid backend callback destination and oversized callback bodies", async () => {
  const env = await setup(20, "//evil.test/private");
  env.gateway.setOrigin(origin);
  expect((await env.call("/.notify/callback", callbackHeaders, callbackBody)).status).toBe(401);
  expect(env.counts().hits).toBe(0);
  const large = await env
    .call("/.notify/callback", callbackHeaders, JSON.stringify({ blob: "a".repeat(65_536) }))
    .catch(() => ({ status: 0 }));
  expect([0, 401]).toContain(large.status);
  expect(env.counts().hits).toBe(0);
});

it("coalesces concurrent session checks without caching completed authorization", async () => {
  let release!: () => void;
  let pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const env = await setup(15_000, "/approval-receiver", () => pending);
  env.gateway.setOrigin(origin);
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const requests = Array.from({ length: 6 }, (_, index) => env.call(`/asset-${index}`, { cookie }));
  await vi.waitFor(() => expect(env.counts().checks).toBe(1));
  expect(env.counts().hits).toBe(0);
  release();
  expect((await Promise.all(requests)).map((result) => result.status)).toEqual(Array(6).fill(200));
  expect(env.counts().checks).toBe(1);
  expect((await env.call("/later", { cookie })).status).toBe(200);
  expect(env.counts().checks).toBe(2);

  // A distinct browser session must never inherit another session's in-flight result.
  const otherCookie =
    (await env.exchange("signed-pass-second")).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const separate = [env.call("/first", { cookie }), env.call("/second", { cookie: otherCookie })];
  await vi.waitFor(() => expect(env.counts().checks).toBe(4));
  env.revoke();
  release();
  expect((await Promise.all(separate)).map((result) => result.status)).toEqual([401, 401]);
  expect((await env.call("/revoked", { cookie })).status).toBe(401);
  expect(env.counts().hits).toBe(7);
});

it("checks all streams in a session once per interval and closes every stream on revocation", async () => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  const env = await setup(15_000);
  env.gateway.setOrigin(origin);
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const streams = [];
  for (let index = 0; index < 3; index++) {
    const stream = ws(env.gateway.target, cookie);
    expect(await stream.response).toContain("101");
    streams.push(stream);
  }
  expect(env.counts().checks).toBe(3);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(env.counts().checks).toBe(4);
  const closed = streams.map(
    ({ socket }) => new Promise<void>((resolve) => socket.once("close", () => resolve())),
  );
  env.revoke();
  await vi.advanceTimersByTimeAsync(15_000);
  await Promise.all(closed);
  expect(env.counts().checks).toBe(5);
  await vi.advanceTimersByTimeAsync(15_000);
  expect(env.counts().checks).toBe(5);
});

it("defaults framing and HSTS headers without overriding upstream policies", async () => {
  const env = await setup();
  const unavailable = await env.call("/");
  expect(unavailable.headers["x-frame-options"]).toBe("SAMEORIGIN");
  expect(unavailable.headers["strict-transport-security"]).toBe("max-age=31536000");
  env.gateway.setOrigin(origin);
  const signIn = await env.call("/", { accept: "text/html" });
  expect(signIn.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(signIn.headers["x-frame-options"]).toBe("SAMEORIGIN");
  expect(signIn.headers["strict-transport-security"]).toBe("max-age=31536000");
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const proxied = await env.call("/", { cookie });
  expect(proxied.headers["x-frame-options"]).toBe("SAMEORIGIN");
  expect(proxied.headers["strict-transport-security"]).toBe("max-age=31536000");
  expect(proxied.headers["cache-control"]).toBe("no-store");
  const policies: Record<string, string>[] = [
    {
      "x-frame-options": "DENY",
      "strict-transport-security": "max-age=600",
      "content-security-policy": "default-src 'self'",
    },
    { "content-security-policy": "default-src 'self'; frame-ancestors https://portal.example" },
  ];
  for (const policy of policies) {
    const custom = await setup(15_000, "/approval-receiver", undefined, [], policy);
    custom.gateway.setOrigin(origin);
    const customCookie = (await custom.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
    const response = await custom.call("/", { cookie: customCookie });
    for (const [name, value] of Object.entries(policy)) expect(response.headers[name]).toBe(value);
    expect(response.headers["x-frame-options"]).toBe(policy["x-frame-options"]);
    expect(response.headers["cache-control"]).toBe("no-store");
  }
});
it("reports full session capacity as retryable and prunes expired sessions on lookup", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const passes = Array.from({ length: 1026 }, (_, index) => `capacity-pass-${index}`);
  let release!: () => void;
  let entering!: () => void;
  const entered = new Promise<void>((resolve) => {
    entering = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const env = await setup(15_000, "/approval-receiver", undefined, passes, {}, async (pass) => {
    if (pass === passes[1023]) {
      entering();
      await pending;
    }
  });
  env.gateway.setOrigin(origin);
  let cookie = "";
  for (const pass of passes.slice(0, 1023)) {
    const accepted = await env.exchange(pass);
    expect(accepted.status).toBe(204);
    cookie = accepted.headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  }
  // An invalid pass must release its reservation; the next valid claim may use it.
  expect((await env.exchange("invalid-pass")).status).toBe(401);
  const finalSlot = env.exchange(passes[1023]);
  await entered;
  try {
    expect((await env.exchange(passes[1024])).status).toBe(503);
  } finally {
    release();
  }
  expect((await finalSlot).status).toBe(204);
  const capacity = await env.exchange(passes[1025]);
  expect(capacity.status).toBe(503);
  expect(capacity.headers["retry-after"]).toBe("5");
  expect(capacity.body).toBe("Connector session capacity reached");
  vi.setSystemTime(Date.now() + 61_000);
  expect((await env.call("/", { cookie })).status).toBe(401);
  env.identity.expiresAt = Math.floor(Date.now() / 1000) + 60;
  expect((await env.exchange(passes[1025])).status).toBe(204);
});
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timeout!: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(Error("Gateway left the client waiting")), 300);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
it("answers synchronous upstream construction failures with 502", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const env = await setup(15_000);
  env.gateway.setOrigin(origin);
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  upstreamFailure.enabled = true;
  const response = await bounded(env.call("/private?token=do-not-log", { cookie }));
  expect(response.status).toBe(502);
  expect(response.body).toBe("Connector error");
  expect(logged).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(logged.mock.calls)).not.toContain("do-not-log");
  expect(env.counts().hits).toBe(0);
});
it("answers synchronous WebSocket upstream failures and closes the socket", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const env = await setup(15_000);
  env.gateway.setOrigin(origin);
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  upstreamFailure.enabled = true;
  const failed = ws(env.gateway.target, cookie);
  const closed = new Promise<void>((resolve) => failed.socket.once("close", () => resolve()));
  try {
    expect(await bounded(failed.response)).toContain("502");
    await bounded(closed);
  } finally {
    failed.socket.destroy();
  }
  expect(logged).toHaveBeenCalledTimes(1);
  expect(env.counts().upgrades).toBe(0);
});

it("answers invalid upstream status codes without uncaught callback exceptions", async () => {
  const env = await setup(
    20,
    "/approval-receiver",
    undefined,
    [],
    {},
    undefined,
    "HTTP/1.1 099 Invalid\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
  );
  env.gateway.setOrigin(origin);
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  const result = await Promise.race([
    env.call("/", { cookie }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Upstream response hung")), 300),
    ),
  ]);
  expect(result.status).toBe(502);
});

it("closes an aborted upstream response after headers instead of hanging", async () => {
  const env = await setup(
    20,
    "/approval-receiver",
    undefined,
    [],
    {},
    undefined,
    "HTTP/1.1 200 OK\r\nContent-Length: 100\r\nConnection: close\r\n\r\nshort",
  );
  env.gateway.setOrigin(origin);
  const cookie = (await env.exchange()).headers["set-cookie"]?.[0]?.split(";")[0] ?? "";
  await expect(
    Promise.race([
      env.call("/", { cookie }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Upstream response hung")), 300),
      ),
    ]),
  ).rejects.toThrow("Response aborted");
});
