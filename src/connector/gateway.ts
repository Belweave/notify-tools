// SPDX-License-Identifier: Apache-2.0
import { randomBytes } from "node:crypto";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type OutgoingHttpHeaders,
} from "node:http";
import { request as httpsRequest } from "node:https";
import type { Duplex } from "node:stream";
import { CALLBACK_SIGNATURE_HEADER, CALLBACK_TIMESTAMP_HEADER } from "./protocol.js";

const COOKIE = "__Host-notify_session";
const EXCHANGE = "/.notify/session";
const CALLBACK = "/.notify/callback";
const MAX_SESSIONS = 1024;
export interface AccessIdentity {
  subject: string;
  appId: string;
  teamId: string | null;
  teamRole: string | null;
  expiresAt: number;
}
export interface GatewayOptions {
  target: string;
  routeName: string;
  authorize: (pass: string, consume: boolean) => Promise<AccessIdentity>;
  /** Dedicated signed machine delivery, never an alternate user authentication path. */
  authorizeCallback?: (input: {
    body: string;
    timestamp: string;
    signature: string;
  }) => Promise<{ path: string }>;
  /** Used by tests only; production checks at most 15 seconds apart. */
  recheckMs?: number;
}
interface Session {
  pass: string;
  identity: AccessIdentity;
  checking?: Promise<void>;
  invalidated?: boolean;
}
export interface AccessGateway {
  target: string;
  setOrigin: (origin: string) => void;
  close: () => Promise<void>;
}

/** No employer content is served until the one-time exchange is authorized. */
function signInPage(nonce: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect with Notify</title></head><body><main><h1>Connect with Notify</h1><p>This app requires your Notify identity. Continue to share your app-specific identity and current workspace membership with this service.</p><button id="connect">Connect with Notify</button><p id="status" role="status"></p></main><script nonce="${nonce}">document.getElementById('connect').onclick=async function(){this.disabled=true;try{if(!window.notify||typeof window.notify.getToken!=='function')throw Error('Open this app inside Notify to connect.');const pass=await window.notify.getToken();const r=await fetch('${EXCHANGE}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pass}),credentials:'same-origin'});if(!r.ok)throw Error('Access could not be verified. Reopen the app in Notify and try again.');location.reload();}catch(e){document.getElementById('status').textContent=e.message;this.disabled=false;}};</script></body></html>`;
}
function parseTarget(value: string): URL {
  const target = new URL(value.includes("://") ? value : `http://${value}`);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== "/" ||
    target.search ||
    target.hash
  ) {
    throw new Error("Connector targets must be HTTP(S) origins or host:port");
  }
  return target;
}
function cookieSession(req: IncomingMessage): string | undefined {
  const values = (req.headers.cookie ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.startsWith(`${COOKIE}=`));
  if (values.length !== 1) return undefined;
  const value = values[0]?.slice(COOKIE.length + 1) ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
function cleanHeaders(
  req: IncomingMessage,
  target: URL,
  origin: URL,
  identity: AccessIdentity,
  upgrade: boolean,
): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};
  const hop = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    ...(req.headers.connection ?? "")
      .toLowerCase()
      .split(",")
      .map((s) => s.trim()),
  ]);
  for (const [key, value] of Object.entries(req.headers)) {
    if (
      hop.has(key) ||
      key.startsWith("x-notify-") ||
      key.startsWith("x-forwarded-") ||
      ["authorization", "forwarded", "host", "cookie"].includes(key)
    )
      continue;
    headers[key] = value;
  }
  const cookies = (req.headers.cookie ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("__Host-notify_") && !s.startsWith("notify_"));
  if (cookies.length) headers.cookie = cookies.join("; ");
  headers.host = target.host;
  headers["x-forwarded-host"] = origin.host;
  headers["x-forwarded-proto"] = "https";
  headers["x-notify-subject"] = identity.subject;
  headers["x-notify-app-id"] = identity.appId;
  if (identity.teamId) headers["x-notify-team-id"] = identity.teamId;
  if (identity.teamRole) headers["x-notify-team-role"] = identity.teamRole;
  if (upgrade) {
    headers.connection = "Upgrade";
    headers.upgrade = "websocket";
  }
  return headers;
}
function validateIdentity(value: AccessIdentity): AccessIdentity {
  if (
    !value ||
    typeof value.subject !== "string" ||
    !value.subject ||
    typeof value.appId !== "string" ||
    !value.appId ||
    !Number.isSafeInteger(value.expiresAt) ||
    value.expiresAt <= Date.now() / 1000 ||
    ![value.subject, value.appId, value.teamId ?? "", value.teamRole ?? ""].every(
      (s) => typeof s === "string" && !/[\r\n]/.test(s),
    )
  )
    throw new Error("Access denied");
  return value;
}

