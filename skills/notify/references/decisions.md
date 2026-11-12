# Decisions: ask, wait, resume, cancel

Ask when later work depends on a person's answer. There are three kinds:

| Kind | CLI flag | API `kind` | Terminal statuses |
|---|---|---|---|
| Permission for a named action | `--approval` | `approval` | `approved`, `denied` |
| Binary question | `--yes-no` | `yes_no` | `yes`, `no` |
| Typed answer | `--text` | `reply` | `replied` (answer in `response`) |

Every prompt can also end `expired` (default 15 minutes, `--expires-in` 30s to 24h)
or `canceled`. Notify has no multiple-choice prompt: for a few options, ask a
`--text` question that lists them and check the reply, or ask one `--yes-no`.

## CLI: ask and branch on the exit code

```sh
notify send ask "Release bot: deploy build 142 (3 files) to production? Deny keeps build 141." \
  --approval --title "Production deploy" --idempotency-key deploy-142 --wait --timeout 10m
```

| Exit | Meaning | Do |
|---|---|---|
| 0 | `approved`, `yes` or `replied` | Proceed with exactly what was shown |
| 5 | `denied` or `no` | Stop; report that the person declined |
| 4 | Wait timed out, or prompt `expired` / `canceled` | Do not proceed; resume or cancel |
| 7 | No phone accepted or queued the push | Check `notify devices list`; do not wait |
| 130 | You pressed Ctrl-C | The prompt is still pending; resume later |

```sh
if notify send ask "Rotate the staging database password now?" --yes-no --wait --timeout 5m > answer.json; then
  ./rotate-staging-password.sh
else
  echo "Not rotating: $(jq -r .interaction.status answer.json)" >&2
fi
```

A typed reply is in `interaction.response`:

```sh
notify send ask "Which customer account should receive the March report?" --text --wait --timeout 15m --json \
  | jq -r '.interaction.response'
```

Read the prompt from a file or another command with `-`:

```sh
printf 'Merge PR 88 into main?\nCI is green; 2 approvals.' | notify send ask - --approval --wait --timeout 10m
```

### Resume, inspect or cancel

`--wait` without a timeout waits until the prompt expires. A timed-out wait
does not end the prompt. Keep `interaction.id` and continue:

```sh
notify interaction wait int_RETURNED_ID --timeout 10m
notify interaction get int_RETURNED_ID
notify interaction cancel int_RETURNED_ID
notify interaction list
```

`interaction get` exits 0 while pending: read `interaction.status`, not the exit code.
Use `--poll` (waits at most 20 seconds) when you only want to catch an instant answer.

### Live Activity prompts (iOS lock screen and Dynamic Island)

For approval or yes/no, `--live-activity` shows an interactive card on iOS 17+
(Android gets an ordinary actionable alert). Prompt at most 240 characters,
expiry at most 8 hours, no `--text`, `--image` or `--url`:

```sh
notify send ask "Send the pickup reminder to 14 customers?" --approval --live-activity \
  --style signal --primary-label Send --secondary-label Skip --wait --timeout 15m
```

Styles: `approval`, `shell`, `verdict`, `signal`. Custom labels change the words
shown; the answer stays `approved`/`denied`. For templates see
[Live Activity design](live-activity-design.md).

### Route the answer to a receiver as well

`--webhook whk_ID` also delivers the outcome to a saved reply webhook (see
[teams and integrations](teams.md)). Building the receiver is covered by the
`notify-integrations` skill.

## MCP

`ask` creates the prompt and waits up to 25 seconds. If the result has
`timedOut: true`, call `interactions_wait` with the same ID until it is terminal
or your own deadline passes; then `interactions_cancel` if you no longer need it.

```mcp
{"tool": "ask", "arguments": {"title": "Production deploy", "prompt": "Release bot: deploy build 142 to production? Deny keeps build 141.", "kind": "approval", "expiresInSeconds": 900, "idempotencyKey": "deploy-142"}}
```

```mcp
{"tool": "interactions_wait", "arguments": {"id": "int_RETURNED_ID", "timeoutSeconds": 25}}
```

```mcp
{"tool": "interactions_cancel", "arguments": {"id": "int_RETURNED_ID"}}
```

`interactions_create` returns at once without waiting. With
`presentation: "live_activity"`, `ask` also returns at once with `queued` counts.

## HTTP

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/interactions \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: deploy-142" \
  -d '{"title":"Production deploy","prompt":"Deploy build 142 to production? Deny keeps build 141.","kind":"approval","expiresInSeconds":900}'
```

Long-poll for the answer (at most 25 seconds per call; repeat until terminal):

```sh
curl -sS "https://notify.belweave.ai/api/agent/interactions/int_RETURNED_ID/wait?timeout=25" \
  -H "Authorization: Bearer $NOTIFY_TOKEN"
```

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/interactions/int_RETURNED_ID/cancel \
  -H "Authorization: Bearer $NOTIFY_TOKEN"
```

A wait returns `{"interaction": {...}, "timedOut": false}` once terminal:

```json
{"interaction": {"id": "int_RETURNED_ID", "kind": "approval", "status": "approved", "response": "approve", "respondedAt": "2026-11-12T10:04:17.000Z"}, "timedOut": false}
```

Needs scopes `interactions:create`, `interactions:read` and `notifications:send`.
