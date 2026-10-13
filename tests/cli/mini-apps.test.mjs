import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execute } from "../../src/cli/index.mjs";
import {
  buildPackage,
  MINI_APP_MEDIA_TYPES,
  miniAppsCommand,
  validateArchive,
} from "../../src/cli/commands/mini-app-package.mjs";

function fixture() {
  const data = Buffer.from("<h1>Draft</h1>");
  return {
    manifest: {
      schemaVersion: 1,
      appId: "notebook",
      name: "Notebook",
      version: "1.0.0",
      publisher: { id: "owner", name: "Owner" },
      format: "web",
      runtime: "notify-web-v1",
      entryPoint: "index.html",
      files: [
        {
          path: "index.html",
          size: data.length,
          sha256: createHash("sha256").update(data).digest("hex"),
          mediaType: "text/html",
        },
      ],
      capabilities: ["local-storage"],
      ageRating: 4,
      commerce: "none",
    },
    data,
  };
}
async function directory() {
  const dir = await mkdtemp(join(tmpdir(), "notify-mini-test-"));
  const { manifest, data } = fixture();
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(dir, "index.html"), data);
  return dir;
}
test("build produces a deterministic validated archive; local commands do not need auth", async () => {
  const dir = await directory();
  const a = await buildPackage(dir);
  const b = await buildPackage(dir);
  assert.deepEqual(a.bytes, b.bytes);
  const output = join(await mkdtemp(join(tmpdir(), "notify-mini-artifact-")), "package.json");
  assert.equal(
    (await execute(["mini-apps", "build", dir, output], {})).body.packageId,
    a.packageId,
  );
  assert.equal((await execute(["mini-apps", "validate", output], {})).body.packageId, a.packageId);
  await assert.rejects(buildPackage(dir, output), /EEXIST/);
});
test("rejects symlinks, symlink roots, unlisted content, nested symlinks and traversal", async () => {
  const dir = await directory();
  await symlink(join(dir, "index.html"), join(dir, "link.html"));
  await assert.rejects(buildPackage(dir), /Symlinks/);
  const parent = await mkdtemp(join(tmpdir(), "notify-mini-links-"));
  await symlink(dir, join(parent, "root"));
  await assert.rejects(buildPackage(join(parent, "root")), /symlink/);
  const extra = await directory();
  await writeFile(join(extra, "extra.txt"), "extra");
  await assert.rejects(buildPackage(extra), /Unlisted/);
  const nested = await directory();
  await mkdir(join(nested, "assets"));
  await symlink(dir, join(nested, "assets", "external"));
  await assert.rejects(buildPackage(nested), /Unlisted|Symlinks/);
  const unsafe = fixture();
  unsafe.manifest.files[0].path = "../index.html";
  assert.throws(
    () => validateArchive(Buffer.from(JSON.stringify({ manifest: unsafe.manifest, files: [] }))),
    /Unsafe/,
  );
});
test("strict parser rejects duplicate escaped keys, malformed UTF8/base64, tampering, native and paid", () => {
  const { manifest, data } = fixture();
  const a = { manifest, files: [{ path: "index.html", data: data.toString("base64") }] };
  const bytes = Buffer.from(JSON.stringify(a));
  assert.equal(validateArchive(bytes).manifest.publisher.id, "owner");
  assert.throws(
    () =>
      validateArchive(
        Buffer.from(
          JSON.stringify(a).replace('"schemaVersion":1', '"schemaVersion":2,"schemaVersion":1'),
        ),
      ),
    /ambiguous/,
  );
  assert.throws(() => validateArchive(Buffer.from([255])), /encoded|encoding/);
  for (const mutate of [
    (a) => (a.files[0].data = "AAAA"),
    (a) => (a.manifest.commerce = "paid"),
    (a) => (a.manifest.runtime = "native"),
    (a) => (a.manifest.files[0].mediaType = "application/javascript"),
    (a) => (a.manifest.ageRating = 10),
    (a) => (a.manifest.reviewState = "approved"),
    (a) => (a.manifest.files[0].size = 4 * 1024 * 1024 + 1),
  ]) {
    const copy = JSON.parse(bytes);
    mutate(copy);
    assert.throws(() => validateArchive(Buffer.from(JSON.stringify(copy))));
  }
  assert.throws(() => validateArchive(Buffer.alloc(12 * 1024 * 1024 + 1)), /size limit/);
});
test("publish discovers authenticated account using supported status endpoint and fails closed on identity mismatch", async () => {
  const dir = await directory();
  const { bytes } = await buildPackage(dir);
  const archive = join(await mkdtemp(join(tmpdir(), "notify-mini-publish-")), "archive.json");
  await writeFile(archive, bytes);
  const calls = [];
  const request = async (path, init) => {
    calls.push({ path, init });
    return path.endsWith("auth/status")
      ? { authenticated: true, userId: "owner" }
      : { package: { packageId: "ok" } };
  };
  await miniAppsCommand("publish", archive, undefined, request);
  assert.deepEqual(
    calls.map((c) => c.path),
    ["/api/agent/auth/status", "/api/agent/mini-apps/publish"],
  );
  assert.deepEqual(calls[1].init.body, bytes);
  await assert.rejects(
    miniAppsCommand("publish", archive, undefined, async () => ({
      authenticated: true,
      userId: "foreign",
    })),
    /authenticated account/,
  );
  await assert.rejects(
    miniAppsCommand("publish", archive, undefined, async () => ({ authenticated: true })),
    /identify/,
  );
});
test("offer performs only an explicit personal package request with mocked transport", async () => {
  const calls = [];
  const id = "a".repeat(64);
  await miniAppsCommand("offer", id, undefined, async (path, init) => {
    calls.push({ path, init });
    return { accepted: 0 };
  });
  assert.deepEqual(calls, [
    { path: `/api/agent/mini-apps/${id}/offer`, init: { method: "POST", body: "{}" } },
  ]);
  await assert.rejects(
    miniAppsCommand("offer", "../other", undefined, () => {}),
    /SHA-256/,
  );
});
test("CLI validate and publish reject hashed casefold ancestor collisions before upload", async () => {
  for (const paths of [
    ["assets.js", "assets.js/child.js"],
    ["ASSETS.js/child.js", "assets.js"],
    ["assets.js/nested/child.js", "Assets.JS"],
  ]) {
    const { manifest, data } = fixture();
    const files = [{ path: "index.html", data: data.toString("base64") }];
    for (const path of paths) {
      const content = Buffer.from("console.log('ok')");
      manifest.files.push({
        path,
        size: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
        mediaType: "text/javascript",
      });
      files.push({ path, data: content.toString("base64") });
    }
    const bytes = Buffer.from(JSON.stringify({ manifest, files }));
    assert.throws(() => validateArchive(bytes), /File\/directory/);
    const archive = join(await mkdtemp(join(tmpdir(), "notify-mini-collision-")), "archive.json");
    await writeFile(archive, bytes);
    await assert.rejects(execute(["mini-apps", "validate", archive], {}), /File\/directory/);
    let calls = 0;
    await assert.rejects(
      miniAppsCommand("publish", archive, undefined, async (path) => {
        calls++;
        assert.equal(path, "/api/agent/auth/status");
        return { authenticated: true, userId: "owner" };
      }),
      /File\/directory/,
    );
    assert.equal(calls, 1);
  }
});

