import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { expect, it } from "vitest";
import { defaultTunnelFactory } from "../../src/connector/transport/tunnel.js";

it("isolates concurrent relay credentials without changing global fetch", async () => {
  const original = globalThis.fetch;
  const seen: string[] = [];
  const send: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    expect(request.url).toBe("https://relay.example/api/tunnel");
    seen.push(request.headers.get("authorization") ?? "");
    expect(globalThis.fetch).toBe(original);
    return Response.json({ error: "fixture rejection" }, { status: 403 });
  };
  const results = await Promise.allSettled(
    ["alpha", "beta"].map((token) =>
      defaultTunnelFactory(
        {
          name: "test",
          token,
          routes: { app: "localhost:3000" },
          relayApi: "https://relay.example",
        },
        { app: "localhost:3000" },
        send,
      ),
    ),
  );
  expect(results.every((result) => result.status === "rejected")).toBe(true);
  expect(seen.sort()).toEqual(["Bearer alpha", "Bearer beta"]);
  expect(globalThis.fetch).toBe(original);
});

it("opens the relay WebSocket using Node's standard protocol constructor", async () => {
  const folder = await mkdtemp(join(tmpdir(), "notify-relay-test-"));
  const server = createServer((_request, response) => {
    response.writeHead(404).end();
  });
  const sockets = new Set<import("node:net").Socket>();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  let tunnel: InstanceType<typeof import("@opentunnel/client/effect").Tunnel> | undefined;
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        join(folder, "key.pem"),
        "-out",
        join(folder, "cert.pem"),
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
      ],
      { stdio: "ignore" },
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address() as { port: number };
    const upgraded = new Promise<string | undefined>((resolve) =>
      server.once("upgrade", (request, socket) => {
        const protocol = request.headers["sec-websocket-protocol"];
        const accept = createHash("sha1")
          .update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
          .digest("base64");
        socket.write(
          `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: ${protocol}\r\n\r\n`,
        );
        resolve(typeof protocol === "string" ? protocol : undefined);
      }),
    );
    const { Tunnel } = await import("@opentunnel/client/effect");
    tunnel = new Tunnel({
      api: new URL(`http://127.0.0.1:${address.port}`),
      identity: {
        id: "fixture",
        hostname: "localhost",
        token: "test-only",
        privateKey: await readFile(join(folder, "key.pem"), "utf8"),
        certificate: await readFile(join(folder, "cert.pem"), "utf8"),
        chain: "",
        certificateExpiry: new Date(Date.now() + 86400000),
      },
      routes: { app: "localhost:3000" },
      onEvent() {},
    });
    await expect(upgraded).resolves.toMatch(/^opentunnel/);
  } finally {
    await tunnel?.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(folder, { recursive: true, force: true });
  }
}, 10000);
