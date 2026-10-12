// SPDX-License-Identifier: Apache-2.0
import { Agent as HttpAgent } from "node:http";
import { Agent as HttpsAgent } from "node:https";
import { connect, isIP, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";

export type ProxyProtocol = "v1" | "v2";
const SIGNATURE = Buffer.from("\r\n\r\n\0\r\nQUIT\n");
const MAX_V2 = 16 + 36 + 3 + 255;

/** Accept only the bounded TCP/UNKNOWN preambles produced by the SDK. */
export function proxyHeaderLength(bytes: Buffer, version: ProxyProtocol): number | undefined {
  if (version === "v1") {
    const prefix = Buffer.from("PROXY ");
    if (
      !bytes
        .subarray(0, Math.min(bytes.length, prefix.length))
        .equals(prefix.subarray(0, Math.min(bytes.length, prefix.length)))
    )
      throw Error("Invalid PROXY signature");
    const end = bytes.indexOf("\r\n");
    if (end < 0) {
      if (bytes.length >= 107) throw Error("PROXY header too long");
      return;
    }
    if (end + 2 > 107) throw Error("PROXY header too long");
    const line = bytes.subarray(0, end).toString("ascii");
    if (!bytes.subarray(0, end).equals(Buffer.from(line))) throw Error("Invalid PROXY text");
    if (line !== "PROXY UNKNOWN") {
      const parts = line.split(" ");
      const family = parts[1] === "TCP4" ? 4 : parts[1] === "TCP6" ? 6 : 0;
      if (
        parts.length !== 6 ||
        !family ||
        isIP(parts[2] ?? "") !== family ||
        parts[3] !== (family === 4 ? "0.0.0.0" : "::") ||
        !/^\d{1,5}$/.test(parts[4] ?? "") ||
        Number(parts[4]) > 65535 ||
        parts[5] !== "443"
      )
        throw Error("Invalid PROXY address");
    }
    return end + 2;
  }
  const signatureSize = Math.min(bytes.length, SIGNATURE.length);
  if (!bytes.subarray(0, signatureSize).equals(SIGNATURE.subarray(0, signatureSize)))
    throw Error("Invalid PROXY signature");
  if (bytes.length < 16) return;
  const size = 16 + bytes.readUInt16BE(14);
  if (size > MAX_V2) throw Error("PROXY header too long");
  const addressSize =
    bytes[12] === 0x20 && bytes[13] === 0
      ? 0
      : bytes[12] === 0x21 && bytes[13] === 0x11
        ? 12
        : bytes[12] === 0x21 && bytes[13] === 0x21
          ? 36
          : -1;
  if (addressSize < 0 || size < 16 + addressSize) throw Error("Invalid PROXY family");
  if (bytes.length < size) return;
  if (addressSize) {
    const ipSize = addressSize === 12 ? 4 : 16;
    if (
      bytes.subarray(16 + ipSize, 16 + ipSize * 2).some((byte) => byte !== 0) ||
      bytes.readUInt16BE(16 + addressSize - 2) !== 443
    )
      throw Error("Invalid PROXY destination");
  }
  const tlv = 16 + addressSize;
  if (size !== tlv) {
    if (
      size < tlv + 3 ||
      bytes[tlv] !== 2 ||
      bytes.readUInt16BE(tlv + 1) < 1 ||
      bytes.readUInt16BE(tlv + 1) > 255 ||
      tlv + 3 + bytes.readUInt16BE(tlv + 1) !== size ||
      !/^[a-zA-Z0-9.-]+$/.test(bytes.subarray(tlv + 3, size).toString("utf8"))
    )
      throw Error("Invalid PROXY authority");
  }
  return size;
}

/** Parse before HTTP sees the socket; never infer a peer from request headers. */
export function consumeProxyHeader(
  socket: Socket,
  version: ProxyProtocol,
  ready: (header: Buffer) => void,
): void {
  let pending = Buffer.alloc(0);
  const timer = setTimeout(() => socket.destroy(), 5_000);
  timer.unref();
  const cleanup = () => {
    clearTimeout(timer);
    socket.off("data", onData);
    socket.off("close", cleanup);
  };
  const onData = (chunk: Buffer) => {
    // Buffer only the bounded preamble, leaving arbitrarily large HTTP data alone.
    const take = Math.min(chunk.length, MAX_V2 - pending.length);
    const candidate = Buffer.concat([pending, chunk.subarray(0, take)]);
    try {
      const size = proxyHeaderLength(candidate, version);
      if (size === undefined) {
        pending = candidate;
        if (take < chunk.length || pending.length >= MAX_V2) throw Error("PROXY header too long");
        return;
      }
      socket.pause();
      cleanup();
      const rest = Buffer.concat([candidate.subarray(size), chunk.subarray(take)]);
      if (rest.length) socket.unshift(rest);
      ready(Buffer.from(candidate.subarray(0, size)));
      socket.resume();
    } catch {
      cleanup();
      socket.destroy();
    }
  };
  socket.on("data", onData);
  socket.once("close", cleanup);
}

/** A fresh non-pooling agent binds exactly one verified peer to one connection. */
export function proxyUpstreamAgent(target: URL, header: Buffer): HttpAgent {
  const secure = target.protocol === "https:";
  const agent = secure ? new HttpsAgent({ keepAlive: false }) : new HttpAgent({ keepAlive: false });
  agent.createConnection = (_options, callback) => {
    const host = target.hostname.replace(/^\[|\]$/g, "");
    const socket = connect({ host, port: Number(target.port || (secure ? 443 : 80)) });
    let settled = false;
    const finish = (error: Error | null, stream?: Socket) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) socket.destroy();
      callback?.(error, stream ?? socket);
    };
    const timer = setTimeout(() => finish(Error("Upstream connection timed out")), 5_000);
    timer.unref();
    socket.once("error", (error) => finish(error));
    socket.once("connect", () => {
      socket.write(header, (error) => {
        if (error) return finish(error);
        if (!secure) return finish(null, socket);
        const tls = connectTls({ socket, host, servername: isIP(host) ? undefined : host });
        tls.once("error", (error) => finish(error));
        tls.once("secureConnect", () => finish(null, tls));
      });
    });
    return undefined;
  };
  return agent;
}
