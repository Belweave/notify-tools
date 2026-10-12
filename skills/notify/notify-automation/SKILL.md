---
name: notify-automation
description: Connect external events and reply webhooks to Notify, configure supported agent permission hooks, and build durable notification workflows.
---

# Connect an event to the right surface

Use a one-time [message](../notify-messages/SKILL.md) for information, a [decision](../notify-decisions/SKILL.md) for human input, and [progress](../notify-progress/SKILL.md) for a changing job. A service supplies a persistent Notify event endpoint and defaults. It does not schedule recurring execution by itself.

Inspect `services_list` / `notify services list` before creating one. `services_create` / `notify services create --title "Builds"` returns the service configuration. Treat generated event URLs as credentials. Rotating a service invalidates the old integration URL; coordinate the replacement with its actual caller.

Recurring work needs an external scheduler or a scheduler tool supplied by the host. Configure that only when requested, retain its durable ID, and report its actual next run. An assistant waiting in a chat is not a persistent scheduler.

## Receive answers

Reply webhooks are saved HTTPS endpoints managed by `webhooks_*` tools or `notify webhooks`. A selected webhook ID can be attached to a prompt; enabled account-default subscriptions may also receive terminal events. Do not assume one endpoint or exactly one delivery.

Create an endpoint only when the receiver is ready. Capture the returned signing secret in protected storage. Verify signatures against the exact raw request bytes before parsing. Validate timestamp freshness, deduplicate by durable event/interaction identity, and make the resulting action idempotent. A successful callback delivery is not proof that the business action finished.

For callbacks into an internal service, use the connector's dedicated ingress described in [notify-connectors](../notify-connectors/SKILL.md). The persisted interaction target determines the permitted route; never let a reply supply an arbitrary forwarding path.

## Agent permission integrations

The CLI has adapters for Claude Code, Codex, and OpenCode:

```sh
notify permissions help
notify permissions doctor
notify permissions setup codex
```

Choose the actual host, inspect its supported mode, and change only that integration. These adapters translate the host's permission requests into durable Notify decisions; they do not grant blanket future authorization. Do not install `all` when only one host was requested. For another AI agent, use Notify MCP or CLI primitives and that agent's documented permission hooks instead of pretending a built-in adapter exists.

Keep the association between the host request and Notify interaction ID. Apply an answer to that exact outstanding request, handle cancellation and expiry, and stop retries when the host request no longer exists. A recovered process should inspect existing state before sending the person another prompt.
