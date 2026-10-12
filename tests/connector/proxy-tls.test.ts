import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";

// NODE_EXTRA_CA_CERTS is intentionally isolated to a subprocess, never weakening
// certificate validation or mutating trust in the concurrent test process.
for (const valid of [true, false]) {
  it(`PROXY precedes HTTPS TLS and ${valid ? "trusts a matching IP SAN" : "rejects a mismatched IP SAN"}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "notify-proxy-tls-"));
    const cert = join(dir, "cert.pem"),
      key = join(dir, "key.pem");
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
          key,
          "-out",
          cert,
          "-days",
          "1",
          "-subj",
          "/CN=fixture",
          "-addext",
          `subjectAltName=IP:${valid ? "127.0.0.1" : "127.0.0.2"}`,
        ],
        { stdio: "ignore" },
      );
      expect(await readFile(cert, "utf8")).toContain("BEGIN CERTIFICATE");
      const script = `
        import { createServer, connect } from 'node:net';
        import { createServer as createHttpsServer, request } from 'node:https';
        import { once } from 'node:events';
        import { readFileSync } from 'node:fs';
        import { proxyUpstreamAgent } from ${JSON.stringify(new URL("../../src/connector/proxy-protocol.ts", import.meta.url).href)};
        const preamble = Buffer.from('PROXY TCP4 203.0.113.9 0.0.0.0 34567 443\\r\\n');
        let seen = false;
        const tls = createHttpsServer({ cert: readFileSync(${JSON.stringify(cert)}), key: readFileSync(${JSON.stringify(key)}) }, (_req, res) => res.end('secure'));
        tls.listen(0, '127.0.0.1'); await once(tls, 'listening');
        const sockets = new Set();
        const tcp = createServer(socket => {
          sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
          let pending = Buffer.alloc(0);
          const data = bytes => {
            pending = Buffer.concat([pending, bytes]);
            if (pending.length < preamble.length) return;
            if (!pending.subarray(0, preamble.length).equals(preamble)) throw Error('Missing pre-TLS PROXY');
            seen = true; socket.pause(); socket.off('data', data);
            const remote = connect(tls.address().port, '127.0.0.1');
            sockets.add(remote); remote.on('error', () => socket.destroy());
            socket.once('close', () => remote.destroy());
            if (pending.length > preamble.length) remote.write(pending.subarray(preamble.length));
            socket.pipe(remote); remote.pipe(socket); socket.resume();
          }; socket.on('data', data);
        });
        tcp.listen(0, '127.0.0.1'); await once(tcp, 'listening');
        try {
          const target = new URL('https://127.0.0.1:' + tcp.address().port);
          const result = await new Promise(resolve => {
            const req = request(target, { agent: proxyUpstreamAgent(target, preamble) }, res => {
              let body = ''; res.on('data', bytes => body += bytes); res.on('end', () => resolve(body));
            }); req.on('error', err => resolve(err.code)); req.end();
          });
          if (!seen) throw Error('Preamble not received');
          console.log(result);
        } finally { for (const socket of sockets) socket.destroy(); await new Promise(resolve => tcp.close(resolve)); await new Promise(resolve => tls.close(resolve)); }
      `;
      const output = execFileSync(
        process.execPath,
        ["--experimental-strip-types", "--input-type=module", "-e", script],
        { env: { ...process.env, NODE_EXTRA_CA_CERTS: cert }, encoding: "utf8", timeout: 10000 },
      );
      expect(output.trim()).toBe(valid ? "secure" : "ERR_TLS_CERT_ALTNAME_INVALID");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15000);
}
