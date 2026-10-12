# Teams

## Families, Existing Teams, and On-Call

Personal Notify accounts are free with unlimited notifications and unlimited
devices. Device targeting, interactive replies, callbacks, and Live Activities are included. A free
Family has one owner and up to three other members, unlimited notifications,
and unlimited devices. Create a Family with `notify families create` or MCP `teams_create` with
`kind: "family"`; only Family creation is available now. Share services, apps, and alerts with its
accepted members. Invite acceptance remains a human action.

Existing teams can still share web apps and on-call groups. Roles are `owner`, `admin`, and `member`.
Teams is TBD; new Teams and purchases are unavailable. Existing teams retain free access
without seat charges. Family capacity and administrative member limits still apply.

```bash
notify teams list
notify families create "Home"
notify teams get team_XXXX
notify teams invite team_XXXX --role member --email teammate@example.com
notify teams invites team_XXXX
notify teams members team_XXXX
notify apps share app_XXXXXXXXXXXXXXXX --team team_XXXX --json
notify apps share app_XXXXXXXXXXXXXXXX --personal --json
notify oncall create --team team_XXXX --name Primary --members user_A,user_B \
  --period weekly --handoff 09:00 --timezone America/New_York
notify oncall list --team team_XXXX
notify oncall me
notify page ocg_XXXX "API error rate above 20%" --body "5xx since 14:02" --dedup-key api-5xx
notify pages list --team team_XXXX
notify pages resolve page_XXXX --note "Rolled back"
```

- **Team apps.** To build an app for a team, follow Build a Little App, then register it with
  `teamId` (MCP `apps_create`) or create it and run `apps share --team`. Sharing notifies other
  members (`--no-notify` / `notify: false` skips that), and every member sees it on their Notify home
  screen and approves sign-in for themselves. Only the person who added an app can move it between
  teams or back to personal (`--personal`); the app's passes then carry `team_id` and `team_role`.
- `teams invite` returns a join link (`https://notify.belweave.ai/join/<code>`, single use, seven days).
  Treat it as a secret: hand it only to the user who asked. Only a signed-in person can accept it;
  never accept invites on the user's behalf.
- `page` notifies whoever is on call now, then escalates on the group's schedule until someone
  acknowledges. Acknowledging and escalating are human-only (phone or website); agents can raise,
  read, and resolve pages. Use a stable `--dedup-key` for repeating alerts so they merge into the
  open page instead of paging again. `notify "<body>" --oncall ocg_XXXX` pages too, using
  `--idempotency-key` as the dedup key. Page bodies are at most 2,000 characters.
- Page only when the user asked for paging or configured an alert that should wake someone; a page
  is an interruption, not a log line.
- `teams delete`, `teams remove-member`, `teams role ... owner`, and `oncall` changes affect other
  people. Run them only when the user names the exact team, person, or group.
- Webhooks page by adding `"oncall": "ocg_XXXX"` to the JSON body (not with `deviceIds` or
  `response`); the service owner must belong to the group's team.
