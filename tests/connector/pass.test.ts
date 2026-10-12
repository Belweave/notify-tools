import { createServer } from "node:http";
import { APP_PASS_ALGORITHM, APP_PASS_JWT_TYPE } from "../../src/connector/protocol.js";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { expect, it } from "vitest";
import {
  honoNotifyPass,
  type PassMiddlewareOptions,
  verifyNotifyPass,
} from "../../src/connector/index.js";

it("checks ES256, exact issuer and origin audience, expiry, subject, jti, app and workspace binding", async () => {
  const { publicKey, privateKey } = await generateKeyPair(APP_PASS_ALGORITHM);
  const jwk = await exportJWK(publicKey);
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        keys: [{ ...jwk, kid: "security-test", alg: APP_PASS_ALGORITHM, use: "sig" }],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error();
  const issuer = `http://127.0.0.1:${address.port}`,
    audience = "https://work.tunnel.clawchest.com";
  const now = Math.floor(Date.now() / 1000);
  const base = {
    iss: issuer,
    aud: audience,
    sub: "pairwise",
    jti: "security-test-unique",
    iat: now,
    exp: now + 120,
    app_id: "app_work",
    team_id: "team_work",
    team_role: "member",
  };
  const sign = (override: Record<string, unknown> = {}, header: Record<string, unknown> = {}) =>
    new SignJWT({ ...base, ...override })
      .setProtectedHeader({
        alg: APP_PASS_ALGORITHM,
        typ: APP_PASS_JWT_TYPE,
        kid: "security-test",
        ...header,
      })
      .sign(privateKey);
  const options = { issuer, audience, appId: "app_work", teamId: "team_work" };
  try {
    expect((await verifyNotifyPass(await sign(), options)).sub).toBe("pairwise");
    for (const change of [
      { iss: `${issuer}/` },
      { aud: `${audience}.attacker.test` },
      { aud: [audience, "https://evil.test"] },
      { exp: now - 1 },
      { exp: undefined },
      { jti: undefined },
      { jti: "" },
      { sub: undefined },
      { app_id: "other_app" },
      { team_id: "other_team" },
      { team_role: undefined },
      { iat: now + 60 },
      { exp: now + 121 },
      { iat: now, exp: now },
      { team_role: "superadmin" },
      { team_id: undefined, team_role: "admin" },
    ])
      await expect(verifyNotifyPass(await sign(change), options)).rejects.toThrow();
    await expect(
      verifyNotifyPass(await sign({ team_id: undefined, team_role: "admin" }), {
        issuer,
        audience,
        appId: "app_work",
      }),
    ).rejects.toThrow();
    await expect(verifyNotifyPass(await sign({}, { typ: "JWT" }), options)).rejects.toThrow();
    const hs = await new SignJWT(base)
      .setProtectedHeader({ alg: "HS256", typ: APP_PASS_JWT_TYPE })
      .sign(new TextEncoder().encode("a".repeat(32)));
    await expect(verifyNotifyPass(hs, options)).rejects.toThrow();
    const token = await sign();
    const segments = token.split(".");
    segments[1] = Buffer.from(JSON.stringify({ ...base, team_role: "admin" })).toString(
      "base64url",
    );
    await expect(verifyNotifyPass(segments.join("."), options)).rejects.toThrow();
    let passed = 0;
    // Simulates two service instances backed by one atomic store.
    const claimed = new Set<string>();
    const consumeJti = async (key: string) => {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    };
    const middleware = honoNotifyPass({ ...options, consumeJti });
    const secondInstance = honoNotifyPass({ ...options, consumeJti });
    const context = { req: { header: () => `Bearer ${token}` }, set: () => {} };
    await middleware(context, async () => {
      passed++;
    });
    const replay = await secondInstance(context, async () => {
      passed++;
    });
    expect(passed).toBe(1);
    expect((replay as Response).status).toBe(401);
    const missingStore = honoNotifyPass(options as PassMiddlewareOptions);
    expect(
      (
        (await missingStore(context, async () => {
          passed++;
        })) as Response
      ).status,
    ).toBe(401);
    expect(passed).toBe(1);
    const unavailable = honoNotifyPass({
      ...options,
      consumeJti: async () => {
        throw Error("store offline");
      },
    });
    expect(
      (
        (await unavailable(context, async () => {
          passed++;
        })) as Response
      ).status,
    ).toBe(401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
