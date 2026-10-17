// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { execute } from "../../src/cli/index.mjs";
import { activityDesign, activityDesignCatalog, activityDesignSchema, parseActivityDesign, validateActivityDesign } from "../../src/live-activities/design.mjs";

function cli(args, input, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["bin/notify.mjs", ...args], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
    child.stdin.end(input === undefined ? "" : JSON.stringify(input));
  });
}

test("portable strict schema validates all catalog defaults and rejects unsupported configuration", () => {
  assert.equal(activityDesignCatalog().length, 9);
  assert.equal(activityDesignSchema.additionalProperties, false);
  assert.throws(() => activityDesignSchema.properties.template.enum.push("custom"), TypeError);
  for (const entry of activityDesignCatalog()) {
    assert.deepEqual(validateActivityDesign(entry.design, { kind: entry.kind }), activityDesign(entry.template));
    assert.ok(entry.intent && entry.constraints.length && entry.example);
  }
  for (const value of [null, [], {}, { version: 2 }, { version: 1, geometry: {} }, { version: 1, template: "invented" }, { version: 1, appearance: "auto" }, { version: 1, density: "tight" }, { version: 1, emphasis: "actions" }, { version: 1, showSymbol: 1 }, { version: 1, showDetail: "true" }]) assert.throws(() => validateActivityDesign(value));
  assert.throws(() => validateActivityDesign(activityDesign("ring"), { kind: "ask" }), /not valid for ask/);
  assert.throws(() => validateActivityDesign(activityDesign("shell"), { kind: "progress" }), /not valid for progress/);
  assert.throws(() => parseActivityDesign("{"), /valid JSON/);
  assert.throws(() => parseActivityDesign(" ".repeat(16385)), /16384 bytes/);
  assert.deepEqual(validateActivityDesign({ version: 1 }), { version: 1 });
});

test("offline catalog, generator and file validation bypass credentials and transport", async () => {
  const folder = await mkdtemp(join(tmpdir(), "notify-design-offline-"));
  const env = { NOTIFY_CONFIG: join(folder, "no-credentials") };
  const catalog = await execute(["activity", "designs", "--json"], env);
  assert.equal(catalog.body.length, 9);
  const generated = await execute(["activity", "design", "ring", "--json"], env);
  const path = join(folder, "design.json");
  await writeFile(path, JSON.stringify(generated.body));
  assert.deepEqual((await execute(["activity", "validate-design", path], env)).body, { valid: true, design: generated.body });
  await assert.rejects(execute(["activity", "design", "unknown"], env), /design.template/);
  await assert.rejects(execute(["activity", "validate-design"], env), /requires/);
  await writeFile(path, " ".repeat(16385));
  await assert.rejects(execute(["activity", "validate-design", path], env), /16384 bytes/);
  await writeFile(path, "{");
  await assert.rejects(execute(["activity", "validate-design", path], env), /valid JSON/);
  await assert.rejects(execute(["activity", "validate-design", join(folder, "absent")], env), /Cannot open design file/);
});

test("generated configs round-trip through start, update and asks over loopback only", async () => {
  const folder = await mkdtemp(join(tmpdir(), "notify-design-wire-"));
  const received = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    received.push({ path: request.url, method: request.method, headers: request.headers, body: JSON.parse(body) });
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ ok: true, interaction: { id: "ask_fixture" } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const env = { NOTIFY_TOKEN: "ntf_fixture", NOTIFY_API_URL: `http://127.0.0.1:${server.address().port}` };
  try {
    const design = activityDesign("ring");
    const path = join(folder, "ring.json");
    await writeFile(path, JSON.stringify(design));
    await execute(["activity", "validate-design", path], {});
    await execute(["activity", "start", "--title", "Checks", "--status", "Running", "--design-file", path, "--style", "standard", "--accent-color", "#30D158", "--idempotency-key", "fixture-key"], env);
    assert.deepEqual(received.at(-1).body.design, design);
    assert.equal(received.at(-1).body.style, "standard");
    assert.equal(received.at(-1).headers["idempotency-key"], "fixture-key");
    assert.equal(received.at(-1).headers.authorization, "Bearer ntf_fixture");
    await execute(["activity", "update", "activity_fixture", "--design-file", path], env);
    assert.equal(received.at(-1).method, "PATCH");
    assert.deepEqual(received.at(-1).body.design, design);
    await execute(["activity", "update", "activity_fixture", "--clear-design"], env);
    assert.equal(received.at(-1).body.design, null);
    await execute(["activity", "update", "activity_fixture", "--style", "hero"], env);
    assert.equal(Object.hasOwn(received.at(-1).body, "design"), false);
    const ask = activityDesign("verdict");
    await writeFile(path, JSON.stringify(ask));
    await execute(["send", "ask", "Continue?", "--approval", "--live-activity", "--style", "shell", "--accent-color", "#D16830", "--design-file", path], env);
    assert.equal(received.at(-1).path, "/api/agent/interactions");
    assert.deepEqual(received.at(-1).body.design, ask);
    assert.equal(received.at(-1).body.style, "shell");
    assert.equal(received.at(-1).body.presentation, "live_activity");
    assert.equal(received.at(-1).body.accentColor, "#D16830");
    for (const [args, stdin, expected] of [
      [["activity", "start", "--stdin"], { title: "Build", status: "Running", design }, design],
      [["activity", "update", "activity_fixture", "--stdin"], { design: null }, null],
      [["send", "ask", "--approval", "--live-activity", "--stdin"], { prompt: "Continue?", design: ask }, ask],
    ]) {
      const result = await cli(args, stdin, env);
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(received.at(-1).body.design, expected);
    }
    const before = received.length;
    for (const color of ["#D16830", "not-a-color"]) {
      await assert.rejects(
        execute(["send", "ask", "Continue?", "--approval", "--accent-color", color], env),
        /--accent-color requires send ask --live-activity/,
      );
    }
    await assert.rejects(
      execute(["send", "ask", "Continue?", "--approval", "--live-activity", "--accent-color", "not-a-color"], env),
      /--accent-color must use #RRGGBB format/,
    );
    assert.equal(received.length, before, "invalid or non-live accent color must never reach transport");
    for (const args of [
      ["activity", "start", "--title", "Build", "--status", "Running", "--design-file", path],
      ["activity", "start", "--title", "Build", "--status", "Running", "--clear-design"],
      ["activity", "validate-design", path, "--clear-design"],
      ["send", "withdraw", "fixture", "--design-file", path],
      ["activity", "update", "fixture", "--clear-design", "--design-file", path],
      ["send", "ask", "Continue?", "--approval", "--design-file", path],
      ["send", "ask", "Continue?", "--text", "--live-activity", "--design-file", path],
      ["send", "Body", "--design-file", path],
    ]) await assert.rejects(execute(args, env));
    for (const stdin of [{ design: { version: 9 } }, { design: { version: 1, nativeActions: [] } }, { design: { version: 1, template: "signal" } }]) {
      const result = await cli(["activity", "update", "fixture", "--stdin"], stdin, env);
      assert.equal(result.code, 2, result.stderr);
    }
    assert.equal(received.length, before, "invalid design must never reach transport");
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test("build script emits a standalone dependency-free design entrypoint", async () => {
  const script = await readFile(new URL("../../scripts/build.mjs", import.meta.url), "utf8");
  assert.match(script, /"activity-design": "src\/live-activities\/design.mjs"/);
  const source = await readFile(new URL("../../src/live-activities/design.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^import /m);
});
