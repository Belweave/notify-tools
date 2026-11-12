// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { VERSION, execute, run } from "../../src/cli/index.mjs";
import { COMMANDS, completionScript } from "../../src/cli/reference.mjs";
import { knownFlags } from "../../src/cli/foundation/arguments.mjs";
import { redact } from "../../src/cli/foundation/errors.mjs";

const ENV = { NOTIFY_TOKEN: "ntf_fixturetoken000000", NOTIFY_API_URL: "https://example.test" };

async function withServer(respond, callback) {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    const entry = {
      path: String(url).replace("https://example.test", ""),
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body: typeof init.body === "string" && init.body ? JSON.parse(init.body) : undefined,
      signal: init.signal,
    };
    requests.push(entry);
    return respond(entry, requests.length);
  };
  try {
    await callback(requests);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function capture() {
  const out = [];
  const err = [];
  return { out, err, overrides: { stdout: (line) => out.push(line), stderr: (line) => err.push(line), sleep: async () => {} } };
}

test("new resource commands call the production routes", async () => {
  const cases = [
    [["interaction", "cancel", "int_1"], "POST", "/api/agent/interactions/int_1/cancel", undefined],
    [["interactions", "get", "int_1"], "GET", "/api/agent/interactions/int_1", undefined],
    [["connectors", "list"], "GET", "/api/agent/connectors", undefined],
    [["connectors", "get", "conn_1"], "GET", "/api/agent/connectors/conn_1", undefined],
    [["connectors", "remove", "conn_1"], "DELETE", "/api/agent/connectors/conn_1", undefined],
    [["connectors", "update", "conn_1", "--disabled", "--no-oncall"], "PATCH", "/api/agent/connectors/conn_1", { enabled: false, oncallGroupId: null }],
    [["connectors", "update", "conn_1", "--name", "Dash", "--oncall", "ocg_1"], "PATCH", "/api/agent/connectors/conn_1", { name: "Dash", oncallGroupId: "ocg_1" }],
    [["events", "list", "--limit", "5"], "GET", "/api/agent/events?limit=5", undefined],
    [["teams", "apps", "team_1"], "GET", "/api/agent/teams/team_1/apps", undefined],
    [["teams", "devices", "team_1"], "GET", "/api/agent/teams/team_1/devices", undefined],
    [["teams", "audit", "team_1", "--actor", "user_1", "--limit", "10"], "GET", "/api/agent/teams/team_1/audit?actor=user_1&limit=10", undefined],
    [["oncall", "delete", "ocg_1"], "DELETE", "/api/agent/oncall/ocg_1", undefined],
    [["webhooks", "update", "whk_1", "--default", "--events", "interaction.answered,interaction.canceled"], "PATCH", "/api/agent/webhooks/whk_1", { isDefault: true, events: ["interaction.answered", "interaction.canceled"] }],
    [["webhooks", "create", "--name", "A", "--url", "https://hooks.example.com/a", "--no-default"], "POST", "/api/agent/webhooks", { name: "A", url: "https://hooks.example.com/a", isDefault: false }],
    [["activities", "list"], "GET", "/api/agent/activities?limit=50", undefined],
  ];
  for (const [argv, method, path, body] of cases) {
    await withServer(
      () => Response.json({ interaction: { id: "int_1", status: "pending" }, ok: true }),
      async (requests) => {
        const result = await execute(argv, ENV);
        assert.equal(result.exitCode, 0, argv.join(" "));
        assert.equal(requests[0].method, method, argv.join(" "));
        assert.equal(requests[0].path, path, argv.join(" "));
        assert.deepEqual(requests[0].body, body, argv.join(" "));
      },
    );
  }
});

test("on-call escalation flags build the documented policy and reject bad steps", async () => {
  await withServer(
    (request) =>
      request.method === "GET"
        ? Response.json({ group: { rotation: { members: [{ userId: "u1" }], period: "daily", handoffAt: "09:00", timezone: "UTC", startsAt: "2026-01-01T09:00:00Z" } } })
        : Response.json({ group: {} }),
    async (requests) => {
      await execute(["oncall", "create", "--team", "team_1", "--name", "Ops", "--members", "u1,u2", "--timezone", "UTC", "--escalation", "10:next,30:group"], ENV);
      assert.deepEqual(requests[0].body.escalation, [{ afterMinutes: 10, target: "next" }, { afterMinutes: 30, target: "group" }]);
      await execute(["oncall", "update", "ocg_1", "--no-escalation"], ENV);
      assert.deepEqual(requests.at(-1).body, { escalation: [] });
    },
  );
  for (const value of ["0:next", "10:everyone", "1441:group", "1:next,2:next,3:next,4:next,5:next,6:next", "ten:next"]) {
    await assert.rejects(execute(["oncall", "update", "ocg_1", "--escalation", value], ENV), /--escalation/);
  }
  await assert.rejects(execute(["webhooks", "update", "whk_1", "--events", "interaction.created"], ENV), /--events/);
  await assert.rejects(execute(["connectors", "update", "conn_1"], ENV), /requires/);
  await assert.rejects(execute(["events", "list", "--limit", "500"], ENV), /--limit/);
});

test("audit CSV is printed verbatim instead of JSON", async () => {
  await withServer(
    () => new Response("time,action\n2026-11-01T00:00:00Z,app.launch\n", { headers: { "content-type": "text/csv" } }),
    async (requests) => {
      const result = await execute(["teams", "audit", "team_1", "--format", "csv"], ENV);
      assert.equal(result.output, "time,action\n2026-11-01T00:00:00Z,app.launch");
      assert.equal(requests[0].path, "/api/agent/teams/team_1/audit?format=csv");
    },
  );
});

test("writes carry an Idempotency-Key and retry a network failure with the same key", async () => {
  await withServer(
    (_request, count) => {
      if (count === 1) throw new TypeError("fetch failed");
      return Response.json({ notification: { id: "anot_1" }, accepted: 1 });
    },
    async (requests) => {
      const result = await execute(["send", "Backup finished"], ENV, { sleep: async () => {} });
      assert.equal(result.exitCode, 0);
      assert.equal(requests.length, 2);
      const key = requests[0].headers["Idempotency-Key"];
      assert.match(key, /^notify-cli-[0-9a-f-]{36}$/);
      assert.equal(requests[1].headers["Idempotency-Key"], key);
      assert.equal(requests[0].headers["user-agent"], `notify-tools/${VERSION}`);
    },
  );
  // Reads are never retried, and a caller's key is kept.
  await withServer(
    () => { throw new TypeError("fetch failed"); },
    async (requests) => {
      assert.equal(await run(["devices", "list"], ENV, capture().overrides), 6);
      assert.equal(requests.length, 1);
    },
  );
  await withServer(
    () => Response.json({ error: "bad gateway" }, { status: 502 }),
    async (requests) => {
      await assert.rejects(execute(["activity", "start", "--title", "T", "--status", "S", "--idempotency-key", "job-1"], ENV, { sleep: async () => {} }));
      assert.equal(requests.length, 3);
      assert.ok(requests.every((request) => request.headers["Idempotency-Key"] === "job-1"));
    },
  );
});

test("a - body or prompt is read from stdin", async () => {
  await withServer(
    (request) => Response.json(request.path.includes("interactions") ? { interaction: { id: "int_1", status: "pending" }, accepted: 1 } : { accepted: 1 }),
    async (requests) => {
      await execute(["send", "-", "--title", "Report"], ENV, { stdin: Readable.from([Buffer.from("line one\nline two\n")]) });
      assert.equal(requests[0].body.body, "line one\nline two");
      await execute(["send", "ask", "-", "--yes-no"], ENV, { stdin: Readable.from(["Ship it?\n"]) });
      assert.equal(requests[1].body.prompt, "Ship it?");
    },
  );
  await assert.rejects(execute(["send", "-", "--stdin"], ENV, { stdin: Readable.from(["{}"]) }), /either --stdin/);
  await assert.rejects(execute(["send", "-"], ENV, { stdin: Readable.from([""]) }), /stdin was empty/);
});

test("Ctrl-C stops a wait cleanly, keeps the prompt and says how to resume", async () => {
  let interrupt;
  await withServer(
    (request) => {
      if (request.method === "POST") return Response.json({ interaction: { id: "int_9", status: "pending" }, accepted: 1 }, { status: 201 });
      return new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        setImmediate(() => interrupt());
      });
    },
    async (requests) => {
      const io = capture();
      const code = await run(["send", "ask", "Proceed?", "--approval", "--wait"], ENV, {
        ...io.overrides,
        onInterrupt: (handler) => { interrupt = handler; return () => {}; },
      });
      assert.equal(code, 130);
      assert.equal(JSON.parse(io.out[0]).interrupted, true);
      assert.match(io.err.join("\n"), /notify interaction wait int_9/);
      assert.equal(requests.filter((request) => request.path.endsWith("/cancel")).length, 0);
    },
  );
});

