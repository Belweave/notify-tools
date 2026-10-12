---
name: notify-connectors
description: Publish an internal HTTP service through a Notify connector with authenticated app access, revocation, and separately authenticated callbacks.
---

# Connect a running service

Confirm the local service and intended workspace. The connector process must remain running:

```sh
notify connect 3000 --name dashboard --team team_SELECTED_ID
```

Omit `--team` for personal use. `--name` is a DNS route label, not a display sentence. The SDK exposes `connectInternal` from the release's `sdk/connector.mjs` with `token`, `name`, `routes`, and optional `teamId`; retain the returned handle and close it during shutdown. Creating or changing a team connector requires current admin or owner authority.

Use a private credential source for `NOTIFY_TOKEN`. CLI 0.10.0 and later saves callback signing secrets to a private mode-0600 file and reports only its path, including when authentication comes from the environment. SDK creation or rotation can return a secret once; persist it directly in protected storage. Older CLI releases printed it to stderr: use the updated CLI or a protected SDK runner before starting an agent-owned connector. Read the returned connector and route metadata to report the registered URL and app ID. Do not claim success until registration and the local service are reachable through the intended path.

## Preserve the gateway boundary

The connector supplies a loopback access gateway to both default and custom tunnel transports. Never replace its target with the raw employer listener. Every page, asset, API request, and WebSocket must traverse that gateway. Restrict direct access to the upstream service before trusting its verified `x-notify-*` identity headers.

The gateway's Connect with Notify screen exchanges a short-lived pass for a secure host-only cookie. Notify atomically consumes the pass and rechecks the existing grant, current membership, route state, connector state, and credential on subsequent requests. Failure to authorize denies access. Streams revalidate and close after revocation; this is bounded revalidation, not instantaneous deletion of already delivered content.

For framework middleware outside this gateway, the exported pass middleware requires an atomic durable `consumeJti` store. Use the current connector README's database example. `verifyNotifyPass` performs cryptographic verification only; it is not a replay store or a complete session/revocation system. Never make the token a URL parameter or persist it in browser storage.

For an interaction routed back to this service, its creation payload can use:

```json
{"callback":{"target":{"connectorId":"conn_RETURNED_ID","route":"dashboard","path":"/notify/replies"}}}
```

Inspect the live interaction schema and supply this through MCP, HTTP, or structured CLI input; there is no `--callback-target` flag. Set up the receiver before sending a real decision prompt.

Machine replies enter only through `POST /.notify/callback`. Notify validates the HMAC, durable replay receipt, current access, and the saved interaction target. The gateway forwards the approved path and returns no employer response body. Do not create an HMAC-only bypass for arbitrary application routes.

## Diagnose and operate

Use actual readiness output and logs that omit secrets. A stale connector may have stopped, lost its credential, or failed upstream access. Fix the cause rather than repeatedly registering new apps. Admin route/connector disable controls are provided by the current API; inspect its schema before calling them because CLI coverage differs by release.

TLS terminates at the connector in the intended relay design; the operator's DNS and certificate-issuance authority remains part of the trust model. A health endpoint alone does not prove a deployed certificate path. Do not describe the relay as end-to-end confidential from an operator who can substitute certificates, or claim a production deployment was verified from local tests.
