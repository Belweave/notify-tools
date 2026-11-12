# Troubleshooting

Start with one command. It checks Node, credentials, API reachability, scopes,
token expiry, registered phones and installed skills, and never prints a token:

```sh
notify doctor
notify doctor --json
```

| Symptom | Likely cause | Do |
|---|---|---|
| Exit 3 "No token configured" | Not signed in on this machine | `notify auth login`, or set `NOTIFY_TOKEN` in CI |
| Exit 3 "Insufficient scope" | Token lacks a scope | `notify auth login --scope <scope> ...` with every scope you need |
| Exit 3 "Refusing insecure config permissions" | Config file readable by others | `chmod 600` the file named in the message |
| Exit 7 or `accepted: 0` | No registered phone, or notifications are off | `notify devices list`; the person opens Notify, signs in to the same account and allows notifications |
| Accepted but no banner | Focus mode, notification settings, or an offline phone | Accepted is not seen; check the phone's settings. Do not resend repeatedly |
| Wait exits 4 quickly | `--timeout` too short, or the prompt expired | `notify interaction get ID`; resume with `notify interaction wait ID` |
| HTTP 409 (exit 1) on retry | Same `--idempotency-key` with different content | Use a new key for a new event |
| Exit 6 | Network, proxy or wrong `NOTIFY_API_URL` | Unset `NOTIFY_API_URL` for production; check connectivity |
| `teams create` fails | New workplace teams are unavailable | `notify families create NAME`, or use an existing team |
| Unsupported Node.js | Old or odd-numbered Node | Install Node 22.23.4+, 24.22.1+ or 26.12.1+ |

## A Live Activity does not appear

1. `notify activity get KEY` and read `readiness`. `starting` means Apple accepted
   the start but the phone has not confirmed yet; wait about 90 seconds.
2. `start_not_confirmed` or `update_token_delayed`: ask the person to open Notify
   and check Settings > Notify > Live Activities. Starts are paced to one per phone
   per minute; do not retry with new keys.
3. A design template that fails: try one plain `--style standard` start without
   `--design-file` as the control.
4. The in-app inbox card is not lock-screen evidence. Always end the activity.

## MCP specifics

- `ask` returned `timedOut: true`: call `interactions_wait` with the same
  `interaction.id`. Do not call `ask` again.
- Tool names may carry a host prefix such as `mcp__notify__ask`; match on the end.
- "Insufficient scope": the person reconnects the MCP client and grants it.

Still stuck: run `notify doctor --json` and share that output (it contains no secrets).
