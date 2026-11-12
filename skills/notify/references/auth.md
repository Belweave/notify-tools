# Authentication and tokens

## CLI sign-in

```sh
notify auth login
notify auth status
notify doctor
```

`auth login` prints a short code and opens the browser (when attached to a
terminal; `--no-open` never opens it). The person signs in, checks the requested
scopes and approves. The CLI then saves a scoped API key with mode 0600 in its
configuration file (macOS `~/Library/Application Support/notify/config.json`,
Linux `~/.config/notify/config.json`, or `NOTIFY_CONFIG`). Nothing is printed.

Request only what the job needs, or add the two scopes the default omits:

```sh
notify auth login --scope notifications:send --scope interactions:create --scope interactions:read --client-name "release-bot" --expires-in 30d
notify auth login --scope events:read --scope tokens:manage
```

Each `--scope` replaces the default set, so list every scope you still need.

| Scope | Allows |
|---|---|
| `notifications:send` | send, withdraw, and every prompt |
| `interactions:create`, `interactions:read` | create, cancel, read and wait for prompts |
| `activities:read`, `activities:write` | Live Activities |
| `devices:read`, `devices:write` | list and remove phones |
| `inbox:read`, `inbox:write` | inbox |
| `apps:read`, `apps:write` | web apps and mini apps |
| `services:read`, `services:write` | services and reply webhooks |
| `teams:read`, `teams:write` | teams, families, groups |
| `oncall:read`, `oncall:write` | rotations and pages |
| `connectors:read`, `connectors:write` | connectors |
| `billing:read` | plan and limits |
| `events:read` (not default) | activity feed, `events list` |
| `tokens:manage` (not default) | `tokens list`, `tokens revoke` |

## CI and scripts

Set `NOTIFY_TOKEN` from the CI secret store (and `NOTIFY_API_URL` only for a
non-production server). Tokens are never accepted as command arguments and the
CLI never prints them. A token cannot create other tokens or widen its scopes;
new tokens always need a signed-in person (`notify auth login` or the dashboard).

## Tokens and sign-out

```sh
notify tokens list
notify tokens revoke tok_SELECTED_ID
notify auth logout
```

Revoking stops every caller using that token, including connected MCP clients
(`kind: "oauth"`). `auth logout` revokes this CLI's own token and deletes the file.
Do not sign out or revoke to fix an unrelated error.

## MCP clients

Add `https://notify.belweave.ai/mcp` as a remote (Streamable HTTP) MCP server and
let the client follow the OAuth discovery metadata; the person approves the
scopes in the browser. For Claude Code:

```sh
claude mcp add --transport http notify https://notify.belweave.ai/mcp
```

A client that only supports a bearer header can use a scoped Notify API key as
`Authorization: Bearer <key>`, stored in the client's secret settings. Do not hard
code OAuth endpoints or guess callback URLs. An `Insufficient scope` tool error
means the person must reconnect and grant that scope.

```mcp
{"tool": "auth_status", "arguments": {}}
```

## HTTP

```sh
curl -sS https://notify.belweave.ai/api/agent/auth/status -H "Authorization: Bearer $NOTIFY_TOKEN"
```

Agent accounts: an agent can have its own Notify account; see the production
guide at https://notify.belweave.ai/auth.md. Its own account cannot reach a
person's phone until that person joins a shared family or team.