/** Every tunnel factory receives this loopback gateway, never the raw upstream. */
export async function createAccessGateway(options: GatewayOptions): Promise<AccessGateway> {
  const target = parseTarget(options.target);
  const sessions = new Map<string, Session>();
  const sockets = new Set<Duplex>();
  let origin: URL | undefined;
  const authorize = async (pass: string, consume: boolean) =>
    validateIdentity(await options.authorize(pass, consume));
  // Share work only while it is in flight; completed authorization is never cached.
  const revalidate = (session: Session): Promise<void> => {
    if (session.invalidated || session.identity.expiresAt <= Date.now() / 1000)
      return Promise.reject(new Error("Access denied"));
    if (session.checking) return session.checking;
    session.checking = authorize(session.pass, false)
      .then((next) => {
        if (
          session.invalidated ||
          session.identity.expiresAt <= Date.now() / 1000 ||
          next.subject !== session.identity.subject ||
          next.appId !== session.identity.appId ||
          next.teamId !== session.identity.teamId ||
          next.teamRole !== session.identity.teamRole ||
          next.expiresAt > session.identity.expiresAt
        )
          throw new Error("Access denied");
      })
      .catch(() => {
        session.invalidated = true;
        throw new Error("Access denied");
      })
      .finally(() => {
        session.checking = undefined;
      });
    return session.checking;
  };
  const getSession = async (req: IncomingMessage): Promise<Session> => {
    if (!origin || req.headers.host !== origin.host) throw new Error("Access denied");
    const id = cookieSession(req);
    const session = id ? sessions.get(id) : undefined;
    if (!session) throw new Error("Access denied");
    try {
      await revalidate(session);
      return session;
    } catch {
      if (id) sessions.delete(id);
      throw new Error("Access denied");
    }
  };
  interface Watchers {
    streams: Set<{ stream: Duplex }>;
    timer: ReturnType<typeof setInterval>;
    expiry: ReturnType<typeof setTimeout>;
  }
  const watched = new Map<Session, Watchers>();
  const watch = (session: Session, stream: Duplex) => {
    let state = watched.get(session);
    if (!state) {
      const streams = new Set<{ stream: Duplex }>();
      const destroy = () => {
        for (const { stream: active } of streams) active.destroy();
      };
      state = {
        streams,
        expiry: setTimeout(destroy, Math.max(0, session.identity.expiresAt * 1000 - Date.now())),
        timer: setInterval(
          () => {
            void revalidate(session).catch(destroy);
          },
          Math.min(options.recheckMs ?? 15_000, 15_000),
        ),
      };
      state.expiry.unref();
      state.timer.unref();
      watched.set(session, state);
    }
    const entry = state;
    const subscription = { stream };
    entry.streams.add(subscription);
    const cleanup = () => {
      stream.off("close", cleanup);
      if (!entry.streams.delete(subscription)) return;
      if (entry.streams.size === 0) {
        clearTimeout(entry.expiry);
        clearInterval(entry.timer);
        watched.delete(session);
      }
    };
    stream.once("close", cleanup);
    return cleanup;
  };
  const server = createServer(async (req, res) => {
    res.setHeader("cache-control", "no-store");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("x-content-type-options", "nosniff");
    if (!origin || req.headers.host !== origin.host) {
      res.writeHead(503).end("Connector unavailable");
      return;
    }
    // SameSite cookies alone do not stop a sibling route making same-site requests.
    if (
      (req.headers.origin && req.headers.origin !== origin.origin) ||
      ["same-site", "cross-site"].includes(String(req.headers["sec-fetch-site"]))
    ) {
      res.writeHead(403).end("Cross-origin access denied");
      return;
    }
    // Origin-form only. Never allow the proxy to become an arbitrary forward proxy.
    if (!req.url?.startsWith("/") || req.url.startsWith("//")) {
      res.writeHead(400).end();
      return;
    }
    const path = req.url.split("?")[0];
    if (path === CALLBACK) {
      const timestamp = req.headers[CALLBACK_TIMESTAMP_HEADER];
      const signature = req.headers[CALLBACK_SIGNATURE_HEADER];
      if (
        req.url !== CALLBACK ||
        req.method !== "POST" ||
        req.headers.origin !== undefined ||
        req.headers["content-type"]?.split(";")[0] !== "application/json" ||
        req.headers["content-encoding"] ||
        typeof timestamp !== "string" ||
        !/^\d{10,16}$/.test(timestamp) ||
        typeof signature !== "string" ||
        !/^v1=[a-f0-9]{64}$/i.test(signature) ||
        req.headers.authorization !== undefined ||
        !options.authorizeCallback
      ) {
        res.writeHead(403).end("Callback access denied");
        return;
      }
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += bytes.length;
          if (size > 65_536) throw new Error("Callback body too large");
          chunks.push(bytes);
        }
        const bytes = Buffer.concat(chunks);
        const body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        const json = JSON.parse(body);
        if (!json || typeof json !== "object" || Array.isArray(json))
          throw new Error("Invalid callback body");
        const approved = await options.authorizeCallback({ body, timestamp, signature });
        if (
          !approved ||
          typeof approved.path !== "string" ||
          approved.path.length > 2048 ||
          !/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(approved.path) ||
          approved.path.startsWith("//")
        ) {
          throw new Error("Invalid callback destination");
        }
        // This is an allowlist: no caller cookies, forwarding or user-identity headers.
        const headers: OutgoingHttpHeaders = {
          host: target.host,
          "content-type": "application/json",
          "content-length": bytes.length,
          [CALLBACK_TIMESTAMP_HEADER]: timestamp,
          [CALLBACK_SIGNATURE_HEADER]: signature,
        };
        const upstream = (target.protocol === "https:" ? httpsRequest : httpRequest)(
          {
            hostname: target.hostname,
            port: target.port,
            method: "POST",
            path: approved.path,
            headers,
            signal: AbortSignal.timeout(5_000),
          },
          (response) => {
            const delivered =
              (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 300;
            // A machine delivery receives status only, never employer content or cookies.
            response.destroy();
            res.writeHead(delivered ? 204 : 502).end();
          },
        );
        upstream.on("error", () => {
          if (!res.headersSent) res.writeHead(502).end("Callback delivery failed");
        });
        res.once("close", () => upstream.destroy());
        upstream.end(bytes);
      } catch {
        res.writeHead(401).end("Callback access denied");
      }
      return;
    }
    if (path === EXCHANGE) {
      if (
        req.method !== "POST" ||
        req.headers.origin !== origin.origin ||
        req.headers["content-type"]?.split(";")[0] !== "application/json"
      ) {
        res.writeHead(403).end();
        return;
      }
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk.toString();
          if (Buffer.byteLength(body) > 16_384) throw new Error("Too large");
        }
        const { pass } = JSON.parse(body);
        if (typeof pass !== "string" || pass.length > 12_000) throw new Error("Invalid pass");
        for (const [id, session] of sessions)
          if (session.identity.expiresAt <= Date.now() / 1000) sessions.delete(id);
        if (sessions.size >= MAX_SESSIONS) throw new Error("Full");
        const identity = await authorize(pass, true);
        const id = randomBytes(32).toString("base64url");
        sessions.set(id, { pass, identity });
        res.setHeader(
          "set-cookie",
          `${COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(identity.expiresAt - Date.now() / 1000))}`,
        );
        res.writeHead(204).end();
      } catch {
        res.writeHead(401).end("Access denied");
      }
      return;
    }
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method ?? "") &&
      req.headers.origin !== origin.origin
    ) {
      res.writeHead(403).end();
      return;
    }
    let session: Session;
    try {
      session = await getSession(req);
    } catch {
      if (
        req.method === "GET" &&
        (req.headers.accept ?? "").includes("text/html") &&
        (!req.headers["sec-fetch-dest"] || req.headers["sec-fetch-dest"] === "document")
      ) {
        const nonce = randomBytes(18).toString("base64url");
        res.setHeader(
          "content-security-policy",
          `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
        );
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.writeHead(401).end(signInPage(nonce));
      } else res.writeHead(401).end("Access denied");
      return;
    }
    const upstream = (target.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        hostname: target.hostname,
        port: target.port,
        path: req.url,
        method: req.method,
        headers: cleanHeaders(req, target, origin, session.identity, false),
      },
      (response) => {
        const headers = { ...response.headers, "cache-control": "no-store" };
        delete headers["set-cookie"];
        const cookies = response.headers["set-cookie"]?.filter(
          (s) => !/^\s*(?:__Host-notify_|notify_)/i.test(s),
        );
        if (cookies?.length) headers["set-cookie"] = cookies;
        res.writeHead(response.statusCode ?? 502, headers);
        response.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502).end("Upstream unavailable");
      else res.destroy();
    });
    const stopWatch = watch(session, req.socket);
    res.once("close", () => {
      stopWatch();
      upstream.destroy();
    });
    req.pipe(upstream);
  });
  server.on("upgrade", async (req, socket, head) => {
    socket.on("error", () => socket.destroy());
    if (
      !origin ||
      req.headers.host !== origin.host ||
      req.headers.origin !== origin.origin ||
      req.headers.upgrade?.toLowerCase() !== "websocket" ||
      !req.url?.startsWith("/") ||
      req.url.startsWith("//") ||
      [EXCHANGE, CALLBACK].includes(req.url.split("?")[0] ?? "")
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    let session: Session;
    try {
      session = await getSession(req);
    } catch {
      socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      return;
    }
    if (socket.destroyed) return;
    watch(session, socket);
    const upstream = (target.protocol === "https:" ? httpsRequest : httpRequest)({
      hostname: target.hostname,
      port: target.port,
      method: "GET",
      path: req.url,
      headers: cleanHeaders(req, target, origin, session.identity, true),
    });
    upstream.on("upgrade", (response, remote, remoteHead) => {
      if (socket.destroyed || session.identity.expiresAt <= Date.now() / 1000) {
        remote.destroy();
        socket.destroy();
        return;
      }
      remote.on("error", () => socket.destroy());
      socket.once("close", () => remote.destroy());
      remote.once("close", () => socket.destroy());
      const safe = Object.entries(response.headers).filter(([name]) =>
        [
          "upgrade",
          "connection",
          "sec-websocket-accept",
          "sec-websocket-protocol",
          "sec-websocket-extensions",
        ].includes(name),
      );
      socket.write(
        `HTTP/1.1 101 Switching Protocols\r\n${safe.map(([k, v]) => `${k}: ${v}`).join("\r\n")}\r\n\r\n`,
      );
      if (remoteHead.length) socket.write(remoteHead);
      if (head.length) remote.write(head);
      remote.pipe(socket);
      socket.pipe(remote);
    });
    upstream.on("response", (response) => {
      response.resume();
      socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    });
    upstream.on("error", () => socket.destroy());
    socket.once("close", () => upstream.destroy());
    upstream.end();
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.maxConnections = 256;
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Gateway failed to listen");
  return {
    target: `127.0.0.1:${address.port}`,
    setOrigin: (value) => {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" || parsed.origin !== value)
        throw new Error("Route requires an exact HTTPS origin");
      origin = parsed;
    },
    close: async () => {
      sessions.clear();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
