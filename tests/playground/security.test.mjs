// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { createHandler, MicroAuthState } from "../../examples/microauth/playground/worker.mjs";

const ORIGIN = "https://playground.example.com";
const APP = "app_test_playground";
class MemoryStorage {
  map = new Map();
  serial = Promise.resolve();
  get(key) { return Promise.resolve(structuredClone(this.map.get(key))); }
  put(key, value) { this.map.set(key, structuredClone(value)); return Promise.resolve(); }
  delete(key) { return Promise.resolve(this.map.delete(key)); }
  deleteAll() { this.map.clear(); return Promise.resolve(); }
  setAlarm(value) { this.alarm = value; return Promise.resolve(); }
  deleteAlarm() { this.alarm = undefined; return Promise.resolve(); }
  transaction(fn) {
    const next = this.serial.then(() => fn(this));
    this.serial = next.catch(() => {});
    return next;
  }
}
async function fixture() {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const objects = new Map();
  const env = {
    APP_ORIGIN: ORIGIN,
    NOTIFY_APP_ID: APP,
    ASSETS: { fetch: () => new Response("playground") },
    AUTH_STATE: {
      idFromName: (name) => name,
      get(id) {
        if (!objects.has(id)) objects.set(id, new MicroAuthState({ storage: new MemoryStorage() }));
        return { fetch: (url, init) => objects.get(id).fetch(new Request(url, init)) };
      },
    },
  };
  const handler = createHandler({ keys: async () => publicKey });
  const call = (path, { method = "POST", cookie, origin = ORIGIN, body = {}, headers = {} } = {}) =>
    handler(new Request(ORIGIN + path, {
      method,
      headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
      ...(method === "POST" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
    }), env);
  const begin = async () => {
    const response = await call("/auth/challenge");
    return { cookie: response.headers.getSetCookie()[0].split(";")[0], ...(await response.json()) };
  };
  const sign = (challenge, extra = {}) => new SignJWT({
    sub: "hk_test_subject",
    jti: crypto.randomUUID(),
    app_id: APP,
    nonce: challenge,
    name: "Avery",
    profile: { timeZone: "America/New_York", custom: [{ id: "field_" + "a".repeat(32), label: "Favorite color", value: "Blue" }] },
    ...extra,
  }).setProtectedHeader({ alg: "ES256", typ: "notify-pass+jwt" }).setIssuer("https://notify.belweave.ai").setAudience(ORIGIN).setIssuedAt().setExpirationTime("2m").sign(privateKey);
  return { call, begin, sign, env, handler, objects };
}

describe("microAuth playground boundary", () => {
  it("requires a session, validates CSRF, rejects duplicate cookies and bounded JSON", async () => {
    const f = await fixture();
    expect((await f.call("/auth/me", { method: "GET" })).status).toBe(401);
    expect((await f.call("/auth/challenge", { origin: "https://elsewhere.example" })).status).toBe(403);
    expect((await f.call("/auth/challenge", { headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await f.call("/auth/challenge", { headers: { "content-type": "text/plain" } })).status).toBe(415);
    expect((await f.call("/auth/challenge", { cookie: "__Host-session=a; __Host-session=b" })).status).toBe(400);
    expect((await f.call("/auth/challenge", { body: JSON.stringify({ padding: "x".repeat(33000) }) })).status).toBe(400);
    const response = await f.call("/auth/challenge");
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly; Secure; SameSite=Strict/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect((await f.handler(new Request("https://other.example/auth/me"), f.env)).status).toBe(421);
  });
  it("verifies the real signed handshake and clears an authenticated session", async () => {
    const f = await fixture();
    const pending = await f.begin();
    const token = await f.sign(pending.challenge);
    const result = await f.call("/auth/session", { cookie: pending.cookie, body: { token } });
    expect(result.status).toBe(200);
    const session = result.headers.getSetCookie().find((x) => x.startsWith("__Host-session=")).split(";")[0];
    expect(session).not.toBe(pending.cookie);
    const me = await f.call("/auth/me", { method: "GET", cookie: session });
    const shared = await me.json();
    expect(shared.identity.name).toBe("Avery");
    expect(shared.identity.profile.timeZone).toBe("America/New_York");
    expect(shared.identity).not.toHaveProperty("email");
    expect(shared.identity).not.toHaveProperty("token");
    expect(shared.expiresAt - Date.now()).toBeLessThanOrEqual(300000);
    expect((await f.call("/auth/logout", { cookie: session })).status).toBe(200);
    expect((await f.call("/auth/me", { method: "GET", cookie: session })).status).toBe(401);
  });
  it("rejects a wrong browser binding, app ID, signature, and replay; only one concurrent redemption succeeds", async () => {
    const f = await fixture();
    const pending = await f.begin();
    const other = await f.begin();
    const token = await f.sign(pending.challenge);
    expect((await f.call("/auth/session", { cookie: other.cookie, body: { token } })).status).toBe(400);
    const wrongApp = await f.sign(pending.challenge, { app_id: "app_other" });
    expect((await f.call("/auth/session", { cookie: pending.cookie, body: { token: wrongApp } })).status).toBe(400);
    expect((await f.call("/auth/session", { cookie: pending.cookie, body: { token: "forged.jwt.value" } })).status).toBe(400);
    const responses = await Promise.all([1, 2].map(() => f.call("/auth/session", { cookie: pending.cookie, body: { token } })));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await f.call("/auth/session", { cookie: pending.cookie, body: { token } })).status).toBe(400);
  });
  it("rotates previous sessions and expires stored identities", async () => {
    const f = await fixture();
    const first = await f.begin();
    const response1 = await f.call("/auth/session", { cookie: first.cookie, body: { token: await f.sign(first.challenge) } });
    const oldSession = response1.headers.getSetCookie()[0].split(";")[0];
    const second = await f.begin();
    const response2 = await f.call("/auth/session", { cookie: `${second.cookie}; ${oldSession}`, body: { token: await f.sign(second.challenge) } });
    expect(response2.status).toBe(200);
    expect((await f.call("/auth/me", { method: "GET", cookie: oldSession })).status).toBe(401);
    const newSession = response2.headers.getSetCookie()[0].split(";")[0];
    for (const [name, object] of f.objects) {
      if (!name.startsWith("session:")) continue;
      const value = await object.storage.get("value");
      if (value) { value.expiresAt = Date.now() - 1; await object.storage.put("value", value); await object.alarm(); }
    }
    expect((await f.call("/auth/me", { method: "GET", cookie: newSession })).status).toBe(401);
  });
});
