import { once } from "node:events";
import { createServer as createHttpServer, type IncomingHttpHeaders } from "node:http";
import { connect, createServer, type Socket } from "node:net";
import { afterEach, expect, it } from "vitest";
import { createAccessGateway } from "../../src/connector/gateway.js";
import { type ProxyProtocol, proxyHeaderLength } from "../../src/connector/proxy-protocol.js";

const origin = "https://work.tunnel.clawchest.com",
  host = new URL(origin).host;
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.reverse()) await close();
  cleanup.length = 0;
});
function header(version: ProxyProtocol, last = 9): Buffer {
  if (version === "v1") return Buffer.from(`PROXY TCP4 203.0.113.${last} 0.0.0.0 23456 443\r\n`);
  const result = Buffer.alloc(31 + host.length);
  Buffer.from("\r\n\r\n\0\r\nQUIT\n").copy(result);
  result[12] = 0x21;
  result[13] = 0x11;
  result.writeUInt16BE(result.length - 16, 14);
  result.set([203, 0, 113, last], 16);
  result.writeUInt16BE(23456, 24);
  result.writeUInt16BE(443, 26);
  result[28] = 2;
  result.writeUInt16BE(host.length, 29);
  result.write(host, 31);
  return result;
}
async function fixture(version: ProxyProtocol) {
  const peers: Buffer[] = [],
    received: IncomingHttpHeaders[] = [];
  let revoked = false,
    connections = 0;
  const sockets = new Set<Socket>();
  const http = createHttpServer((req, res) => {
    received.push(req.headers);
    req.resume();
    req.once("end", () => res.end("private"));
  });
  http.on("upgrade", (req, socket) => {
    received.push(req.headers);
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
    );
    socket.on("data", (bytes) => socket.write(bytes));
  });
  const upstream = createServer((socket) => {
    connections++;
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    let pending = Buffer.alloc(0);
    const accept = (bytes: Buffer) => {
      pending = Buffer.concat([pending, bytes]);
      const size =
        version === "v1"
          ? pending.indexOf("\r\n") < 0
            ? 0
            : pending.indexOf("\r\n") + 2
          : pending.length < 16
            ? 0
            : 16 + pending.readUInt16BE(14);
      if (!size || pending.length < size) return;
      socket.pause();
      socket.off("data", accept);
      peers.push(Buffer.from(pending.subarray(0, size)));
      if (pending.length > size) socket.unshift(pending.subarray(size));
      http.emit("connection", socket);
      socket.resume();
    };
    socket.on("data", accept);
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  cleanup.push(async () => {
    for (const s of sockets) s.destroy();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });
  const expiresAt = Math.floor(Date.now() / 1000) + 60;
  const gateway = await createAccessGateway({
    target: `127.0.0.1:${(upstream.address() as { port: number }).port}`,
    routeName: "work",
    proxyProtocol: version,
    recheckMs: 10,
    authorize: async () => {
      if (revoked) throw Error("revoked");
      return { subject: "pairwise", appId: "app_work", teamId: null, teamRole: null, expiresAt };
    },
    authorizeCallback: async () => ({ path: "/callback" }),
  });
  cleanup.push(gateway.close);
  gateway.setOrigin(origin);
  const port = Number(gateway.target.split(":")[1]);
  async function request(
    path = "/",
    headers: Record<string, string> = {},
    body?: string,
    prefix = header(version),
  ): Promise<string> {
    const socket = connect(port, "127.0.0.1");
    socket.on("error", () => {});
    const chunks: Buffer[] = [];
    socket.on("data", (chunk) => chunks.push(chunk));
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    await once(socket, "connect");
    socket.write(prefix.subarray(0, 3));
    await new Promise<void>((resolve) => setImmediate(resolve));
    socket.write(
      Buffer.concat([
        prefix.subarray(3),
        Buffer.from(
          `${body === undefined ? "GET" : "POST"} ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n${Object.entries(
            headers,
          )
            .map(([key, value]) => `${key}: ${value}\r\n`)
            .join(
              "",
            )}${body === undefined ? "" : `Content-Length: ${Buffer.byteLength(body)}\r\n`}\r\n${body ?? ""}`,
        ),
      ]),
    );
    await closed;
    return Buffer.concat(chunks).toString();
  }
  async function session() {
    const response = await request(
      "/.notify/session",
      { Origin: origin, "Content-Type": "application/json" },
      '{"pass":"valid"}',
    );
    expect(response).toMatch(/^HTTP\/1.1 204/);
    const cookie = response.match(/set-cookie: ([^;]+)/i)?.[1];
    if (!cookie) throw Error("Missing session cookie");
    return cookie;
  }
  return {
    request,
    session,
    peers,
    received,
    port,
    revoke: () => {
      revoked = true;
    },
    connections: () => connections,
  };
}
for (const version of ["v1", "v2"] as const) {
  it(`${version} forwards metadata only after authorization, strips credentials, and isolates peers`, async () => {
    const f = await fixture(version);
    expect(await f.request()).toMatch(/^HTTP\/1.1 401/);
    expect(f.connections()).toBe(0);
    const cookie = await f.session();
    expect(f.connections()).toBe(0);
    for (const peer of [9, 10]) {
      expect(
        await f.request(
          "/",
          {
            Cookie: cookie,
            Authorization: "Bearer secret",
            "X-Forwarded-For": "1.1.1.1",
            "X-Notify-Subject": "forged",
          },
          undefined,
          header(version, peer),
        ),
      ).toContain("private");
      expect(f.peers.at(-1)).toEqual(header(version, peer));
    }
    expect(f.connections()).toBe(2);
    expect(f.received[0]?.["x-notify-subject"]).toBe("pairwise");
    expect(f.received[0]?.authorization).toBeUndefined();
    expect(f.received[0]?.cookie).toBeUndefined();
    expect(f.received[0]?.["x-forwarded-for"]).toBeUndefined();
    f.revoke();
    expect(await f.request("/", { Cookie: cookie })).toMatch(/^HTTP\/1.1 401/);
    expect(f.connections()).toBe(2);
  });
  it(`${version} authorizes WebSocket upgrades and closes revoked streams`, async () => {
    const f = await fixture(version),
      cookie = await f.session();
    const socket = connect(f.port, "127.0.0.1");
    socket.on("error", () => {});
    await once(socket, "connect");
    const closed = once(socket, "close");
    socket.write(
      Buffer.concat([
        header(version),
        Buffer.from(
          `GET /ws HTTP/1.1\r\nHost: ${host}\r\nOrigin: ${origin}\r\nCookie: ${cookie}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
        ),
      ]),
    );
    const [response] = await once(socket, "data");
    expect(response.toString()).toMatch(/^HTTP\/1.1 101/);
    expect(f.peers).toEqual([header(version)]);
    f.revoke();
    await closed;
  });
  it(`${version} sends a preamble for authenticated callbacks`, async () => {
    const f = await fixture(version);
    expect(
      await f.request(
        "/.notify/callback",
        {
          "Content-Type": "application/json",
          "Notify-Timestamp": "1791840000",
          "Notify-Signature": `v1=${"a".repeat(64)}`,
        },
        '{"answer":"yes"}',
      ),
    ).toMatch(/^HTTP\/1.1 204/);
    expect(f.peers).toEqual([header(version)]);
    expect(f.received[0]?.["x-notify-subject"]).toBeUndefined();
  });
  it(`${version} rejects malformed and absent preambles before upstream access`, async () => {
    const f = await fixture(version);
    expect(await f.request("/", {}, undefined, Buffer.from("malformed\r\n"))).toBe("");
    expect(await f.request("/", {}, undefined, Buffer.alloc(0))).toBe("");
    expect(f.connections()).toBe(0);
  });
}
it("validates every fragmented boundary and bounds malformed input", () => {
  for (const version of ["v1", "v2"] as const) {
    const bytes = header(version);
    for (let size = 0; size < bytes.length; size++)
      expect(proxyHeaderLength(bytes.subarray(0, size), version)).toBeUndefined();
    expect(proxyHeaderLength(Buffer.concat([bytes, Buffer.alloc(10000)]), version)).toBe(
      bytes.length,
    );
  }
  for (const line of [
    "PROXY TCP4 999.1.1.1 0.0.0.0 12 443\r\n",
    "PROXY TCP4 1.2.3.4 0.0.0.0 99999 443\r\n",
    "PROXY TCP4 1.2.3.4 0.0.0.0 12 80\r\n",
    `PROXY ${"x".repeat(110)}`,
  ])
    expect(() => proxyHeaderLength(Buffer.from(line), "v1")).toThrow();
  const huge = header("v2");
  huge.writeUInt16BE(65535, 14);
  expect(() => proxyHeaderLength(huge, "v2")).toThrow();
  const invalid = header("v2");
  invalid[28] = 5;
  expect(() => proxyHeaderLength(invalid, "v2")).toThrow();
  expect(proxyHeaderLength(Buffer.from("PROXY UNKNOWN\r\n"), "v1")).toBe(15);
  const ipv6 = Buffer.from("PROXY TCP6 2001:db8::1 :: 0 443\r\n");
  expect(proxyHeaderLength(ipv6, "v1")).toBe(ipv6.length);
});
