---
name: notify-automation
description: Connect external events and reply webhooks to Notify, configure supported agent permission hooks, and build durable notification workflows.
---

# Connect an event to the right surface

Use a one-time [message](../notify-messages/SKILL.md) for information, a [decision](../notify-decisions/SKILL.md) for human input, and [progress](../notify-progress/SKILL.md) for a changing job. A service supplies a persistent Notify event endpoint and defaults. It does not schedule recurring execution by itself.

Inspect `services_list` / `notify services list` before creating one. `services_create` / `notify services create --title "Builds"` returns the service configuration. Treat generated event URLs as credentials. Rotating a service invalidates the old integration URL; coordinate the replacement with its actual caller.

Use `services get` for the existing endpoint/configuration, `services update` for defaults, `services remove` for the requested retirement, and `services share --family FAMILY_ID|--personal` for family scope. Service webhook defaults (`--reply-webhook`, cleared with `--no-reply-webhook`) differ from a prompt's explicit `--webhook` and account-level subscriptions.

Recurring work needs an external scheduler or a scheduler tool supplied by the host. Configure that only when requested, retain its durable ID, and report its actual next run. An assistant waiting in a chat is not a persistent scheduler.

## Receive answers

Reply webhooks are saved HTTPS endpoints managed by `webhooks_*` tools or `notify webhooks`. A selected webhook ID can be attached to a prompt; enabled account-default subscriptions may also receive terminal events. Do not assume one endpoint or exactly one delivery.

Read [receiver payloads](references/receivers.md) when implementing a callback or webhook receiver; these two delivery formats differ. Create an endpoint only when the receiver is ready. Capture the returned signing secret in protected storage. Verify signatures against the exact raw request bytes before parsing. Validate timestamp freshness, deduplicate by durable event/interaction identity, and make the resulting action idempotent. A successful callback delivery is not proof that the business action finished.

`notify webhooks list|get` discovers subscriptions; create/update support generic, grok, and slack presets, enabled state, and structured `--stdin` headers/events. `test` sends a real test delivery. `rotate-secret` returns replacement signing material once; coordinate receiver rotation. `remove` ends that subscription. Do not print credential headers or signing material.

For callbacks into an internal service, use the connector's dedicated ingress described in [notify-connectors](../notify-connectors/SKILL.md). The persisted interaction target determines the permitted route; never let a reply supply an arbitrary forwarding path.

## Agent permission integrations

For Claude Code, Codex, or OpenCode v1/v2, read [permission adapters](references/permissions.md) before setup or diagnosis. Other agents can integrate MCP/CLI decisions with their own supported hooks. A permission adapter forwards a particular host request; it does not grant future blanket approval.
