---
name: notify-integrations
description: Build software that integrates with Notify. Use when writing or debugging a receiver for Notify answers (reply webhooks or per-question callbacks and their signatures), publishing a private or local web service to phones with notify connect or the connector SDK, adding microAuth phone sign-in to a website, packaging a personal mini app, or routing Claude Code, Codex or OpenCode permission requests to a phone. For sending notifications, asking for decisions, progress, paging or account management, use the notify skill instead.
license: Apache-2.0
metadata:
  compatible-cli: "0.15.1"
---

# Notify integrations

Use this skill when you write code or configuration that Notify calls, or that
calls Notify from inside an application. Day-to-day use (send, ask, progress,
page, teams) is in the `notify` skill.

## Pick the guide

| You are building | Start with | Read |
|---|---|---|
| An endpoint that receives answers (`interaction.answered`, expired, canceled) | `notify webhooks create ... --default`, SDK `verifyReplyWebhookSignature` | [receivers](references/receivers.md) |
| A callback for one question, into a service on your network | `callback.target` on the prompt, `notify connect` | [receivers](references/receivers.md), [connectors](references/connectors.md) |
| A local or private web app opened from the phone | `notify connect 3000 --name dashboard` | [connectors](references/connectors.md) |
| Phone sign-in and profile sharing for your website | SDK `connectMicroAuth` + `createMicroAuthServer` | [microAuth](references/microauth.md) |
| An offline personal web package | `notify mini-apps build`, `validate`, `publish` | [mini apps](references/mini-apps.md) |
| Approve an agent's tool use from the phone | `notify permissions setup claude` | [permission hooks](references/permission-hooks.md) |

The SDK ships in every release under `sdk/`: copy the whole directory (chunks,
declarations and licence notices) to your project, for example `vendor/notify/`.
It needs no npm install. Modules: `connector.mjs` (connector, pass middleware,
signature verifiers), `server.mjs` and `browser.mjs` (microAuth),
`activity-design.mjs` (Live Activity design validation).

## Rules for integrations

1. **Verify before you parse.** Check the signature against the exact raw request
   bytes, then the timestamp (5 minutes), then parse JSON. Re-serialised JSON
   never matches.
2. **Deduplicate and act idempotently.** Deliveries retry. Store the delivery or
   interaction ID with the side effect in one transaction; answer 2xx for repeats.
3. **Answer means permission for what was shown only.** Match the interaction ID
   (and `actionDigest` for callbacks) to the action you proposed before acting.
4. **Secrets stay in secret stores.** Signing secrets, callback secrets, service
   URLs and tokens are returned once: save them to a file with mode 0600 or a
   secret manager, never to logs, source, chat or phone text.
