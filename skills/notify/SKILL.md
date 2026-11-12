---
name: notify
description: Reach a person on their phone through Notify. Use when a task needs to tell someone something (a notification), get a human decision before continuing (approve/deny, yes/no or a typed reply), show a long job's progress on the lock screen, page whoever is on call, or manage Notify devices, inbox, web apps, teams, families, services and reply webhooks. Not for building a receiver, connector, microAuth sign-in or mini app (use notify-integrations), and not for messaging over email, SMS or chat.
license: Apache-2.0
metadata:
  compatible-cli: "0.15.0"
---

# Notify

Notify puts a message, a question or a progress bar on a person's phone and
returns their answer to you. Use the **CLI** (`notify`), the **MCP** server
(`https://notify.belweave.ai/mcp`, tools such as `notify` and `ask`; your host may
prefix the names) or **HTTP** (`https://notify.belweave.ai/api/agent`, bearer token).
They share one API, scopes and limits. Run `notify doctor` first if anything fails.

## Pick the one right call

| You want to | CLI | MCP tool | Read |
|---|---|---|---|
| Tell someone a result | `notify send "Backup finished" --title Backups` | `notify` | [messages](references/messages.md) |
| Get a decision before acting | `notify send ask "Deploy build 142?" --approval --wait --timeout 10m` | `ask`, then `interactions_wait` | [decisions](references/decisions.md) |
| Ask an open question | `notify send ask "Which region?" --text --wait --timeout 15m` | `ask` with `kind: "reply"` | [decisions](references/decisions.md) |
| Resume or stop a pending question | `notify interaction wait ID` / `notify interaction cancel ID` | `interactions_wait` / `interactions_cancel` | [decisions](references/decisions.md) |
| Show a long job's progress | `notify activity start --key job-1 ...`, `update`, `end` | `activities_start` / `_update` / `_end` | [progress](references/progress.md) |
| Wake whoever is on call | `notify page ocg_ID "API down" --dedup-key api-down` | `pages_create` | [on call](references/oncall.md) |
| Open a website in Notify | `notify apps create --name ... --url https://...` | `apps_create` | [web apps](references/web-apps.md) |
| Share with family or a team, set up services and reply webhooks | `notify families ...`, `notify teams ...`, `notify webhooks ...` | `teams_*`, `webhooks_*` | [teams and integrations](references/teams.md) |
| Sign in, check scopes or tokens | `notify auth login`, `notify auth status`, `notify doctor` | `auth_status` | [authentication](references/auth.md) |
| Understand a failure or limit | exit code and `hint:` line | `isError` result | [errors and limits](references/errors.md), [troubleshooting](references/troubleshooting.md) |

Building a receiver for answers, a connector to a private service, microAuth
sign-in, a mini app or an agent permission hook? Use the `notify-integrations` skill.

## Four rules that prevent real mistakes

1. **Need an answer? Ask; do not notify.** A notification cannot carry a reply.
   Act only on a terminal answer: `approved`, `yes` or `replied`. Treat `denied`,
   `no`, `expired`, `canceled` and a timed-out wait as "do not proceed".
2. **Always bound the wait and handle no answer.** Pass `--timeout` (CLI) or wait
   in 25-second `interactions_wait` calls (MCP). A timeout leaves the question
   pending: resume it with the same ID or cancel it; never send a second copy.
3. **Make the prompt stand alone.** Say who is asking, what exactly happens on yes,
   and what happens otherwise: "Agent Atlas: deploy build 142 (3 files) to
   production? Deny keeps build 141." Keep the action to the one that was shown.
4. **Never put secrets on a phone.** No tokens, passwords, keys, webhook URLs or
   private customer data in titles, bodies, prompts or activity text. Credentials
   come from `notify auth login` or `NOTIFY_TOKEN`, never from arguments or chat.

## Keep state and report truthfully

- Keep the IDs you get back (`int_…`, `anot_…`, activity key, `page_…`). Reuse them
  to wait, update, end, withdraw or resolve instead of creating new objects.
- Retrying the same event? Reuse its `--idempotency-key` (MCP `idempotencyKey`).
- "Accepted" means a push provider took it, not that a person saw it. Exit 7 means
  nothing was delivered; check `notify devices list`.
- Only a person can answer prompts, acknowledge pages, accept invites, approve app
  sign-in or create tokens. Never claim you did any of these.
