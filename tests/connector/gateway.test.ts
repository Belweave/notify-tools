import { createServer, type IncomingHttpHeaders, request } from "node:http";
import { connect } from "node:net";
import { afterEach, expect, it } from "vitest";
import { type AccessIdentity, createAccessGateway } from "../../src/connector/gateway.js";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup.length = 0;
});
const origin = "https://work.tunnel.clawchest.com";
const callbackBody = JSON.stringify({ interactionId: "int_callback", answer: "yes" });
const callbackSignature = `v1=${"a".repeat(64)}`;
const callbackHeaders = {
  "content-type": "application/json",
  "notify-timestamp": "1791840000",
  "notify-signature": callbackSignature,
};
async function setup(recheckMs = 20, callbackPath = "/approval-receiver") {
  let hits = 0,
    upgrades = 0,
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
    req.on("end", () => res.end("private employer content"));
  });
  upstream.on("connection", (socket) => {
    upstreamSockets.add(socket);
    socket.on("close", () => upstreamSockets.delete(socket));
  });
  upstream.on("upgrade", (_req, socket) => {
    upgrades++;
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
      if (
        revoked ||
        pass !== "signed-pass" ||
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
            res.on("end", () =>
              resolve({ status: res.statusCode ?? 0, body, headers: res.headers }),
            );
          },
        );
        req.on("error", reject);
        req.end(body);
      },
    );
  const exchange = () =>
    call(
      "/.notify/session",
      { origin, "content-type": "application/json" },
      JSON.stringify({ pass: "signed-pass" }),
    );
  return {
    gateway,
    call,
    exchange,
    counts: () => ({ hits, upgrades }),
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
  });
  expect(asset.status).toBe(200);
  expect(asset.headers["cache-control"]).toBe("no-store");
  expect(env.received()["x-notify-team-id"]).toBe("team_work");
  expect(env.received()["x-notify-subject"]).toBe("pairwise");
  expect(env.received().authorization).toBeUndefined();
  expect(env.received().cookie).toBe("app_session=ok");
  env.revoke();
  expect((await env.call("/bundle.js", { cookie })).status).toBe(401);
  expect(env.counts().hits).toBe(1);
});
function ws(target: string, cookie?: string, path = "/socket") {
  const [host, port] = target.split(":");
  const socket = connect(Number(port), host ?? "127.0.0.1");
  const response = new Promise<string>((resolve, reject) => {
    socket.once("error", reject);
    socket.once("data", (chunk) => resolve(chunk.toString()));
  });
  socket.on("connect", () =>
    socket.write(
      `GET ${path} HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nOrigin: ${origin}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGVzdA==\r\n${cookie ? `Cookie: ${cookie}\r\n` : ""}\r\n`,
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
