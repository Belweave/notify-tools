import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { APP_PASS_ALGORITHM, APP_PASS_JWT_TYPE } from "../../src/connector/protocol.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { connectInternal, installRelayCreateAuth, runConnect } from "../../src/connector/index";
import { verifyCallbackSignature } from "../../src/connector/index";
import { fastifyNotifyPass, verifyNotifyPass } from "../../src/connector/index";

describe("installRelayCreateAuth", () => {
  it("adds a Notify token only to POST /api/tunnel", async () => {
    const seen: string[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push(`${init?.method ?? "GET"} ${String(input)} ${headers.get("authorization")}`);
      return new Response("{}", { status: 201 });
    }) as typeof fetch;
    const undo = installRelayCreateAuth("https://api.clawchest.com", "ntf_testtoken");
    try {
      await fetch("https://api.clawchest.com/api/tunnel", {
        method: "POST",
        body: "{}",
      });
      await fetch("https://api.clawchest.com/api/tunnel/abc", {
        method: "GET",
      });
    } finally {
      undo();
      globalThis.fetch = original;
    }
    expect(seen[0]).toContain("Bearer ntf_testtoken");
    expect(seen[1]).not.toContain("Bearer ntf_testtoken");
  });
});

describe("connectInternal", () => {
  it("registers routes as web apps and heartbeats", async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method, body });
      if (url.endsWith("/api/agent/connectors") && method === "POST") {
        return Response.json(
          {
            connector: {
              id: "conn_testconnector01",
              name: body.name,
              tunnelId: body.tunnelId,
              hostname: body.hostname,
              routes: body.routes,
              status: "online",
              lastSeenAt: new Date().toISOString(),
              teamId: null,
              oncallGroupId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            callbackSecret: "ncb_secret",
          },
          { status: 201 },
        );
      }
      if (url.includes("/api/agent/apps")) {
        return Response.json({ app: { id: "app_grafana001" } }, { status: 201 });
      }
      return Response.json({ ok: true });
    };

    const handle = await connectInternal({
      token: `ntf_${"a".repeat(43)}`,
      name: "grafana",
      routes: { grafana: "127.0.0.1:3000" },
      fetch: fetchImpl,
      heartbeatMs: 60_000,
      tunnel: {
        connect: async () => ({
          id: "ab12cd34ef56",
          hostname: "ab12cd34ef56.clawchest.com",
          close: async () => undefined,
        }),
      },
    });

    expect(handle.routes[0]?.url).toBe("https://grafana.ab12cd34ef56.clawchest.com");
    expect(handle.routes[0]?.appId).toBe("app_grafana001");
    expect(handle.callbackSecret).toBe("ncb_secret");
    expect(calls.some((call) => call.url.endsWith("/api/agent/connectors"))).toBe(true);
    expect(calls.some((call) => call.method === "PATCH")).toBe(true);
    await handle.close();
  });

  it("warns when saving route app ids fails", async () => {
    const warnings: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (url.endsWith("/api/agent/connectors") && method === "POST") {
        return Response.json(
          {
            connector: {
              id: "conn_warn000000001",
              name: body.name,
              tunnelId: body.tunnelId,
              hostname: body.hostname,
              routes: body.routes,
              status: "online",
              lastSeenAt: new Date().toISOString(),
              teamId: "team_ops_0001",
              oncallGroupId: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            callbackSecret: "ncb_secret",
          },
          { status: 201 },
        );
      }
      if (url.includes("/api/agent/apps")) {
        return Response.json({ app: { id: "app_grafana001" } }, { status: 201 });
      }
      if (method === "PATCH") {
        return Response.json({ error: "Admin role required" }, { status: 403 });
      }
      return Response.json({ ok: true });
    };

    const handle = await connectInternal({
      token: `ntf_${"a".repeat(43)}`,
      name: "grafana",
      routes: { grafana: "127.0.0.1:3000" },
      fetch: fetchImpl,
      heartbeatMs: 60_000,
      onWarning: (message) => warnings.push(message),
      tunnel: {
        connect: async () => ({
          id: "ab12cd34ef56",
          hostname: "ab12cd34ef56.clawchest.com",
          close: async () => undefined,
        }),
      },
    });
    expect(warnings.some((message) => /Could not save app ids/.test(message))).toBe(true);
    await handle.close();
  });
});

