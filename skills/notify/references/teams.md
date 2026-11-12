# Teams and integrations

## Families and teams

A **family** is free: an owner and up to three other people share services and
apps. A **workplace team** adds roles, device groups, on-call rotations, domains
and an audit log. New workplace teams cannot be created at the moment; existing
teams keep working. Both use `team_…` IDs.

```sh
notify teams list
notify families create "Chen household"
notify families invite team_FAMILY_ID --email maya@example.com
notify teams invite team_SELECTED_ID --email maya@example.com --role member
notify teams members team_SELECTED_ID
notify teams role team_SELECTED_ID user_SELECTED_ID admin
notify teams remove-member team_SELECTED_ID user_SELECTED_ID
```

An invite returns a join link once. Give it only to the intended person; only
they can accept it, signed in. Knowing someone's email does not connect accounts.

Team administration (admin or owner):

```sh
notify teams apps team_SELECTED_ID
notify teams devices team_SELECTED_ID
notify teams audit team_SELECTED_ID --from 2026-11-01T00:00:00Z --limit 100
notify teams audit team_SELECTED_ID --format csv > audit.csv
notify teams update team_SELECTED_ID --retention 90
notify teams domain team_SELECTED_ID example.com
notify teams verify-domain team_SELECTED_ID
notify groups create --team team_SELECTED_ID --name "Night shift" --members user_A,user_B
```

Domain verification needs the DNS TXT record the `domain` command returns;
never call a domain verified from its name. Auto-join (`--auto-join`) needs a
verified domain and the owner. Device groups (`dgrp_…`) narrow `send`, `send ask`
and `activity start` with `--group`; group members and team admins may target one.

## Services: a webhook URL for systems without a token

A service gives another system a URL that sends notifications with a fixed title
and image. The URL is a credential and is shown once.

```sh
notify services create --title "Warehouse desk" --url https://warehouse.example.com/pickups --json > service.json
notify services list
notify services rotate svc_SELECTED_ID
notify services share svc_SELECTED_ID --family team_FAMILY_ID
```

Store `webhookUrl` in the sender's secret store; never print or commit it.
Rotating invalidates the old URL immediately.

## Reply webhooks: answers delivered to your endpoint

A reply webhook receives `interaction.answered`, `interaction.expired` and
`interaction.canceled` events, signed with a secret shown once.

```sh
notify webhooks create --name "Answers" --url https://hooks.example.com/notify \
  --events interaction.answered,interaction.expired,interaction.canceled --default
notify webhooks test whk_RETURNED_ID
notify webhooks get whk_RETURNED_ID
notify webhooks rotate-secret whk_RETURNED_ID
```

`--default` sends every prompt's outcome there, including MCP and API prompts
without a service; `send ask --webhook whk_ID` selects it for one prompt;
`services update svc_ID --reply-webhook whk_ID` makes it a service's default.
Presets: `generic` (default), `grok`, `slack`. Pass custom header values through
`--stdin` JSON, never as arguments. Create the endpoint only when the receiver can
verify signatures; how to build one is in the `notify-integrations` skill.

## Agent permission hooks

`notify permissions setup claude|codex|opencode` routes that agent's permission
requests to the phone; `notify permissions doctor` checks it. Setting up and
diagnosing these is covered by the `notify-integrations` skill.

## MCP

```mcp
{"tool": "teams_invite", "arguments": {"teamId": "team_SELECTED_ID", "email": "maya@example.com", "role": "member"}}
```

```mcp
{"tool": "webhooks_create", "arguments": {"name": "Answers", "url": "https://hooks.example.com/notify", "events": ["interaction.answered", "interaction.expired"], "isDefault": true}}
```

Also `teams_*`, `groups_*`, `services_*` and `webhooks_*` for every command above.

## HTTP

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/teams \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Chen household","kind":"family"}'
```

```sh
curl -sS -X POST https://notify.belweave.ai/api/agent/webhooks \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Answers","url":"https://hooks.example.com/notify","events":["interaction.answered"],"isDefault":true}'
```

Scopes: `teams:read` / `teams:write`; services and reply webhooks use
`services:read` / `services:write`.
