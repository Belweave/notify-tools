# Receiving answers

Notify can push a prompt's outcome to your code in two ways. They differ in
payload, signature and retries; do not parse one as the other.

| | Reply webhook | Per-question callback |
|---|---|---|
| Set up | `notify webhooks create`, once per endpoint | `callback` field on each prompt |
| Events | `interaction.answered`, `.expired`, `.canceled` | answers only |
| Signature header | `X-Notify-Signature: t=<unix>,v1=<hex>` | `Notify-Timestamp` + `Notify-Signature: v1=<hex>` |
| Signed bytes | `<t>.` + raw body, HMAC-SHA256 with the webhook signing secret | `<timestamp>.` + raw body, HMAC-SHA256 with the callback token or connector secret |
| Retries | now, then 1, 5, 15, 40 minutes; 4xx is final | now, then 30 s, 2, 10, 60 minutes |
| Deduplicate on | `X-Notify-Delivery-Id` | `interactionId` |

## Reply webhooks

Create the endpoint once the receiver can verify signatures. Save the
`signingSecret` from the JSON straight into your secret store:

```sh
notify webhooks create --name "Answers" --url https://hooks.example.com/notify \
  --events interaction.answered,interaction.expired,interaction.canceled --default --json > webhook.json
notify webhooks test whk_RETURNED_ID
notify webhooks get whk_RETURNED_ID
```

`--default` covers every prompt on the account (including MCP and API prompts
with no service); `notify send ask ... --webhook whk_ID` selects it for one prompt.
`webhooks get` shows the last 50 deliveries with status codes. `test` queues a
sample with `"test": true` (202 means queued, not delivered).

The generic preset body:

```json
{"type": "interaction.answered", "interaction": {"id": "int_RETURNED_ID", "title": "Production deploy", "kind": "approval", "status": "approved", "response": "approve", "respondingDeviceId": "dev_RETURNED_ID", "respondedAt": "2026-11-12T10:04:17.000Z"}, "sentAt": "2026-11-12T10:04:18.000Z"}
```

`service: {id, title}` is present for service prompts; `response`,
`respondingDeviceId` and `respondedAt` are null for expired or canceled ones.
The `slack` preset sends `{"text": "..."}` instead.

A Node receiver with the SDK (any framework works if you keep the raw body):

```js
import { createServer } from "node:http";
import { verifyReplyWebhookSignature } from "./vendor/notify/connector.mjs";

const secret = process.env.NOTIFY_WEBHOOK_SECRET;
const seen = new Set(); // use a durable table in production

createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const signature = request.headers["x-notify-signature"];
  if (!verifyReplyWebhookSignature({ secret, body: raw, signature })) {
    response.writeHead(401).end();
    return;
  }
  const deliveryId = request.headers["x-notify-delivery-id"];
  if (!seen.has(deliveryId)) {
    seen.add(deliveryId);
    const event = JSON.parse(raw.toString("utf8"));
    if (event.type === "interaction.answered" && event.interaction.status === "approved") {
      console.log(`approved ${event.interaction.id}`);
    }
  }
  response.writeHead(204).end();
}).listen(8780);
```

Without the SDK, the check is: parse `t=(\d+),v1=([a-f0-9]{64})`, reject if the
timestamp is in the future or older than 300 seconds, compute
`HMAC-SHA256(secret, t + "." + rawBody)` and compare in constant time.

## Per-question callbacks

Add `callback` when creating the prompt (MCP, HTTP or CLI `--stdin`). Either a
public HTTPS URL with a bearer token you generate (16–512 characters), or a
connector target that reaches a service through `notify connect`:

```sh
echo '{"title":"Pickup desk","prompt":"Hold package PKG-42 until tomorrow?","callback":{"target":{"connectorId":"conn_SELECTED_ID","route":"cb","path":"/notify/answers"}}}' \
  | notify send ask --approval --stdin
```

```json
{"callback": {"url": "https://warehouse.example.com/notify-answer", "token": "generate-32-random-characters-here"}}
```

The callback body:

```json
{"type": "notification.response", "interactionId": "int_RETURNED_ID", "actionDigest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "eventId": null, "correlationId": null, "kind": "approval", "status": "approved", "action": "approve", "text": null, "respondedAt": "2026-11-12T10:04:17.000Z"}
```

`kind` is `approval`, `yes_no` or `reply`; a reply has `action: "reply"` and the
answer in `text`. Match `interactionId` and `actionDigest` against the prompt you
stored before acting. A URL callback also carries `Authorization: Bearer <token>`.
Verify with the SDK:

```js
import { verifyCallbackSignature } from "./vendor/notify/connector.mjs";

export function isGenuineCallback(rawBody, headers, secret) {
  return verifyCallbackSignature({
    secret,
    body: rawBody.toString("utf8"),
    timestamp: headers["notify-timestamp"],
    signature: headers["notify-signature"],
  });
}
```

For a connector target the secret is the connector callback secret that
`notify connect` saved under `connectors/<id>.secret` beside the CLI config.
Callbacks report answers only; use a reply webhook or `notify interaction get` for
expiry and cancellation.

## HTTP and MCP

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/webhooks/whk_RETURNED_ID/test \
  -H "Authorization: Bearer $NOTIFY_TOKEN"
```

```mcp
{"tool": "webhooks_create", "arguments": {"name": "Answers", "url": "https://hooks.example.com/notify", "events": ["interaction.answered", "interaction.expired", "interaction.canceled"], "isDefault": true}}
```

```mcp
{"tool": "interactions_create", "arguments": {"title": "Pickup desk", "prompt": "Hold package PKG-42 until tomorrow?", "kind": "approval", "callback": {"target": {"connectorId": "conn_SELECTED_ID", "route": "cb", "path": "/notify/answers"}}}}
```
