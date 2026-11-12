# Errors and limits

## CLI exit codes

| Exit | Meaning | Next step |
|---|---|---|
| 0 | Success, or an `approved` / `yes` / `replied` answer | Continue |
| 1 | API or unexpected error | Read the message and `hint:` line |
| 2 | Usage error | `notify <command> --help` shows usage and an example |
| 3 | Not signed in, token revoked or expired, or a scope or role is missing | `notify auth login` (with the `--scope` named in the hint) |
| 4 | No answer: wait timed out, prompt expired or canceled | Resume with `notify interaction wait ID`, or stop |
| 5 | Answer was `denied` or `no` | Stop and report |
| 6 | Network: Notify could not be reached | Check the network and `NOTIFY_API_URL`; `notify doctor` |
| 7 | Nothing delivered: no phone accepted or queued it | `notify devices list`; the person may need to open Notify |
| 130 | Ctrl-C during a wait | The prompt is still pending |

With `--json`, a failure prints one JSON object on stderr and nothing on stdout:

```json
{"ok": false, "exitCode": 3, "error": {"type": "auth", "message": "Insufficient scope", "status": 403, "required": ["events:read"], "hint": "Grant the missing scope: notify auth login --scope events:read (repeat --scope for every scope you still need)."}}
```

`type` is one of `usage`, `auth`, `api`, `network`, `timeout`, `denied`,
`interrupted`, `error`. Error text never contains a token or webhook URL.

## HTTP status codes

| Status | Meaning |
|---|---|
| 400 | Invalid field; `issues` lists them |
| 401 | Missing, unknown, revoked or expired token |
| 403 | Missing scope (`required` lists it) or not allowed for your role |
| 404 | Not found for this account (other accounts' objects are hidden as 404) |
| 409 | Idempotency-Key reused with different content, or a stale `ifSequence` |
| 429 | Rate limited; wait and retry the same request |
| 502 / 503 | Temporary; retry with the same Idempotency-Key |

MCP tools return the same message as a tool error (`isError: true`).

## Limits

- Personal and family use is free: unlimited notifications and devices. Rate
  limits: 300 notifications per service per minute, 1,500 per account per minute.
  `notify billing` is authoritative.
- Notification body: 8,000 characters and 16 KiB of UTF-8; title 80; summary 500.
- Prompt: 2,000 characters (240 for a Live Activity prompt); expiry 30 seconds to
  24 hours (8 hours for a Live Activity); default 15 minutes.
- Device list per send: 1 to 50 IDs. Page title 120, body 2,000.
- MCP waits: at most 25 seconds per `ask` or `interactions_wait` call.
- Live Activity high-priority updates: 4 per minute and 20 per hour per activity;
  fresh starts are paced to one per phone per 60 seconds.
- Reply webhooks: up to 25 per account. Design files: 16 KiB.
