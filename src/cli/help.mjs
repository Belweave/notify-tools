// SPDX-License-Identifier: Apache-2.0
import { POLL_TIMEOUT_SECONDS } from "./foundation/results.mjs";

export function help() {
  return `Usage:
  notify auth login [--client-name <name>] [--scope <scope>] [--expires-in <duration>]
                     [--timeout <duration>] [--open|--no-open] [--json]
  notify auth logout
  notify auth status
  notify send <body> [--title <name>] [--image <url>] [--url <url>] [--device <id>]
               [--project <name>] [--summary <text>] [--markdown | --body-format <text|markdown>]
               [--app <app_id>] [--oncall <group_id>] [--group <dgrp_id>] [--idempotency-key <key>] [--stdin]
  notify send ask <prompt> (--approval|--yes-no|--text) [--title <name>] [--image <url>]
                [--url <url>] [--device <id>] [--group <dgrp_id>] [--webhook <whk_id>] [--expires-in <duration>]
                [--live-activity [--style <approval|shell|verdict|signal>]
                                 [--primary-label <label>] [--secondary-label <label>]]
                [--idempotency-key <key>] [--stdin] [--wait [--timeout <duration>] | --poll]
  notify send withdraw <notification_id>
  notify interaction list
  notify interaction get <id>
  notify interaction wait <id> [--timeout <duration>]
  notify activity start --title <title> --status <status> [--key <key>] [--subtitle <text>] [--detail <text>]
                         [--progress <0..1>] [--symbol <symbol>] [--privacy <standard|private>]
                         [--style <standard|ring|hero|terminal|steps>] [--accent-color <#RRGGBB>]
                         [--device <id>...] [--group <dgrp_id>] [--expires-in <duration>] [--stale-after <duration>]
                         [--replace] [--idempotency-key <key>] [--stdin]
  notify activity update <id|key> [--priority normal|high] [--title <title>] [--status <status>] [--subtitle <text>|--clear-subtitle] [--detail <text>]
                            [--progress <0..1>] [--symbol <symbol>] [--privacy <standard|private>]
                            [--style <standard|ring|hero|terminal|steps>] [--accent-color <#RRGGBB>]
                            [--stale-after <duration>] [--if-sequence <n>]
                            [--idempotency-key <key>] [--stdin]
  notify activity end <id|key> [--status <status>] [--subtitle <text>|--clear-subtitle] [--detail <text>] [--progress <0..1>]
                         [--symbol <symbol>] [--accent-color <#RRGGBB>]
                         [--dismiss-after <duration>] [--if-sequence <n>]
                         [--idempotency-key <key>] [--stdin]
  notify activity get <id|key>
  notify activity list [--limit <n>]
  notify activity feed [--filter <all|notification|live_activity|response>] [--page <n>]
  notify permissions setup [claude|codex|opencode|all]
  notify permissions uninstall [claude|codex|opencode|all]
  notify permissions doctor
  notify devices list
  notify devices remove <device_id>
  notify services share <service_id> (--family <family_id> | --personal)
  notify services list
  notify services create --title <title> [--image <url>] [--url <url>] [--reply-webhook <whk_id>] [--stdin]
  notify services get <service_id>
  notify services update <service_id> [--title <title>] [--image <url>] [--url <url>]
                         [--reply-webhook <whk_id> | --no-reply-webhook] [--stdin]
  notify services rotate <service_id>
  notify services remove <service_id>
  notify webhooks list
  notify webhooks create --name <name> --url <https_url> [--preset <generic|grok|slack>]
                         [--enabled | --disabled] [--stdin]
  notify webhooks get <whk_id>
  notify webhooks update <whk_id> [--name <name>] [--url <https_url>]
                         [--preset <generic|grok|slack>] [--enabled | --disabled] [--stdin]
  notify webhooks test <whk_id>
  notify webhooks rotate-secret <whk_id>
  notify webhooks remove <whk_id>
  notify inbox projects
  notify inbox list [--project <project_id|unfiled>] [--unread] [--limit <n>] [--cursor <c>]
  notify inbox get <notification_id>
  notify inbox read <notification_id>
  notify inbox unread <notification_id>
  notify inbox read-all [--project <project_id|unfiled>]
  notify apps create --name <name> --url <url> [--icon <url>] [--project <name>]
                      [--team <team_id>] [--json]
  notify apps list [--json]
  notify apps get <app_id> [--json]
  notify apps update <app_id> [--name <name>] [--url <url>] [--icon <url> | --no-icon]
                      [--project <name> | --no-project] [--json]
  notify apps revoke <app_id> [--json]
  notify apps remove <app_id> [--json]
  notify apps share <app_id> (--team <team_id> | --personal) [--no-notify] [--json]
  notify families list
  notify families create <name>
  notify families get|members|delete|leave <family_id>
  notify families rename <family_id> <name>
  notify families invite <family_id> [--email <email>]
  notify families invites <family_id>
  notify families revoke-invite <family_id> <invite_id>
  notify families remove-member <family_id> <user_id>
  notify teams list
  notify teams create <name>
  notify teams get <team_id>
  notify teams rename <team_id> <name>
  notify teams delete <team_id>
  notify teams leave <team_id>
  notify teams members <team_id>
  notify teams role <team_id> <user_id> <owner|admin|member>
  notify teams remove-member <team_id> <user_id>
  notify teams invite <team_id> [--email <email>] [--domain <domain>] [--role <member|admin>]
  notify teams invites <team_id>
  notify teams revoke-invite <team_id> <invite_id>
  notify teams domain <team_id> <domain>
  notify teams verify-domain <team_id>
  notify teams update <team_id> [--name <name>] [--no-domain]
                       [--auto-join | --no-auto-join] [--retention <7|30|90|365> | --no-retention]
  notify groups list --team <team_id>
  notify groups create --team <team_id> --name <name> [--members <user_id,...>] [--devices <dev_id,...>]
  notify groups get --team <team_id> <group_id>
  notify groups update --team <team_id> <group_id> [--name <name>] [--members <user_id,...>] [--devices <dev_id,...>]
  notify groups delete --team <team_id> <group_id>
  notify oncall list --team <team_id>
  notify oncall me
  notify oncall get <group_id>
  notify oncall create --team <team_id> --name <name> --members <user_id,...>
                        [--period <daily|weekly>] [--handoff <HH:MM>] [--timezone <zone>]
                        [--starts-at <iso>] [--stdin]
  notify oncall update <group_id> [--name <name>] [--members <user_id,...>] [--period <p>]
                        [--handoff <HH:MM>] [--timezone <zone>] [--starts-at <iso>] [--stdin]
  notify oncall override <group_id> --user <user_id> --starts-at <iso> --ends-at <iso>
  notify oncall remove-override <group_id> <override_id>
  notify page <group_id> <title> [--body <text>] [--url <url>] [--app <app_id>]
                [--dedup-key <key>] [--group <dgrp_id>]
  notify pages list --team <team_id> [--all] [--limit <n>] [--cursor <c>]
  notify pages get <page_id>
  notify pages resolve <page_id> [--note <text>]
  notify connect <port> --name <name> [--host <host>] [--team <team_id>] [--proxy-protocol v1|v2]
  notify connectors rotate-secret <connector_id>
  notify billing
  notify tokens list
  notify tokens revoke <token_id>

send sends a one-shot push; send ask sends a push that elicits an answer.
Inside send, a first positional of exactly "ask" selects the subcommand. Everything
after a bare "--" is treated as positional, so "notify send -- ask" sends the
literal body "ask". --wait blocks until the answer or timeout; --poll waits at most
${POLL_TIMEOUT_SECONDS} seconds to catch an instant answer. A timed-out poll or wait does
not end the prompt: it stays answerable on the phone until it expires, and
notify interaction wait <id> resumes waiting at any time.

notify bodies can hold up to 8,000 characters (16 KiB of UTF-8). --project files the
notification into a named project in the Notify app inbox, --summary sets the short
push/preview text for a long body, and --markdown (or --body-format markdown) records
how the body should eventually render. Project names are case-insensitive per account.

send withdraw removes an agent notification from your phones (a silent command) and marks
it read; "notify send -- withdraw" sends the literal body "withdraw". interaction list
shows every pending prompt on the account; agents can read prompts but only a human on the
phone can answer them. inbox read-all marks only notifications that existed when it ran.

apps registers a web app (an HTTPS site you control) that opens full-screen in the Notify
iPhone app, which hands the page a short-lived signed Notify pass. Creating an app with an
existing URL updates it. notify send --app <app_id> opens that app when tapped; --url must
then be on the app's origin.

apps update changes metadata only; sharing and sign-in approval are decided on the phone,
and moving an app to a new origin asks for approval again. apps revoke signs the app out.

webhooks saves HTTPS endpoints for prompt replies. --stdin accepts headers and event
subscriptions as JSON; keep credential header values out of shell arguments. Create and
rotate-secret return a signingSecret once. Store it securely to verify deliveries.
send ask --webhook selects an endpoint; services --reply-webhook sets its default.

teams share apps, device groups, and on-call rotations with other Notify users. Inviting returns a join link;
only a signed-in person can accept it. apps share --team moves an app you added into a
team (every member then approves sign-in on their own phone); --personal moves it back.

teams domain asks the owner to prove an email domain with a DNS TXT record at
_notify-verification.<domain> whose value is notify-verify=<token>. verify-domain
checks that record. --no-domain clears a pending or verified domain. Auto-join
and retention are owner-only; auto-join needs a verified domain. Retention applies
only to org-targeted sends. Targeting a device group is allowed for org admins
and owners, or current members of that group; other teammates receive 403.

page alerts whoever is on call in an on-call group, then escalates until someone
acknowledges. Acknowledging and escalating are deliberately human-only (on the phone or
the website); agents can raise, read, and resolve pages. --dedup-key (or, with
notify send --oncall, --idempotency-key) merges repeats into the open page.

Default logins exclude events:read (activity feed) and tokens:manage (tokens list/revoke);
request them with --scope. No command creates tokens: new tokens always need a signed-in
human (notify auth login).

Personal accounts are free: 300 notifications/service/minute, 1,500/account/minute,
unlimited notifications and devices. Teams: TBD; unavailable for purchase.

Authentication: run notify auth login, or set NOTIFY_TOKEN for an advanced manual setup.
Tokens are never accepted as command arguments.`;
}