test("errors are actionable, machine-readable with --json, and never echo credentials", async () => {
  await withServer(
    () => Response.json({ error: "Insufficient scope", required: ["events:read"] }, { status: 403 }),
    async () => {
      const io = capture();
      assert.equal(await run(["events", "list", "--json"], ENV, io.overrides), 3);
      const parsed = JSON.parse(io.err[0]);
      assert.equal(parsed.exitCode, 3);
      assert.equal(parsed.error.type, "auth");
      assert.deepEqual(parsed.error.required, ["events:read"]);
      assert.match(parsed.error.hint, /--scope events:read/);
    },
  );
  await withServer(
    () => Response.json({ error: `Upstream rejected Bearer ${ENV.NOTIFY_TOKEN} for /hooks/whk_abcdefghijkl` }, { status: 500 }),
    async () => {
      const io = capture();
      assert.equal(await run(["billing"], ENV, io.overrides), 1);
      const text = io.err.join("\n");
      assert.doesNotMatch(text, /ntf_fixturetoken/);
      assert.doesNotMatch(text, /whk_abcdefghijkl/);
      assert.match(text, /hint: Notify had a temporary problem/);
    },
  );
  assert.equal(redact("key ak_123456789abc and sk_live_abcdefgh"), "key [redacted] and [redacted]");
  const io = capture();
  assert.equal(await run(["teamz"], ENV, io.overrides), 2);
  assert.match(io.err[0], /Commands: auth, doctor/);
});

