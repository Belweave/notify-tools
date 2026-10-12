import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  coalescedPermissionDecision,
  createOpenCodeClient,
} from "../../src/agents/opencode/v2/index.mjs";

test("OpenCode adapter coalesces concurrent requests for the same permission", async () => {
  let resolveDecision;
  let asks = 0;
  const ask = () => {
    asks += 1;
    return new Promise((resolve) => {
      resolveDecision = resolve;
    });
  };
  const location = { directory: "/tmp/notify" };
  const first = {
    id: "per_1",
    sessionID: "ses_1",
    action: "external_directory",
    resources: ["/private/shared"],
  };
  const second = { ...first, id: "per_2" };

  const firstDecision = coalescedPermissionDecision(first, location, ask);
  const secondDecision = coalescedPermissionDecision(second, location, ask);
  assert.equal(asks, 1);
  assert.equal(firstDecision, secondDecision);

  resolveDecision("approved");
  assert.deepEqual(await Promise.all([firstDecision, secondDecision]), ["approved", "approved"]);

  const later = await coalescedPermissionDecision(first, location, async () => {
    asks += 1;
    return "denied";
  });
  assert.equal(later, "denied");
  assert.equal(asks, 2);
});

test("OpenCode adapter keeps different resources as separate decisions", async () => {
  let asks = 0;
  const ask = async () => {
    asks += 1;
    return "approved";
  };
  const request = {
    id: "per_distinct_1",
    sessionID: "ses_distinct",
    action: "external_directory",
    resources: ["/private/first"],
  };
  await Promise.all([
    coalescedPermissionDecision(request, { directory: "/tmp/notify" }, ask),
    coalescedPermissionDecision(
      { ...request, id: "per_distinct_2", resources: ["/private/second"] },
      { directory: "/tmp/notify" },
      ask,
    ),
  ]);
  assert.equal(asks, 2);
});

test("OpenCode adapter lists, validates, replies, and consumes permission events", async () => {
  const permission = {
    id: "per_1",
    sessionID: "ses_1",
    action: "shell",
    resources: ["redacted"],
  };
  let reply;
  const server = createServer(async (request, response) => {
    if (request.url === "/api/debug/location") {
      response.setHeader("content-type", "application/json");
      return response.end(JSON.stringify([{ directory: "/tmp/notify" }]));
    }
    if (request.url?.startsWith("/api/permission/request")) {
      response.setHeader("content-type", "application/json");
      return response.end(
        JSON.stringify({
          location: {
            directory: "/tmp/notify",
            project: { id: "p", directory: "/tmp/notify" },
          },
          data: [permission],
        }),
      );
    }
    if (request.url === "/api/session/ses_1/permission/per_1" && request.method === "GET") {
      response.setHeader("content-type", "application/json");
      return response.end(JSON.stringify({ data: permission }));
    }
    if (request.url === "/api/session/ses_1/permission/per_1/reply") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      reply = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      response.statusCode = 204;
      return response.end();
    }
    if (request.url === "/api/event") {
      response.setHeader("content-type", "text/event-stream");
      response.write(`data: ${JSON.stringify({ type: "permission.asked", data: permission })}\n\n`);
      return response.end();
    }
    response.statusCode = 404;
    return response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const client = createOpenCodeClient({
      url: `http://127.0.0.1:${address.port}`,
    });
    assert.equal((await client.debug.location.list()).length, 1);
    assert.equal((await client.permission.request.list()).data[0].id, "per_1");
    assert.equal(
      (await client.permission.get({ sessionID: "ses_1", requestID: "per_1" })).id,
      "per_1",
    );
    await client.permission.reply({
      sessionID: "ses_1",
      requestID: "per_1",
      reply: "once",
    });
    assert.deepEqual(reply, { reply: "once" });
    const events = [];
    for await (const event of client.event.subscribe()) events.push(event);
    assert.equal(events[0].type, "permission.asked");
  } finally {
    server.close();
  }
});
