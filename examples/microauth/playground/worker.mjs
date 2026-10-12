// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from "node:crypto";
import { createMicroAuthServer } from "../../../dist/sdk/server.mjs";

const SESSION_SECONDS = 300;
const validSecret = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const cookie = (name, value, seconds) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
const json = (body, status = 200) => Response.json(body, { status });

function cookies(request) {
  const result = Object.create(null);
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    if (key in result) throw new Error("Ambiguous cookie");
    result[key] = part.slice(at + 1).trim();
  }
  return result;
}

async function readJson(request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32768) {
      await reader.cancel();
      throw new Error("Body too large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function state(env, kind, secret, action, body = {}) {
  const id = env.AUTH_STATE.idFromName(`${kind}:${hash(secret)}`);
  const response = await env.AUTH_STATE.get(id).fetch(`https://state/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Storage unavailable");
  return response.json();
}

/** Each hashed challenge/session has its own object; no raw cookies are stored. */
export class MicroAuthState {
  constructor(ctx) {
    this.storage = ctx.storage;
  }
  async fetch(request) {
    const action = new URL(request.url).pathname;
    const body = await request.json();
    if (action === "/put") {
      await this.storage.put("value", body);
      await this.storage.setAlarm(body.expiresAt);
      return json({ ok: true });
    }
    if (action === "/get") {
      const value = await this.storage.get("value");
      return json(value?.expiresAt > Date.now() ? value : null);
    }
    if (action === "/consume") {
      const consumed = await this.storage.transaction(async (tx) => {
        const value = await tx.get("value");
        if (!value || value.expiresAt <= Date.now() || value.challenge !== body.challenge)
          return false;
        await tx.delete("value");
        return true;
      });
      return json(consumed);
    }
    if (action === "/clear") {
      await this.storage.deleteAll();
      await this.storage.deleteAlarm();
      return json({ ok: true });
    }
    return json({ error: "Not found" }, 404);
  }
  async alarm() {
    // A newer challenge can replace an older one while an alarm is being delivered.
    const value = await this.storage.get("value");
    if (value?.expiresAt > Date.now()) {
      await this.storage.setAlarm(value.expiresAt);
      return;
    }
    await this.storage.deleteAll();
    await this.storage.deleteAlarm();
  }
}

/** The optional trusted key resolver is only used by isolated security tests. */
export function createHandler({ keys } = {}) {
  async function route(request, env) {
    const url = new URL(request.url);
    if (url.origin !== env.APP_ORIGIN) return json({ error: "Wrong origin" }, 421);
    if (!url.pathname.startsWith("/auth/")) return env.ASSETS.fetch(request);
    if (!/^app_[A-Za-z0-9_-]+$/.test(env.NOTIFY_APP_ID ?? ""))
      return json({ error: "App is being connected. Try again shortly." }, 503);
    const jar = cookies(request);
    const session = jar["__Host-session"];
    if (request.method === "GET" && url.pathname === "/auth/me") {
      const record = validSecret(session) ? await state(env, "session", session, "get") : null;
      return record
        ? json({ identity: record.identity, expiresAt: record.expiresAt })
        : json({ error: "Sign in to see what you shared." }, 401);
    }
    if (request.method !== "POST" || !["/auth/challenge", "/auth/session", "/auth/logout"].includes(url.pathname))
      return json({ error: "Not found" }, 404);
    if (request.headers.get("origin") !== env.APP_ORIGIN || request.headers.get("sec-fetch-site") === "cross-site")
      return json({ error: "Invalid origin" }, 403);
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json")
      return json({ error: "Expected JSON" }, 415);
    const body = await readJson(request);
    if (url.pathname === "/auth/logout") {
      if (validSecret(session)) await state(env, "session", session, "clear");
      if (validSecret(jar["__Host-microauth"])) await state(env, "challenge", jar["__Host-microauth"], "clear");
      const response = json({ ok: true });
      response.headers.append("set-cookie", cookie("__Host-session", "", 0));
      response.headers.append("set-cookie", cookie("__Host-microauth", "", 0));
      return response;
    }
    const auth = createMicroAuthServer({
      origin: env.APP_ORIGIN,
      appId: env.NOTIFY_APP_ID,
      keys,
      store: {
        put: (binding, value) => state(env, "challenge", binding, "put", value),
        get: (binding) => state(env, "challenge", binding, "get"),
        consume: (binding, challenge) => state(env, "challenge", binding, "consume", { challenge }),
      },
    });
    if (url.pathname === "/auth/challenge") {
      const binding = validSecret(jar["__Host-microauth"]) ? jar["__Host-microauth"] : random();
      const response = json(await auth.begin(binding));
      response.headers.append("set-cookie", cookie("__Host-microauth", binding, 120));
      return response;
    }
    const identity = await auth.complete(body.token, jar["__Host-microauth"]);
    const nextSession = random();
    await state(env, "session", nextSession, "put", { identity, expiresAt: Date.now() + SESSION_SECONDS * 1000 });
    if (validSecret(session)) await state(env, "session", session, "clear");
    const response = json({ ok: true });
    response.headers.append("set-cookie", cookie("__Host-session", nextSession, SESSION_SECONDS));
    response.headers.append("set-cookie", cookie("__Host-microauth", "", 0));
    return response;
  }
  return async (request, env) => {
    let response;
    try {
      response = await route(request, env);
    } catch {
      // Do not log passes, cookies, identities, or detailed verifier errors.
      response = json({ error: "Sign-in was not accepted. Please start again." }, 400);
    }
    const result = new Response(response.body, response);
    result.headers.set("cache-control", "no-store");
    result.headers.set("x-content-type-options", "nosniff");
    result.headers.set("referrer-policy", "no-referrer");
    result.headers.set("content-security-policy", "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    result.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=()");
    return result;
  };
}

export default { fetch: createHandler() };
