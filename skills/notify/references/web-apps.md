# Web apps in Notify

Any HTTPS site can open full screen inside Notify. Registering it gives it an app
ID (`app_…`) that notifications and pages can open, and that teams can share.
No SDK is needed to open a site; sign-in with microAuth, packaged mini apps and
connectors to private services are optional and covered by the
`notify-integrations` skill.

## CLI

```sh
notify apps list --json
notify apps create --name "Release dashboard" --url https://dashboard.example.com --json
notify send "Release 142 is live" --title "Releases" --app app_RETURNED_ID
notify apps update app_RETURNED_ID --name "Releases" --json
notify apps share app_RETURNED_ID --team team_SELECTED_ID --json
notify apps share app_RETURNED_ID --personal --json
notify apps revoke app_RETURNED_ID
notify apps remove app_RETURNED_ID
```

- `apps create` with a URL that is already registered updates that app; check
  `created` in the JSON. Look for an existing app before creating one.
- `apps` commands print one readable line per app; add `--json` for JSON.
- Moving an app to a new origin asks every user to approve sign-in again.
- `apps revoke` removes your own sign-in consent for the app; it does not delete it.
- `--public-client` lets any signed-in Notify user open the same app ID and approve
  sign-in for themselves (personal registrations only); `--private-client` turns
  it off. It does not list the app publicly or grant management rights.
- Share link for a public client: `belweave-notify://web/app_RETURNED_ID`.

## MCP

```mcp
{"tool": "apps_create", "arguments": {"name": "Release dashboard", "url": "https://dashboard.example.com"}}
```

```mcp
{"tool": "apps_share", "arguments": {"appId": "app_RETURNED_ID", "teamId": "team_SELECTED_ID"}}
```

Also `apps_list`, `apps_get`, `apps_update`, `apps_revoke`, `apps_remove`,
`teams_apps`.

## HTTP

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/apps \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Release dashboard","url":"https://dashboard.example.com"}'
```

```sh
curl -sS -X PATCH https://notify.belweave.ai/api/agent/apps/app_RETURNED_ID \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"publicClient":true}'
```

Scopes: `apps:read`, `apps:write`; sharing into a team also needs `teams:write`.
Only the person decides, on the phone, whether to sign in to an app and what
profile details to share.
