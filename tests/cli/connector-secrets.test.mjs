import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { run } from "../../src/cli/index.mjs";

const callbackSecret = "ncb_test_only_never_print_this";
const token = "ntf_test_only_not_saved_from_environment";
const connectorId = "conn_security01";
const route = { name: "work", url: "https://work.fixture.clawchest.com", appId: "app_fixture" };
async function fixture(t, source = "environment") {
  const directory = await mkdtemp(join(tmpdir(), "notify-connector-secret-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configFile = join(directory, "config.json");
  const env = { NOTIFY_CONFIG: configFile, NOTIFY_API_URL: "https://example.test" };
  if (source === "environment") env.NOTIFY_TOKEN = token;
  else {
    await writeFile(configFile, JSON.stringify({ token, apiUrl: env.NOTIFY_API_URL }));
    await chmod(configFile, 0o600);
  }
  const stdout = [],
    stderr = [];
  let closed = 0;
  const overrides = {
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    connector: {
      connectInternal: async () => ({
        connector: { id: connectorId, name: "work" },
        routes: [route],
        callbackSecret,
        close: async () => {
          closed++;
        },
      }),
    },
  };
  return {
    directory,
    configFile,
    env,
    stdout,
    stderr,
    overrides,
    closed: () => closed,
    secretFile: join(directory, "connectors", `${connectorId}.secret`),
  };
}
function assertNoCredentialOutput(f) {
  const output = [...f.stdout, ...f.stderr].join("\n");
  assert.ok(!output.includes(callbackSecret));
  assert.ok(!output.includes(token));
}
async function assertStored(f, source) {
  assert.equal(await readFile(f.secretFile, "utf8"), `${callbackSecret}\n`);
  if (process.platform !== "win32") assert.equal((await stat(f.secretFile)).mode & 0o777, 0o600);
  if (source === "environment") await assert.rejects(stat(f.configFile), { code: "ENOENT" });
  assert.match(f.stderr.join("\n"), /Callback signing secret saved to/);
  assert.ok(f.stderr.join("\n").includes(f.secretFile));
  assertNoCredentialOutput(f);
}
for (const source of ["environment", "file"]) {
  test(`connect persists its secret privately for ${source} tokens`, async (t) => {
    const f = await fixture(t, source);
    assert.equal(
      await run(["connect", "3000", "--name", "work"], f.env, { ...f.overrides, detach: true }),
      0,
    );
    await assertStored(f, source);
    assert.equal(f.closed(), 1);
    assert.deepEqual(JSON.parse(f.stdout[0]).routes, [route]);
    assert.equal(f.stdout.length, 1);
  });
  test(`rotate persists its secret privately for ${source} tokens`, async (t) => {
    const f = await fixture(t, source);
    const previous = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      assert.equal(
        String(url),
        `https://example.test/api/agent/connectors/${connectorId}/rotate-secret`,
      );
      assert.equal(options.method, "POST");
      return Response.json({ connector: { id: connectorId }, callbackSecret });
    };
    t.after(() => {
      globalThis.fetch = previous;
    });
    assert.equal(await run(["connectors", "rotate-secret", connectorId], f.env, f.overrides), 0);
    await assertStored(f, source);
    assert.equal(JSON.parse(f.stdout[0]).callbackSecret, undefined);
  });
}
test("secret write failure stops the new connector without printing credentials", async (t) => {
  const f = await fixture(t);
  const blocker = join(f.directory, "not-a-directory");
  await writeFile(blocker, "preserve");
  f.env.NOTIFY_CONFIG = join(blocker, "config.json");
  assert.equal(
    await run(["connect", "3000", "--name", "work"], f.env, { ...f.overrides, detach: true }),
    1,
  );
  assert.equal(f.closed(), 1);
  assert.equal(f.stdout.length, 0);
  assert.match(f.stderr.join("\n"), /connector stopped/);
  assertNoCredentialOutput(f);
  assert.equal(await readFile(blocker, "utf8"), "preserve");
});
test("failed rotated-secret storage reports recovery without printing the secret", async (t) => {
  const f = await fixture(t);
  const blocker = join(f.directory, "not-a-directory");
  await writeFile(blocker, "preserve");
  f.env.NOTIFY_CONFIG = join(blocker, "config.json");
  const previous = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ connector: { id: connectorId }, callbackSecret });
  t.after(() => {
    globalThis.fetch = previous;
  });
  assert.equal(await run(["connectors", "rotate-secret", connectorId], f.env, f.overrides), 1);
  assert.equal(f.stdout.length, 0);
  assert.match(f.stderr.join("\n"), /rotate again/);
  assertNoCredentialOutput(f);
});
test("live connect publishes safe route metadata before shutdown, exactly once", async (t) => {
  const f = await fixture(t);
  const controller = new AbortController();
  let published;
  const ready = new Promise((resolve) => {
    published = resolve;
  });
  const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  let finished = false;
  const running = run(["connect", "3000", "--name", "work"], f.env, {
    ...f.overrides,
    signal: controller.signal,
    stdout: (line) => {
      f.stdout.push(line);
      published();
    },
  }).then((code) => {
    finished = true;
    return code;
  });
  t.after(() => controller.abort());
  await ready;
  assert.equal(finished, false);
  assert.equal(f.closed(), 0);
  assert.deepEqual(JSON.parse(f.stdout[0]).routes, [route]);
  await assertStored(f, "environment");
  controller.abort();
  assert.equal(await running, 0);
  assert.equal(f.stdout.length, 1);
  assert.equal(f.closed(), 1);
  assertNoCredentialOutput(f);
  assert.deepEqual([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")], before);
});
