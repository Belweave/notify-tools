# Messages: send, organise, withdraw

Send a notification when the person only needs to know something. If you need
an answer, ask instead ([decisions](decisions.md)).

## CLI

```sh
notify send "Nightly backup finished: 412 GB in 38 minutes." --title "Backups" --idempotency-key backup-2026-11-12
```

- `--title` names the sender (default "Notify"); the body is up to 8,000 characters.
- For long reports put a short banner in `--summary` and the detail in the body;
  `--markdown` records that the body is Markdown.
- `--project "Website"` files it under an inbox project.
- `--url https://...` opens a page when tapped; `--app app_ID` opens a registered
  web app (the URL must then be on that app's origin).
- `--device dev_ID` (repeatable) or `--group dgrp_ID` narrows the phones; the
  default is every active phone on the account. Do not pick devices by list order.
- Pipe a body in with `-`; send the literal words "ask" or "withdraw" with `--`:

```sh
./summarise-test-run.sh | notify send - --title "Test report" --project "CI" --summary "312 passed, 2 flaky"
notify send -- ask
```

The result holds `notification.id` (`anot_…`) and delivery counts. Exit 7 means no
phone accepted or queued it.

### Withdraw and inbox

```sh
notify send withdraw anot_RETURNED_ID
notify inbox list --unread --limit 20
notify inbox get anot_RETURNED_ID
notify inbox read anot_RETURNED_ID
notify inbox read-all --project unfiled
notify inbox projects
```

Withdraw removes the banner from phones and marks it read; it cannot undo what a
person already saw. Mark items read only when that is part of the task.

## MCP

```mcp
{"tool": "notify", "arguments": {"title": "Backups", "body": "Nightly backup finished: 412 GB in 38 minutes.", "project": "Ops", "idempotencyKey": "backup-2026-11-12"}}
```

```mcp
{"tool": "notification_withdraw", "arguments": {"id": "anot_RETURNED_ID"}}
```

Inbox tools: `inbox_list`, `inbox_get`, `inbox_read`, `inbox_unread`,
`inbox_read_all`, `inbox_projects`.

## HTTP

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/notifications \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: backup-2026-11-12" \
  -d '{"title":"Backups","body":"Nightly backup finished: 412 GB in 38 minutes.","project":"Ops"}'
```

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/notifications/anot_RETURNED_ID/withdraw \
  -H "Authorization: Bearer $NOTIFY_TOKEN"
```

```sh
curl -sS "https://notify.belweave.ai/api/agent/inbox/notifications?unread=1&limit=20" \
  -H "Authorization: Bearer $NOTIFY_TOKEN"
```

A system with no Notify token can send through a service webhook URL instead:
`POST https://notify.belweave.ai/hooks/<service token>` with `{"body": "..."}`.
That URL is a credential: create it with `notify services create` and keep it in
the sender's secret store ([teams and integrations](teams.md)).

Scopes: `notifications:send` to send and withdraw; `inbox:read` / `inbox:write`
for the inbox.
