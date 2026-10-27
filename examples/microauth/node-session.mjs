/** Patched Node 22.23.4+, 24.22.1+ or 26.12.1+ within those major lines, one SQLite-backed server process behind your HTTPS reverse proxy.
 * Run after pnpm build with APP_ORIGIN=https://your.site NOTIFY_APP_ID=app_... .
 * Mount /auth/* on the SAME origin as your frontend. Keep the DB on persistent disk.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createMicroAuthBinding, createMicroAuthServer } from "../../dist/sdk/server.mjs";

const origin = process.env.APP_ORIGIN;
const db = new DatabaseSync(process.env.SESSION_DB ?? "micro-auth-sessions.sqlite");
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS challenge (binding TEXT PRIMARY KEY, nonce TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS session (id_hash TEXT PRIMARY KEY, identity TEXT NOT NULL, expires INTEGER NOT NULL);`);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const server = createMicroAuthServer({
  origin,
  appId: process.env.NOTIFY_APP_ID,
  store: {
    async put(binding, value) {
      db.prepare("DELETE FROM challenge WHERE expires <= ?").run(Date.now());
      db.prepare("INSERT OR REPLACE INTO challenge VALUES (?, ?, ?)").run(
        hash(binding),
        value.challenge,
        value.expiresAt,
      );
    },
    async get(binding) {
      const value = db
        .prepare("SELECT nonce, expires FROM challenge WHERE binding = ?")
        .get(hash(binding));
      return value ? { challenge: value.nonce, expiresAt: value.expires } : null;
    },
    async consume(binding, nonce) {
      return (
        db
          .prepare("DELETE FROM challenge WHERE binding = ? AND nonce = ? AND expires > ?")
          .run(hash(binding), nonce, Date.now()).changes === 1
      );
    },
  },
});
const cookie = (name, value, seconds) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`;
function cookies(request) {
  const result = Object.create(null);
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    // Reject ambiguous duplicate security cookies.
    if (key in result) throw new Error("Duplicate cookie");
    result[key] = part.slice(index + 1).trim();
  }
  return result;
}
async function json(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32768) throw new Error("Body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json");
  const send = (status, body) => {
    response.statusCode = status;
    response.end(JSON.stringify(body));
  };
  try {
    const jar = cookies(request);
    if (request.method === "GET" && request.url === "/auth/me") {
      const row =
        jar["__Host-session"] &&
        db
          .prepare("SELECT identity FROM session WHERE id_hash = ? AND expires > ?")
          .get(hash(jar["__Host-session"]), Date.now());
      return send(
        row ? 200 : 401,
        row ? { identity: JSON.parse(row.identity) } : { error: "Sign in first" },
      );
    }
    if (request.method !== "POST" || !["/auth/challenge", "/auth/session"].includes(request.url))
      return send(404, { error: "Not found" });
    if (request.headers.origin !== origin || request.headers["sec-fetch-site"] === "cross-site")
      return send(403, { error: "Invalid origin" });
    if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json")
      return send(415, { error: "Expected JSON" });
    if (request.url === "/auth/challenge") {
      await json(request);
      // Preserve a binding during concurrent starts: begin replaces its old nonce.
      const binding = /^[A-Za-z0-9_-]{43}$/.test(jar["__Host-microauth"] ?? "")
        ? jar["__Host-microauth"]
        : createMicroAuthBinding();
      const challenge = await server.begin(binding);
      response.setHeader("Set-Cookie", cookie("__Host-microauth", binding, 120));
      return send(200, challenge);
    }
    const body = await json(request);
    // Binding comes ONLY from the HttpOnly cookie, never the body or JWT.
    const identity = await server.complete(body.token, jar["__Host-microauth"]);
    // Always rotate the site's session after verified authentication.
    const session = randomBytes(32).toString("base64url");
    const ttl = 8 * 60 * 60;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM session WHERE expires <= ?").run(Date.now());
      if (jar["__Host-session"])
        db.prepare("DELETE FROM session WHERE id_hash = ?").run(hash(jar["__Host-session"]));
      db.prepare("INSERT INTO session VALUES (?, ?, ?)").run(
        hash(session),
        JSON.stringify(identity),
        Date.now() + ttl * 1000,
      );
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    response.setHeader("Set-Cookie", [
      cookie("__Host-session", session, ttl),
      cookie("__Host-microauth", "", 0),
    ]);
    return send(200, { ok: true });
  } catch {
    // Never log tokens, profile values, cookies, or detailed verifier errors.
    return send(400, { error: "Sign-in was not accepted. Start again." });
  }
}).listen(Number(process.env.PORT ?? 4300), "127.0.0.1");