test("owner reads and reason-bound controls use exact supported routes with mocked transport", async () => {
  const id = "b".repeat(64);
  for (const action of ["list", "keys", "review", "export", "get", "archive", "report", "block", "disable", "remove"]) {
    const calls = [];
    await miniAppsCommand(action, id, undefined, async (path, init) => { calls.push({ path, init }); return {}; }, { reason: "  testing  " });
    const suffix = action === "list" ? "" : ["keys", "review", "export"].includes(action) ? `/${action}` : `/${id}${["get", "remove"].includes(action) ? "" : `/${action}`}`;
    assert.equal(calls[0].path, `/api/agent/mini-apps${suffix}`);
    if (["report", "block", "disable", "remove"].includes(action)) {
      assert.deepEqual(calls[0].init, { method: action === "remove" ? "DELETE" : "POST", body: '{"reason":"testing"}' });
      for (const reason of [undefined, " ", "x".repeat(501)]) {
        await assert.rejects(miniAppsCommand(action, id, undefined, () => assert.fail("must not request"), { reason }), /reason/);
      }
    } else assert.equal(calls[0].init, undefined);
  }
  await assert.rejects(miniAppsCommand("get", "../bad", undefined, () => assert.fail("must not request")), /SHA-256/);
});

test("CLI registers reason-bound controls and preserves JSON request bodies", async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json({ ok: true }); };
  try {
    const id = "c".repeat(64);
    const result = await execute(["mini-apps", "remove", id, "--reason", "cleanup"], { NOTIFY_TOKEN: "ntf_fixture", NOTIFY_API_URL: "https://fixture.invalid" });
    assert.equal(result.body.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://fixture.invalid/api/agent/mini-apps/${id}`);
    assert.equal(calls[0].init.method, "DELETE");
    assert.equal(calls[0].init.body, '{"reason":"cleanup"}');
  } finally { globalThis.fetch = previous; }
});
