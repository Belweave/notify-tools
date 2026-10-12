import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import {
  createMicroAuthBinding,
  createMicroAuthServer,
  type MicroAuthChallenge,
  type MicroAuthChallengeStore,
} from "../../src/microauth/server.js";

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
beforeAll(async () => {
  keys = await generateKeyPair("ES256");
});
function fixture() {
  const values = new Map<string, MicroAuthChallenge>();
  const store: MicroAuthChallengeStore = {
    async put(binding, challenge) {
      values.set(binding, challenge);
    },
    async get(binding) {
      return values.get(binding) ?? null;
    },
    async consume(binding, challenge) {
      if (values.get(binding)?.challenge !== challenge) return false;
      values.delete(binding);
      return true;
    },
  };
  const server = createMicroAuthServer({
    appId: "app_test",
    origin: "https://site.example",
    issuer: "https://notify.example",
    store,
    keys: async () => keys.publicKey,
  });
  const binding = createMicroAuthBinding();
  const sign = async (
    nonce: string,
    override: Record<string, unknown> = {},
    header: Record<string, string> = {},
    key = keys.privateKey,
  ) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({
      iss: "https://notify.example",
      aud: "https://site.example",
      sub: "pairwise-id",
      jti: "unique-token",
      app_id: "app_test",
      nonce,
      iat: now,
      exp: now + 120,
      ...override,
    })
      .setProtectedHeader({ alg: "ES256", typ: "notify-pass+jwt", ...header })
      .sign(key);
  };
  return { server, binding, sign, values };
}
describe("microAuth server verification", () => {
  it("accepts a signed challenge once, returning only the validated identity", async () => {
    const f = fixture();
    const request = await f.server.begin(f.binding);
    const token = await f.sign(request.challenge, {
      name: "Alex",
      profile: { phone: "+1 555 0100", secret: "discard" },
      unrelated: "discard",
    });
    expect(await f.server.complete(token, f.binding)).toEqual({
      subject: "pairwise-id",
      issuer: "https://notify.example",
      appId: "app_test",
      name: "Alex",
      profile: { phone: "+1 555 0100" },
    });
    await expect(f.server.complete(token, f.binding)).rejects.toMatchObject({
      code: "INVALID_PASS",
    });
  });
  it("allows only one winner for concurrent completions", async () => {
    const f = fixture();
    const request = await f.server.begin(f.binding);
    const token = await f.sign(request.challenge);
    const results = await Promise.allSettled([
      f.server.complete(token, f.binding),
      f.server.complete(token, f.binding),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });
  it.each([
    { iss: "https://wrong.example" },
    { aud: "https://wrong.example" },
    { aud: ["https://site.example", "https://other.example"] },
    { app_id: "app_other" },
    { nonce: "a".repeat(43) },
    { exp: 1 },
    { sub: "" },
    { jti: "" },
    { iat: Math.floor(Date.now() / 1000) + 60 },
    { exp: Math.floor(Date.now() / 1000) + 1000 },
    {
      iat: Math.floor(Date.now() / 1000) - 500,
      exp: Math.floor(Date.now() / 1000) + 30,
    },
    { profile: { custom: [{ id: "bad", label: "Label", value: "Value" }] } },
    { team_id: "team", team_role: "superadmin" },
  ])("rejects invalid claims %j without consuming the challenge", async (override) => {
    const f = fixture();
    const request = await f.server.begin(f.binding);
    await expect(
      f.server.complete(await f.sign(request.challenge, override), f.binding),
    ).rejects.toMatchObject({ code: "INVALID_PASS" });
    expect(f.values.has(f.binding)).toBe(true);
  });
  it("rejects the wrong key, JWT type, browser binding, and superseded challenge", async () => {
    const f = fixture();
    const request = await f.server.begin(f.binding);
    const wrong = await generateKeyPair("ES256");
    await expect(
      f.server.complete(await f.sign(request.challenge, {}, {}, wrong.privateKey), f.binding),
    ).rejects.toThrow();
    await expect(
      f.server.complete(await f.sign(request.challenge, {}, { typ: "JWT" }), f.binding),
    ).rejects.toThrow();
    const token = await f.sign(request.challenge);
    await expect(f.server.complete(token, createMicroAuthBinding())).rejects.toThrow();
    await f.server.begin(f.binding);
    await expect(f.server.complete(token, f.binding)).rejects.toThrow();
  });
  it("rejects an expired server challenge even when the JWT is fresh", async () => {
    const f = fixture();
    const request = await f.server.begin(f.binding);
    f.values.set(f.binding, { ...request, expiresAt: Date.now() - 1 });
    await expect(f.server.complete(await f.sign(request.challenge), f.binding)).rejects.toThrow();
  });
});
