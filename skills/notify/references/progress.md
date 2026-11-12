# Progress: Live Activities and progress notifications

Show a long job on the phone: an iOS Live Activity (lock screen and Dynamic
Island) or an ongoing progress notification on Android. Start once with a stable
key, update at meaningful milestones, and always end it, on success or failure.

## CLI

```sh
notify activity start --key release-142 --title "Release 142" --status "Building" \
  --progress 0.1 --symbol hammer --stale-after 30m --idempotency-key release-142-start
notify activity update release-142 --status "Running tests" --subtitle "312 of 520" --progress 0.6
notify activity update release-142 --status "Ready to ship" --progress 0.9 --priority high
notify activity end release-142 --status "Released" --progress 1 --dismiss-after 15m
```

On failure, end it with what happened and what to do next:

```sh
notify activity end release-142 --status "Tests failed" --detail "2 failures in checkout; see CI run 9912"
```

- `--key` names the job; later commands accept the key or the returned ID.
- Use a real `--progress` between 0 and 1 only when you can measure it; otherwise
  send a truthful `--status` and omit progress.
- `--style standard|ring|hero|terminal|steps`, `--accent-color '#RRGGBB'` and
  `--symbol` (an SF Symbol name) change the look; templates are in
  [Live Activity design](live-activity-design.md).
- `--privacy private` hides content on a locked screen. Never show secrets.
- `--priority high` asks for a visible milestone update (4 per minute and 20 per
  hour per activity; beyond that Notify quietly uses normal priority). Routine
  updates are coalesced: update on milestones, not every second.
- `--if-sequence N` rejects an update if someone else updated since you read it.
- `--replace` starts over on the same key; `--clear-subtitle` removes a subtitle.

Inspect what the phone has: `notify activity get release-142`, `notify activity list`.

## Read the result truthfully

The response has `accepted`, `queued` and, on newer servers, `readiness`.
On iOS a start can be accepted by Apple and still be `starting` while Notify waits
for the phone's update token. Fresh starts are paced to at least 60 seconds apart
per phone: do not retry with new keys. `start_not_confirmed` or
`update_token_delayed` after about 90 seconds means the phone has not confirmed;
ask the person to open Notify, and still end the activity when the job ends.
See [troubleshooting](troubleshooting.md) for a missing Live Activity.

## MCP

```mcp
{"tool": "activities_start", "arguments": {"key": "release-142", "title": "Release 142", "status": "Building", "progress": 0.1, "idempotencyKey": "release-142-start"}}
```

```mcp
{"tool": "activities_update", "arguments": {"activity": "release-142", "status": "Running tests", "progress": 0.6}}
```

```mcp
{"tool": "activities_end", "arguments": {"activity": "release-142", "status": "Released", "progress": 1}}
```

## HTTP

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/activities \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: release-142-start" \
  -d '{"key":"release-142","title":"Release 142","status":"Building","progress":0.1}'
```

```sh
curl -sS -X PATCH https://notify.belweave.ai/api/agent/activities/release-142 \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Running tests","progress":0.6,"priority":"normal"}'
```

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/activities/release-142/end \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"Released","progress":1,"dismissAfterSeconds":900}'
```

Each write accepts an `Idempotency-Key`; reuse a key only for an identical write.
Scopes: `activities:write` (and `activities:read` to read).