test("teams create explains that only families can be created", async () => {
  await withServer(
    () => Response.json({ error: "Teams are not available" }, { status: 403 }),
    async () => {
      await assert.rejects(execute(["teams", "create", "Acme"], ENV), /notify families create "Acme"/);
    },
  );
});

test("mini-apps archive --output writes the exact verified bytes once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "notify-archive-"));
  const bytes = Buffer.from('{"manifest":{},"files":[]}  \n');
  const id = createHash("sha256").update(bytes).digest("hex");
  try {
    await withServer(
      () => new Response(bytes),
      async () => {
        const output = join(directory, "a.json");
        const result = await execute(["mini-apps", "archive", id, "--output", output], ENV);
        assert.deepEqual(result.body, { packageId: id, path: output, bytes: bytes.length });
        assert.deepEqual(await readFile(output), bytes);
        await assert.rejects(execute(["mini-apps", "archive", id, "--output", output], ENV), /already exists/);
        await assert.rejects(
          execute(["mini-apps", "archive", "a".repeat(64), "--output", join(directory, "b.json")], ENV),
          /does not match/,
        );
        assert.deepEqual(await readdir(directory), ["a.json"]);
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("doctor reports setup without printing the token", async () => {
  await withServer(
    (request) => {
      if (request.path === "/api/health") return Response.json({ ok: true });
      if (request.path === "/api/agent/auth/status") {
        return Response.json({ authenticated: true, userId: "usr_1", token: { id: "tok_1", name: "laptop", scopes: ["devices:read", "notifications:send"], expiresAt: "2027-06-01T00:00:00Z" } });
      }
      if (request.path === "/api/agent/devices") return Response.json({ devices: [] });
      return Response.json({ error: "unexpected" }, { status: 500 });
    },
    async () => {
      const io = capture();
      const code = await run(["doctor", "--json"], { ...ENV, HOME: tmpdir() }, { ...io.overrides, now: () => Date.parse("2026-11-12T00:00:00Z") });
      assert.equal(code, 0);
      const body = JSON.parse(io.out[0]);
      const byName = Object.fromEntries(body.checks.map((check) => [check.name, check]));
      assert.equal(byName.api.status, "ok");
      assert.equal(byName["sign-in"].status, "ok");
      assert.equal(byName.scopes.status, "warn");
      assert.equal(byName.devices.status, "warn");
      assert.doesNotMatch(io.out.join("\n") + io.err.join("\n"), /ntf_fixturetoken/);
    },
  );
  await withServer(
    () => { throw new TypeError("fetch failed"); },
    async () => {
      const io = capture();
      const code = await run(["doctor"], { NOTIFY_CONFIG: join(tmpdir(), "absent-notify.json"), NOTIFY_API_URL: "https://example.test", HOME: tmpdir() }, io.overrides);
      assert.equal(code, 3);
      assert.match(io.out[0], /FAIL {2}credentials/);
    },
  );
});

test("version, per-command help and completion come from one reference", async () => {
  assert.equal((await execute(["--version"], {})).output, VERSION);
  assert.deepEqual((await execute(["version", "--json"], {})).body, { version: VERSION });
  const help = (await execute(["interaction", "cancel", "--help"], {})).body.help;
  assert.match(help, /Example: notify interaction cancel int_RETURNED_ID/);
  assert.match((await execute(["help", "exit-codes"], {})).body.help, /130 {2}interrupted/);
  assert.match((await execute(["--help"], {})).body.help, /notify auth login/);
  assert.match((await execute(["completion", "bash"], {})).output, /complete -F _notify_complete notify/);
  assert.match(completionScript("zsh"), /bashcompinit/);
  await assert.rejects(execute(["completion", "fish"], {}), /bash or zsh/);
  const parserFlags = new Set([...knownFlags().value, ...knownFlags().boolean]);
  for (const entry of COMMANDS) {
    for (const flag of entry.flags ?? []) assert.ok(parserFlags.has(flag), `${entry.path} --${flag}`);
    assert.match(entry.example, /^(eval "\$\()?notify /, entry.path);
  }
});

test("login backs off when the device endpoint rate-limits instead of failing", async () => {
  let polls = 0;
  await withServer(
    (request) => {
      if (request.path.endsWith("/start")) {
        return Response.json({ deviceCode: "d".repeat(43), userCode: "ABCD-2345", verificationUri: "https://example.test/a", verificationUriComplete: "https://example.test/a?c", expiresIn: 600, interval: 5 }, { status: 201 });
      }
      polls += 1;
      if (polls === 1) return Response.json({ error: "rate_limited", interval: 60 }, { status: 429 });
      return Response.json({ accessToken: "ntf_saved", token: { id: "tok_1", scopes: [] } });
    },
    async () => {
      const sleeps = [];
      const result = await execute(["auth", "login", "--no-open"], { NOTIFY_API_URL: "https://example.test", NOTIFY_CONFIG: join(tmpdir(), "unused.json") }, {
        sleep: async (ms) => { sleeps.push(ms); }, stderr: () => {}, stderrIsTTY: false, writeConfig: async () => {},
      });
      assert.equal(result.body.authenticated, true);
      assert.deepEqual(sleeps, [5000, 60000]);
    },
  );
});

test("skills install, update and uninstall only touch managed directories", async () => {
  const home = await mkdtemp(join(tmpdir(), "notify-skills-"));
  const env = { HOME: home, XDG_CONFIG_HOME: join(home, ".config") };
  try {
    await assert.rejects(execute(["skills", "install"], env), /No agent configuration found/);
    await mkdir(join(home, ".claude"));
    const dry = await execute(["skills", "install", "--dry-run"], env);
    assert.ok(dry.body.results.every((entry) => entry.action === "would be installed"));
    const installed = await execute(["skills", "install"], env);
    assert.equal(installed.exitCode, 0);
    assert.deepEqual(installed.body.results.map((entry) => `${entry.agent}:${entry.skill}:${entry.action}`), ["claude:notify:installed", "claude:notify-integrations:installed"]);
    const root = join(home, ".claude", "skills", "notify");
    const marker = JSON.parse(await readFile(join(root, ".notify-tools.json"), "utf8"));
    assert.equal(marker.version, VERSION);
    assert.ok(marker.files.includes("SKILL.md"));
    assert.ok(marker.files.every((file) => !file.startsWith("notify-")), "only linked files are installed");
    assert.equal((await execute(["skills", "install"], env)).body.results[0].action, "reinstalled");
    const status = await execute(["skills", "status", "--agent", "claude"], env);
    assert.ok(status.body.skills.every((entry) => entry.installed && entry.managed));

    const custom = join(home, "custom");
    await mkdir(join(custom, "notify"), { recursive: true });
    await writeFile(join(custom, "notify", "SKILL.md"), "mine");
    const refused = await execute(["skills", "install", "--dir", custom], env);
    assert.equal(refused.exitCode, 1);
    assert.equal(refused.body.results[0].action, "skipped");
    assert.equal(await readFile(join(custom, "notify", "SKILL.md"), "utf8"), "mine");
    assert.equal((await execute(["skills", "uninstall", "--dir", custom], env)).body.results[0].action, "skipped");

    const removed = await execute(["skills", "uninstall", "--agent", "claude"], env);
    assert.ok(removed.body.results.every((entry) => entry.action === "removed"));
    assert.deepEqual(await readdir(join(home, ".claude", "skills")), []);
    await assert.rejects(execute(["skills", "install", "--agent", "cursor"], env), /--agent must be/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
