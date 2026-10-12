import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, writeFile, mkdir, lstat, readlink, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { generateKeyPair, SignJWT } from "jose";

const source = resolve("dist");
const compiler = resolve("node_modules/typescript/bin/tsc");
function node(args, options = {}) {
  return spawnSync(process.execPath, args, { encoding: "utf8", timeout: 15000, ...options });
}

test("release runs and typechecks outside the checkout without dependencies", async () => {
  const folder = await mkdtemp(join(tmpdir(), "notify release "));
  try {
    const release = join(folder, "release");
    await cp(source, release, { recursive: true });
    const env = { PATH: process.env.PATH, HOME: folder, XDG_CONFIG_HOME: join(folder, "config") };
    const help = node([join(release, "cli/notify.mjs"), "--help"], { cwd: folder, env });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /notify auth login/);
    const hook = node([join(release, "cli/notify.mjs"), "permissions", "hook", "claude"], {
      cwd: folder,
      env,
      input: '{"hook_event_name":"Stop"}',
    });
    assert.equal(hook.status, 0, hook.stderr);
    assert.equal(JSON.parse(hook.stdout).hookSpecificOutput.decision.behavior, "deny");
    const doctor = node([join(release, "cli/notify.mjs"), "permissions", "doctor"], {
      cwd: folder,
      env,
    });
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.equal(JSON.parse(doctor.stdout).authenticated, false);
    await writeFile(
      join(folder, "consumer.mts"),
      `
import { connectMicroAuth, supportsMicroAuth } from './release/sdk/browser.mjs';
import { createMicroAuthServer, createMicroAuthBinding, type MicroAuthChallengeStore } from './release/sdk/server.mjs';
import { connectInternal, honoNotifyPass } from './release/sdk/connector.mjs';
const store: MicroAuthChallengeStore = { async put() {}, async get() { return null; }, async consume() { return false; } };
createMicroAuthServer({ origin: 'https://example.com', appId: 'app_test', store }).begin(createMicroAuthBinding());
void [connectMicroAuth, supportsMicroAuth, connectInternal, honoNotifyPass];
`,
    );
    await writeFile(
      join(folder, "tsconfig.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          module: "NodeNext",
          target: "ES2022",
          noEmit: true,
          types: [],
          skipLibCheck: false,
        },
        files: ["consumer.mts"],
      }),
    );
    const types = node([compiler, "-p", join(folder, "tsconfig.json")], { cwd: folder });
    assert.equal(types.status, 0, types.stdout + types.stderr);
    const { createMicroAuthServer, createMicroAuthBinding } = await import(
      pathToFileURL(join(release, "sdk/server.mjs"))
    );
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const values = new Map();
    const auth = createMicroAuthServer({
      origin: "https://example.com",
      appId: "app_test",
      keys: async () => publicKey,
      store: {
        async put(binding, value) {
          values.set(binding, value);
        },
        async get(binding) {
          return values.get(binding);
        },
        async consume(binding, challenge) {
          if (values.get(binding)?.challenge !== challenge) return false;
          values.delete(binding);
          return true;
        },
      },
    });
    const binding = createMicroAuthBinding();
    const { challenge } = await auth.begin(binding);
    const token = await new SignJWT({ app_id: "app_test", nonce: challenge })
      .setProtectedHeader({ alg: "ES256", typ: "notify-pass+jwt" })
      .setIssuer("https://notify.belweave.ai")
      .setAudience("https://example.com")
      .setSubject("hk_fixture")
      .setJti("fixture-jti")
      .setIssuedAt()
      .setExpirationTime("2m")
      .sign(privateKey);
    const completions = await Promise.allSettled([
      auth.complete(token, binding),
      auth.complete(token, binding),
    ]);
    assert.equal(completions.filter((result) => result.status === "fulfilled").length, 1);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("installer preserves releases, supports spaces, and rejects unrelated binaries", async () => {
  const folder = await mkdtemp(join(tmpdir(), "notify install "));
  try {
    const prefix = join(folder, "my tools");
    const installer = join(source, "install.mjs");
    const args = [installer, "--prefix", prefix];
    const dry = node([...args, "--dry-run"]);
    assert.equal(dry.status, 0, dry.stderr);
    await assert.rejects(lstat(prefix), { code: "ENOENT" });
    const previous = join(prefix, "share/notify-tools/0.8.0");
    await mkdir(previous, { recursive: true });
    await writeFile(join(previous, "keep"), "earlier release");
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = node(args);
      assert.equal(result.status, 0, result.stderr);
    }
    const binary = join(prefix, "bin/notify");
    assert.match(await readlink(binary), /0\.9\.0\/cli\/notify\.mjs$/);
    assert.equal(await readFile(join(previous, "keep"), "utf8"), "earlier release");
    const run = node([binary, "--help"]);
    assert.equal(run.status, 0, run.stderr);
    const conflict = join(folder, "conflict");
    await mkdir(join(conflict, "bin"), { recursive: true });
    await writeFile(join(conflict, "bin/notify"), "unrelated tool");
    const rejected = node([installer, "--prefix", conflict]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /unmanaged file/);
    assert.equal(await readFile(join(conflict, "bin/notify"), "utf8"), "unrelated tool");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
