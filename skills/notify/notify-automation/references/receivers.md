# Reply receivers

Use the deployed [OpenAPI document](https://notify.belweave.ai/openapi.json) for interaction creation and webhook configuration, including `callback.target` and subscribed events. The source serializers below define outbound bodies; these are delivery payloads, not new API endpoints. For offline integration, inspect the compatible checkout's named source files or use this documented shape, then confirm the deployed version before enabling business actions.

## Connector-targeted callback

The canonical serializer is [`interactionCallbackBody`](https://github.com/Belweave/notify/blob/main/apps/website/src/server/lib/callback-payload.ts). Its exact fields are:

```json
{"type":"notification.response","interactionId":"int_RETURNED_ID","actionDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","eventId":null,"correlationId":null,"kind":"approval","status":"approved","action":"approve","text":null,"respondedAt":"2026-10-17T16:00:00.000Z"}
```

`eventId` and `correlationId` may be null; do not use them as mandatory deduplication keys. `kind` is `approval|yes_no|reply`. For binary decisions, `action` is the stored response (`approve|deny|yes|no`) and `text` is null; for a written reply, `action` is `reply` and `text` is the response. This ingress accepts recorded answered statuses (`approved|denied|yes|no|replied`), not expiry/cancellation events.

Retain the expected interaction ID and action digest when creating the prompt. Match them before acting; durably deduplicate by interaction ID and enforce the recorded action's scope. Restrict the upstream receipt endpoint to its fixed POST route and gateway access. Gateway ingress is `POST /.notify/callback`, with `notify-timestamp` and `notify-signature: v1=HEX_HMAC_SHA256`. It validates the raw-byte HMAC over `timestamp + "." + body`, freshness, the saved response/target, current access, and durable replay receipt before forwarding unchanged body bytes to the approved upstream path. SDK `verifyCallbackSignature` is cryptographic verification only; it does not replace these checks. Return success after durable receipt; process work idempotently and report its outcome separately.

## Saved reply webhook

Generic and grok presets use the envelope produced by [`recordReplyWebhookEvent`](https://github.com/Belweave/notify/blob/main/apps/website/src/server/lib/reply-webhooks.ts):

```json
{"type":"interaction.answered","interaction":{"id":"int_RETURNED_ID","title":"Release staging?","kind":"approval","status":"approved","response":"approve","respondingDeviceId":"dev_RETURNED_ID","respondedAt":"2026-10-17T16:00:00.000Z"},"sentAt":"2026-10-17T16:00:01.000Z"}
```

Supported subscriptions are `interaction.answered`, `interaction.expired`, and `interaction.canceled`. `service: {id,title}` is included when service-associated; response/device/respondedAt can be null for unanswered terminal events. Slack preset sends `{text: "..."}` instead, so do not feed it to the generic envelope parser. Validate the selected preset, raw-byte signature and timestamp, durably deduplicate the terminal interaction event (for example `type` plus `interaction.id`), and use an idempotent outbox for business work. This format has no top-level `interactionId` or mandatory `eventId`.