describe("runConnect", () => {
  it("maps PORT --name to a single route and returns after abort", async () => {
    const controller = new AbortController();
    const done = runConnect({
      token: `ntf_${"a".repeat(43)}`,
      port: 3000,
      name: "grafana",
      signal: controller.signal,
      fetch: async (input, init) => {
        const url = String(input);
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        if (url.endsWith("/api/agent/connectors") && init?.method === "POST") {
          return Response.json(
            {
              connector: {
                id: "conn_cli0000000001",
                name: body.name,
                tunnelId: body.tunnelId,
                hostname: body.hostname,
                routes: body.routes,
                status: "online",
                lastSeenAt: null,
                teamId: null,
                oncallGroupId: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              callbackSecret: "ncb_cli",
            },
            { status: 201 },
          );
        }
        return Response.json({
          app: { id: "app_cli" },
          connector: { id: "conn_cli0000000001" },
        });
      },
      tunnel: {
        connect: async (routes) => {
          expect(routes).toEqual({ grafana: "127.0.0.1:3000" });
          return {
            id: "idcli0000001",
            hostname: "idcli0000001.clawchest.com",
            close: async () => undefined,
          };
        },
      },
    });
    controller.abort();
    const result = await done;
    expect(result.exitCode).toBe(0);
    expect(result.body.routes[0]?.name).toBe("grafana");
  });
});

describe("pass and callback helpers", () => {
  it("verifies a notify-pass+jwt against a local JWKS", async () => {
    const { publicKey, privateKey } = await generateKeyPair(APP_PASS_ALGORITHM);
    const jwk = await exportJWK(publicKey);
    const server = createServer((req, res) => {
      if (req.url === "/.well-known/jwks.json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            keys: [{ ...jwk, kid: "k1", alg: APP_PASS_ALGORITHM, use: "sig" }],
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("expected tcp");
    const issuer = `http://127.0.0.1:${address.port}`;
    const audience = "https://grafana.ab12cd34ef56.clawchest.com";
    const token = await new SignJWT({ app_id: "app_1" })
      .setProtectedHeader({
        alg: APP_PASS_ALGORITHM,
        kid: "k1",
        typ: APP_PASS_JWT_TYPE,
      })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject("hk_pair")
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);
    const claims = await verifyNotifyPass(token, { issuer, audience });
    expect(claims.app_id).toBe("app_1");
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("returns 401 from the Fastify hook when the pass is missing", async () => {
    const sent: Array<{ status: number; body: unknown }> = [];
    const reply = {
      code(status: number) {
        return {
          send(body: unknown) {
            sent.push({ status, body });
            return { status, body };
          },
        };
      },
    };
    const result = await fastifyNotifyPass({
      audience: "https://grafana.ab12cd34ef56.clawchest.com",
    })({ headers: {} }, reply);
    expect(result).toEqual({ status: 401, body: { error: "Unauthorized" } });
    expect(sent).toEqual([{ status: 401, body: { error: "Unauthorized" } }]);
  });

  it("verifies an HMAC callback", () => {
    expect(
      verifyCallbackSignature({
        secret: "ncb_secret",
        body: '{"ok":true}',
        timestamp: "1791520000",
        signature: `v1=${createHmac("sha256", "ncb_secret")
          .update('1791520000.{"ok":true}', "utf8")
          .digest("hex")}`,
        now: 1_791_520_000_000,
      }),
    ).toBe(true);
  });
});

it("closes the tunnel if connector registration fails", async () => {
  let closed = 0;
  await expect(
    connectInternal({
      token: "test-only",
      name: "test",
      routes: { app: "localhost:3000" },
      tunnel: {
        async connect() {
          return {
            id: "fixture",
            hostname: "fixture.clawchest.com",
            async close() {
              closed++;
            },
          };
        },
      },
      fetch: async () => Response.json({ error: "denied" }, { status: 403 }),
    }),
  ).rejects.toThrow("denied");
  expect(closed).toBe(1);
});
