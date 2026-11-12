# Paging and on call

A page alerts whoever is on call in an on-call group (`ocg_…`) of a workplace
team and escalates until a person acknowledges it on the phone or website.
Families cannot page. Agents can raise, read and resolve pages; only a person can
acknowledge or escalate one.

## Raise, inspect, resolve

```sh
notify page ocg_SELECTED_ID "Checkout API error rate above 5%" \
  --body "p95 latency 4.2 s since 09:12 UTC. Dashboard linked." \
  --url https://status.example.com/checkout --dedup-key checkout-errors-2026-11-12
notify pages get page_RETURNED_ID
notify pages list --team team_SELECTED_ID
notify pages resolve page_RETURNED_ID --note "Rolled back to build 141; error rate normal."
```

- Reuse the same `--dedup-key` for repeats of one incident: an open page absorbs
  them (`deduplicated: true`) instead of waking people again.
- Title up to 120 characters, body up to 2,000. No secrets.
- Exit 7: nobody was reachable. Escalate through another channel you were given.
- `notify send --oncall ocg_ID` also pages; its `--idempotency-key` is the dedup key.

Find the group first: `notify oncall list --team team_SELECTED_ID` lists groups
with current and upcoming shifts; `notify oncall me` shows your own shifts.

## Rotations (admin or owner)

```sh
notify oncall create --team team_SELECTED_ID --name "Platform" --members user_A,user_B,user_C \
  --period weekly --handoff 09:00 --timezone Europe/London --escalation 10:next,30:group
notify oncall update ocg_SELECTED_ID --members user_A,user_C --escalation 15:group
notify oncall override ocg_SELECTED_ID --user user_B --starts-at 2026-12-24T09:00:00Z --ends-at 2026-12-26T09:00:00Z
notify oncall remove-override ocg_SELECTED_ID ovr_RETURNED_ID
notify oncall delete ocg_SELECTED_ID
```

`--escalation` takes up to five `MINUTES:next|group` steps: `next` pages the next
person in the rotation, `group` pages everyone. `--no-escalation` clears it.
Resolve ambiguous local times with the person before you change a schedule.

## MCP

```mcp
{"tool": "pages_create", "arguments": {"groupId": "ocg_SELECTED_ID", "title": "Checkout API error rate above 5%", "body": "p95 latency 4.2 s since 09:12 UTC.", "dedupKey": "checkout-errors-2026-11-12"}}
```

```mcp
{"tool": "pages_resolve", "arguments": {"pageId": "page_RETURNED_ID", "note": "Rolled back to build 141."}}
```

Also `pages_get`, `pages_list` (`teamId`), `oncall_me`, `oncall_list`,
`oncall_create`, `oncall_update`, `oncall_delete`, `oncall_override_add`,
`oncall_override_remove`.

## HTTP

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/oncall/ocg_SELECTED_ID/pages \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Checkout API error rate above 5%","body":"p95 latency 4.2 s since 09:12 UTC.","dedupKey":"checkout-errors-2026-11-12"}'
```

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/pages/page_RETURNED_ID/resolve \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"note":"Rolled back to build 141."}'
```

Scopes: `oncall:write` to page, resolve and edit rotations; `oncall:read` to read.
