// SPDX-License-Identifier: Apache-2.0
/**
 * The command reference: one entry per command, with its arguments, accepted
 * flags and a working example. It drives `--help`, shell completion and the
 * test that keeps the agent skills in step with the CLI.
 */

/** Flags every command accepts. */
export const GLOBAL_FLAGS = ["json", "help"];

const SEND_FLAGS = ["title", "image", "url", "device", "project", "summary", "markdown",
  "body-format", "app", "oncall", "group", "idempotency-key", "stdin"];
const ASK_FLAGS = ["approval", "yes-no", "text", "title", "image", "url", "device", "group",
  "webhook", "expires-in", "live-activity", "style", "design-file", "primary-label",
  "secondary-label", "accent-color", "idempotency-key", "stdin", "wait", "timeout", "poll"];
const ACTIVITY_START_FLAGS = ["title", "status", "key", "subtitle", "detail", "progress", "symbol",
  "privacy", "style", "accent-color", "design-file", "device", "group", "expires-in",
  "stale-after", "replace", "idempotency-key", "stdin"];
const ACTIVITY_UPDATE_FLAGS = ["key", "priority", "title", "status", "subtitle", "clear-subtitle",
  "detail", "progress", "symbol", "privacy", "style", "accent-color", "design-file",
  "clear-design", "stale-after", "if-sequence", "idempotency-key", "stdin"];
const ACTIVITY_END_FLAGS = ["key", "status", "subtitle", "clear-subtitle", "detail", "progress",
  "symbol", "accent-color", "dismiss-after", "if-sequence", "idempotency-key", "stdin"];
const WEBHOOK_FLAGS = ["name", "url", "preset", "events", "enabled", "disabled", "default",
  "no-default", "stdin"];
const ROTATION_FLAGS = ["name", "members", "period", "handoff", "timezone", "starts-at",
  "escalation", "stdin"];

/** @type {{path: string, args?: string, flags?: string[], summary: string, example: string}[]} */
export const COMMANDS = [
  // Start here
  { path: "auth login", args: "", flags: ["client-name", "scope", "expires-in", "timeout", "open", "no-open"],
    summary: "Sign in through the browser and save a scoped API key (mode 0600).",
    example: "notify auth login" },
  { path: "auth status", summary: "Show the signed-in account, token scopes and expiry.",
    example: "notify auth status" },
  { path: "auth logout", summary: "Revoke this CLI's token and remove the saved credentials.",
    example: "notify auth logout" },
  { path: "doctor", summary: "Check Node, sign-in, scopes, devices and API reachability without printing secrets.",
    example: "notify doctor" },
  { path: "version", summary: "Print the Notify Tools version.", example: "notify version" },

  // Tell someone
  { path: "send", args: "<body|->", flags: SEND_FLAGS,
    summary: "Send a one-shot notification. Use - to read the body from stdin.",
    example: 'notify send "Nightly backup finished" --title "Backups"' },
  { path: "send withdraw", args: "<notification_id>",
    summary: "Remove an earlier notification from the phones and mark it read.",
    example: "notify send withdraw anot_RETURNED_ID" },

  // Ask someone
  { path: "send ask", args: "<prompt|->", flags: ASK_FLAGS,
    summary: "Ask for approval, yes/no or a written reply; --wait blocks for the answer.",
    example: 'notify send ask "Deploy build 142 to production?" --approval --wait --timeout 10m' },
  { path: "interaction list", summary: "List the account's pending prompts.",
    example: "notify interaction list" },
  { path: "interaction get", args: "<interaction_id>", summary: "Read a prompt and its answer.",
    example: "notify interaction get int_RETURNED_ID" },
  { path: "interaction wait", args: "<interaction_id>", flags: ["timeout"],
    summary: "Resume waiting for an answer (default 60s).",
    example: "notify interaction wait int_RETURNED_ID --timeout 10m" },
  { path: "interaction cancel", args: "<interaction_id>",
    summary: "Cancel a pending prompt this token created.",
    example: "notify interaction cancel int_RETURNED_ID" },

  // Show progress
  { path: "activity start", flags: ACTIVITY_START_FLAGS,
    summary: "Start a Live Activity (iOS) or progress notification (Android).",
    example: 'notify activity start --key release-142 --title "Release 142" --status "Building" --progress 0.1' },
  { path: "activity update", args: "<id|key>", flags: ACTIVITY_UPDATE_FLAGS,
    summary: "Update a running activity.",
    example: 'notify activity update release-142 --status "Testing" --progress 0.6' },
  { path: "activity end", args: "<id|key>", flags: ACTIVITY_END_FLAGS,
    summary: "End an activity with its final state.",
    example: 'notify activity end release-142 --status "Released" --progress 1' },
  { path: "activity get", args: "<id|key>", flags: ["key"], summary: "Read an activity and its delivery readiness.",
    example: "notify activity get release-142" },
  { path: "activity list", flags: ["limit"], summary: "List activities started by this token.",
    example: "notify activity list --limit 20" },
  { path: "activity feed", flags: ["filter", "page"], summary: "Account history (needs events:read).",
    example: "notify activity feed --filter live_activity" },
  { path: "activity designs", summary: "List Live Activity design templates (offline).",
    example: "notify activity designs" },
  { path: "activity design", args: "<template>", summary: "Print a design configuration (offline).",
    example: "notify activity design ring > ring.json" },
  { path: "activity validate-design", args: "<file>", summary: "Validate a design file (offline).",
    example: "notify activity validate-design ring.json" },

  // Page whoever is on call
  { path: "page", args: "<oncall_group_id> <title>", flags: ["body", "url", "app", "dedup-key", "group"],
    summary: "Page an on-call group; repeats with the same --dedup-key merge.",
    example: 'notify page ocg_SELECTED_ID "API error rate above 5%" --dedup-key api-errors' },
  { path: "pages list", flags: ["team", "all", "limit", "cursor"], summary: "List a team's open (or --all) pages.",
    example: "notify pages list --team team_SELECTED_ID" },
  { path: "pages get", args: "<page_id>", summary: "Read a page.", example: "notify pages get page_RETURNED_ID" },
  { path: "pages resolve", args: "<page_id>", flags: ["note"], summary: "Resolve a page.",
    example: 'notify pages resolve page_RETURNED_ID --note "Rolled back"' },
  { path: "oncall me", summary: "Your upcoming shifts and open pages.", example: "notify oncall me" },
  { path: "oncall list", flags: ["team"], summary: "A team's on-call groups and shifts.",
    example: "notify oncall list --team team_SELECTED_ID" },
  { path: "oncall get", args: "<oncall_group_id>", summary: "Read an on-call group.",
    example: "notify oncall get ocg_SELECTED_ID" },
  { path: "oncall create", flags: ["team", ...ROTATION_FLAGS],
    summary: "Create an on-call group (admin or owner).",
    example: 'notify oncall create --team team_SELECTED_ID --name "Platform" --members user_A,user_B --period weekly --handoff 09:00 --timezone Europe/London --escalation 10:next,30:group' },
  { path: "oncall update", args: "<oncall_group_id>", flags: [...ROTATION_FLAGS, "no-escalation"],
    summary: "Change a group's name, rotation or escalation.",
    example: "notify oncall update ocg_SELECTED_ID --escalation 15:group" },
  { path: "oncall delete", args: "<oncall_group_id>", summary: "Delete an on-call group.",
    example: "notify oncall delete ocg_SELECTED_ID" },
  { path: "oncall override", args: "<oncall_group_id>", flags: ["user", "starts-at", "ends-at"],
    summary: "Put someone on call for a window.",
    example: "notify oncall override ocg_SELECTED_ID --user user_A --starts-at 2026-12-24T09:00:00Z --ends-at 2026-12-26T09:00:00Z" },
  { path: "oncall remove-override", args: "<oncall_group_id> <override_id>", summary: "Remove an override.",
    example: "notify oncall remove-override ocg_SELECTED_ID ovr_RETURNED_ID" },

  // Account and inbox
  { path: "devices list", summary: "List registered phones.", example: "notify devices list" },
  { path: "devices remove", args: "<device_id>", summary: "Remove a device; it registers again when Notify opens.",
    example: "notify devices remove dev_SELECTED_ID" },
  { path: "inbox projects", summary: "Inbox projects with unread counts.", example: "notify inbox projects" },
  { path: "inbox list", flags: ["project", "unread", "limit", "cursor"], summary: "List inbox notifications.",
    example: "notify inbox list --unread --limit 20" },
  { path: "inbox get", args: "<notification_id>", summary: "Read one notification.",
    example: "notify inbox get anot_RETURNED_ID" },
  { path: "inbox read", args: "<notification_id>", summary: "Mark a notification read.",
    example: "notify inbox read anot_RETURNED_ID" },
  { path: "inbox unread", args: "<notification_id>", summary: "Mark a notification unread.",
    example: "notify inbox unread anot_RETURNED_ID" },
  { path: "inbox read-all", flags: ["project"], summary: "Mark everything that exists now as read.",
    example: "notify inbox read-all" },
  { path: "billing", summary: "Plan, limits and usage.", example: "notify billing" },
  { path: "tokens list", summary: "List API tokens and connected clients (needs tokens:manage).",
    example: "notify tokens list" },
  { path: "tokens revoke", args: "<token_id>", summary: "Revoke a token.", example: "notify tokens revoke tok_SELECTED_ID" },
  { path: "events list", flags: ["limit"], summary: "Recent service webhook deliveries (needs events:read).",
    example: "notify events list --limit 20" },

  // Integrations
  { path: "services list", summary: "List webhook services (URLs omitted).", example: "notify services list" },
  { path: "services create", flags: ["title", "image", "url", "reply-webhook", "stdin"],
    summary: "Create a webhook service; its URL is returned once.",
    example: 'notify services create --title "Warehouse desk" --json > service.json' },
  { path: "services get", args: "<service_id>", summary: "Read a service.", example: "notify services get svc_SELECTED_ID" },
  { path: "services update", args: "<service_id>", flags: ["title", "image", "url", "reply-webhook", "no-reply-webhook", "stdin"],
    summary: "Update a service's defaults.", example: 'notify services update svc_SELECTED_ID --title "Warehouse"' },
  { path: "services rotate", args: "<service_id>", summary: "Rotate the webhook URL; the new URL is returned once.",
    example: "notify services rotate svc_SELECTED_ID" },
  { path: "services remove", args: "<service_id>", summary: "Delete a service.", example: "notify services remove svc_SELECTED_ID" },
  { path: "services share", args: "<service_id>", flags: ["family", "personal"],
    summary: "Share a service with a family, or make it personal again.",
    example: "notify services share svc_SELECTED_ID --family team_FAMILY_ID" },
  { path: "webhooks list", summary: "List reply webhooks.", example: "notify webhooks list" },
  { path: "webhooks create", flags: WEBHOOK_FLAGS,
    summary: "Save an HTTPS endpoint for answers; the signing secret is returned once.",
    example: 'notify webhooks create --name "Answers" --url https://hooks.example.com/notify --events interaction.answered,interaction.expired --default' },
  { path: "webhooks get", args: "<webhook_id>", summary: "Read a webhook and its recent deliveries.",
    example: "notify webhooks get whk_SELECTED_ID" },
  { path: "webhooks update", args: "<webhook_id>", flags: WEBHOOK_FLAGS, summary: "Update a webhook.",
    example: "notify webhooks update whk_SELECTED_ID --disabled" },
  { path: "webhooks test", args: "<webhook_id>", summary: "Queue a signed sample delivery.",
    example: "notify webhooks test whk_SELECTED_ID" },
  { path: "webhooks rotate-secret", args: "<webhook_id>", summary: "Rotate the signing secret (returned once).",
    example: "notify webhooks rotate-secret whk_SELECTED_ID" },
  { path: "webhooks remove", args: "<webhook_id>", summary: "Delete a webhook.", example: "notify webhooks remove whk_SELECTED_ID" },
  { path: "permissions setup", args: "<claude|codex|opencode|all>",
    summary: "Route an agent's permission requests to your phone.", example: "notify permissions setup claude" },
  { path: "permissions uninstall", args: "<claude|codex|opencode|all>", summary: "Remove a permission integration.",
    example: "notify permissions uninstall claude" },
  { path: "permissions doctor", summary: "Check permission integrations.", example: "notify permissions doctor" },
  { path: "permissions help", summary: "Show permission integration help.", example: "notify permissions help" },
  { path: "skills install", flags: ["agent", "dir", "dry-run"],
    summary: "Install or update the Notify agent skills for Claude Code, Codex, OpenCode or a directory.",
    example: "notify skills install --agent claude" },
  { path: "skills uninstall", flags: ["agent", "dir", "dry-run"], summary: "Remove skills this CLI installed.",
    example: "notify skills uninstall --agent claude" },
  { path: "skills status", flags: ["agent", "dir"], summary: "Show installed skill versions.",
    example: "notify skills status" },
  { path: "completion", args: "<bash|zsh>", summary: "Print a shell completion script.",
    example: 'eval "$(notify completion zsh)"' },

  // Web apps
  { path: "apps list", summary: "List web apps.", example: "notify apps list --json" },
  { path: "apps create", flags: ["name", "url", "icon", "project", "team"],
    summary: "Register an HTTPS site to open in Notify (an existing URL is updated).",
    example: 'notify apps create --name "Release dashboard" --url https://dashboard.example.com --json' },
  { path: "apps get", args: "<app_id>", summary: "Read a web app.", example: "notify apps get app_SELECTED_ID --json" },
  { path: "apps update", args: "<app_id>", flags: ["name", "url", "icon", "no-icon", "project", "no-project", "public-client", "private-client"],
    summary: "Update app metadata or public sign-in eligibility.",
    example: 'notify apps update app_SELECTED_ID --name "Releases" --json' },
  { path: "apps revoke", args: "<app_id>", summary: "Revoke your sign-in consent for an app.",
    example: "notify apps revoke app_SELECTED_ID" },
  { path: "apps remove", args: "<app_id>", summary: "Remove a web app.", example: "notify apps remove app_SELECTED_ID" },
  { path: "apps share", args: "<app_id>", flags: ["team", "personal", "no-notify"],
    summary: "Move an app into a team or family, or back to personal.",
    example: "notify apps share app_SELECTED_ID --team team_SELECTED_ID --json" },
  { path: "mini-apps build", args: "<directory> <output-archive>", summary: "Build a deterministic package (offline).",
    example: "notify mini-apps build ./my-app my-app.json" },
  { path: "mini-apps validate", args: "<archive>", summary: "Validate a package (offline).",
    example: "notify mini-apps validate my-app.json" },
  { path: "mini-apps publish", args: "<archive>", summary: "Publish a free personal package.",
    example: "notify mini-apps publish my-app.json" },
  { path: "mini-apps list", summary: "List installable personal packages.", example: "notify mini-apps list" },
  { path: "mini-apps keys", summary: "Package signing keys.", example: "notify mini-apps keys" },
  { path: "mini-apps review", summary: "Review private package metadata.", example: "notify mini-apps review" },
  { path: "mini-apps export", summary: "Export package metadata.", example: "notify mini-apps export" },
  { path: "mini-apps get", args: "<package_id>", summary: "Read a package.", example: "notify mini-apps get PACKAGE_ID" },
  { path: "mini-apps archive", args: "<package_id>", flags: ["output"],
    summary: "Download the exact archive bytes (--output FILE) or print its JSON.",
    example: "notify mini-apps archive PACKAGE_ID --output my-app.json" },
  { path: "mini-apps offer", args: "<package_id>", summary: "Offer a package to your own phone.",
    example: "notify mini-apps offer PACKAGE_ID" },
  { path: "mini-apps report", args: "<package_id>", flags: ["reason"], summary: "Report a package.",
    example: 'notify mini-apps report PACKAGE_ID --reason "Broken layout"' },
  { path: "mini-apps block", args: "<package_id>", flags: ["reason"], summary: "Block a package.",
    example: 'notify mini-apps block PACKAGE_ID --reason "Superseded"' },
  { path: "mini-apps disable", args: "<package_id>", flags: ["reason"], summary: "Disable a package.",
    example: 'notify mini-apps disable PACKAGE_ID --reason "Pausing"' },
  { path: "mini-apps remove", args: "<package_id>", flags: ["reason"], summary: "Remove a package.",
    example: 'notify mini-apps remove PACKAGE_ID --reason "Retired"' },

  // Internal services
  { path: "connect", args: "<port>", flags: ["name", "host", "team", "proxy-protocol"],
    summary: "Publish a local HTTP service to your phone through the Notify relay (runs until Ctrl-C).",
    example: "notify connect 3000 --name dashboard" },
  { path: "connectors list", summary: "List connectors.", example: "notify connectors list" },
  { path: "connectors get", args: "<connector_id>", summary: "Read a connector, its routes and status.",
    example: "notify connectors get conn_SELECTED_ID" },
  { path: "connectors update", args: "<connector_id>", flags: ["name", "enabled", "disabled", "oncall", "no-oncall"],
    summary: "Rename, enable/disable, or set the on-call group paged when it goes offline.",
    example: "notify connectors update conn_SELECTED_ID --disabled" },
  { path: "connectors remove", args: "<connector_id>", summary: "Remove a connector.",
    example: "notify connectors remove conn_SELECTED_ID" },
  { path: "connectors rotate-secret", args: "<connector_id>",
    summary: "Rotate the callback signing secret and save it privately.",
    example: "notify connectors rotate-secret conn_SELECTED_ID" },

  // Teams and families
  { path: "families list", summary: "List your families.", example: "notify families list" },
  { path: "families create", args: "<name>", summary: "Create a family (free).", example: 'notify families create "Chen household"' },
  { path: "families get", args: "<family_id>", summary: "Read a family.", example: "notify families get team_FAMILY_ID" },
  { path: "families members", args: "<family_id>", summary: "List members.", example: "notify families members team_FAMILY_ID" },
  { path: "families rename", args: "<family_id> <name>", summary: "Rename a family.", example: 'notify families rename team_FAMILY_ID "Chens"' },
  { path: "families delete", args: "<family_id>", summary: "Delete a family.", example: "notify families delete team_FAMILY_ID" },
  { path: "families leave", args: "<family_id>", summary: "Leave a family.", example: "notify families leave team_FAMILY_ID" },
  { path: "families invite", args: "<family_id>", flags: ["email"], summary: "Create a join link (returned once).",
    example: "notify families invite team_FAMILY_ID --email maya@example.com" },
  { path: "families invites", args: "<family_id>", summary: "List invites.", example: "notify families invites team_FAMILY_ID" },
  { path: "families revoke-invite", args: "<family_id> <invite_id>", summary: "Revoke an invite.",
    example: "notify families revoke-invite team_FAMILY_ID tinv_SELECTED_ID" },
  { path: "families remove-member", args: "<family_id> <user_id>", summary: "Remove a member.",
    example: "notify families remove-member team_FAMILY_ID user_SELECTED_ID" },
  { path: "teams list", summary: "List teams and families you belong to.", example: "notify teams list" },
  { path: "teams create", args: "<name>", summary: "Create a workplace team (currently unavailable; use families create).",
    example: 'notify families create "Chen household"' },
  { path: "teams get", args: "<team_id>", summary: "Read a team and its members.", example: "notify teams get team_SELECTED_ID" },
  { path: "teams members", args: "<team_id>", summary: "List members.", example: "notify teams members team_SELECTED_ID" },
  { path: "teams rename", args: "<team_id> <name>", summary: "Rename a team.", example: 'notify teams rename team_SELECTED_ID "Platform"' },
  { path: "teams update", args: "<team_id>", flags: ["name", "domain", "no-domain", "auto-join", "no-auto-join", "retention", "no-retention"],
    summary: "Change name, domain, auto-join or retention.", example: "notify teams update team_SELECTED_ID --retention 90" },
  { path: "teams delete", args: "<team_id>", summary: "Delete a team (owner).", example: "notify teams delete team_SELECTED_ID" },
  { path: "teams leave", args: "<team_id>", summary: "Leave a team.", example: "notify teams leave team_SELECTED_ID" },
  { path: "teams role", args: "<team_id> <user_id> <owner|admin|member>", summary: "Change a member's role.",
    example: "notify teams role team_SELECTED_ID user_SELECTED_ID admin" },
  { path: "teams remove-member", args: "<team_id> <user_id>", summary: "Remove a member.",
    example: "notify teams remove-member team_SELECTED_ID user_SELECTED_ID" },
  { path: "teams invite", args: "<team_id>", flags: ["email", "domain", "role"], summary: "Create a 7-day join link (returned once).",
    example: "notify teams invite team_SELECTED_ID --email maya@example.com --role member" },
  { path: "teams invites", args: "<team_id>", summary: "List invites.", example: "notify teams invites team_SELECTED_ID" },
  { path: "teams revoke-invite", args: "<team_id> <invite_id>", summary: "Revoke an invite.",
    example: "notify teams revoke-invite team_SELECTED_ID tinv_SELECTED_ID" },
  { path: "teams domain", args: "<team_id> <domain>", summary: "Request a DNS TXT challenge (owner).",
    example: "notify teams domain team_SELECTED_ID example.com" },
  { path: "teams verify-domain", args: "<team_id>", summary: "Verify the DNS TXT record.",
    example: "notify teams verify-domain team_SELECTED_ID" },
  { path: "teams apps", args: "<team_id>", summary: "List the team's shared apps.", example: "notify teams apps team_SELECTED_ID" },
  { path: "teams devices", args: "<team_id>", summary: "Devices of team members (admin or owner).",
    example: "notify teams devices team_SELECTED_ID" },
  { path: "teams audit", args: "<team_id>", flags: ["action", "actor", "from", "to", "cursor", "limit", "format"],
    summary: "Read the audit log (admin or owner); --format csv prints CSV.",
    example: "notify teams audit team_SELECTED_ID --from 2026-11-01T00:00:00Z --limit 100" },
  { path: "groups list", flags: ["team"], summary: "List device groups.", example: "notify groups list --team team_SELECTED_ID" },
  { path: "groups create", flags: ["team", "name", "members", "devices"], summary: "Create a device group.",
    example: 'notify groups create --team team_SELECTED_ID --name "Night shift" --members user_A,user_B' },
  { path: "groups get", args: "<group_id>", flags: ["team"], summary: "Read a device group.",
    example: "notify groups get dgrp_SELECTED_ID --team team_SELECTED_ID" },
  { path: "groups update", args: "<group_id>", flags: ["team", "name", "members", "devices"], summary: "Update a device group.",
    example: "notify groups update dgrp_SELECTED_ID --team team_SELECTED_ID --members user_A" },
  { path: "groups delete", args: "<group_id>", flags: ["team"], summary: "Delete a device group.",
    example: "notify groups delete dgrp_SELECTED_ID --team team_SELECTED_ID" },
];

/** Command groups accepted as alternative spellings. */
export const ALIASES = { interactions: "interaction", activities: "activity", notify: "send", help: "help" };

const GROUP_TITLES = [
  ["Start here", ["auth", "doctor", "version"]],
  ["Tell, ask, show progress", ["send", "interaction", "activity"]],
  ["Page whoever is on call", ["page", "pages", "oncall"]],
  ["Account", ["devices", "inbox", "billing", "tokens", "events"]],
  ["Integrations", ["services", "webhooks", "permissions", "skills", "completion"]],
  ["Web apps and services", ["apps", "mini-apps", "connect", "connectors"]],
  ["Teams and families", ["families", "teams", "groups"]],
];

export function findCommand(positionals) {
  const [group, action] = positionals;
  const canonical = ALIASES[group] ?? group;
  if (canonical === "send" && ["ask", "withdraw"].includes(action)) {
    return COMMANDS.find((entry) => entry.path === `send ${action}`);
  }
  return (
    COMMANDS.find((entry) => entry.path === `${canonical} ${action}`) ??
    COMMANDS.find((entry) => entry.path === canonical)
  );
}

export function commandGroups() {
  return [...new Set(COMMANDS.map((entry) => entry.path.split(" ")[0]))];
}

function usageLine(entry) {
  const flags = (entry.flags ?? []).map((flag) => `--${flag}`).join(" ");
  return `notify ${entry.path}${entry.args ? ` ${entry.args}` : ""}${flags ? ` [${flags}]` : ""}`;
}

function entryHelp(entry) {
  return `${usageLine(entry)}\n  ${entry.summary}\n  Example: ${entry.example}`;
}

/** Help for one command or one group; undefined when nothing matches. */
export function commandHelp(positionals) {
  const [group, action] = positionals;
  const canonical = ALIASES[group] ?? group;
  const exact = action ? COMMANDS.find((entry) => entry.path === `${canonical} ${action}`) : undefined;
  if (exact) return entryHelp(exact);
  const entries = COMMANDS.filter(
    (entry) => entry.path === canonical || entry.path.startsWith(`${canonical} `),
  );
  if (entries.length === 0) return undefined;
  return `${entries.map(entryHelp).join("\n\n")}\n\nAdd --json for machine-readable output. Exit codes: notify help exit-codes.`;
}

export const EXIT_CODES = `Exit codes:
  0    success, or an approved / yes / replied answer
  1    API or unexpected error
  2    usage error (unknown command, missing or invalid flag)
  3    authentication or permission: sign in again or grant the missing scope
  4    no answer: wait timed out, or the prompt expired or was canceled
  5    the answer was deny / no
  6    network error: Notify could not be reached
  7    nothing was delivered: no device accepted or queued it
  130  interrupted (Ctrl-C) while waiting; the prompt stays pending`;

export function overview() {
  const sections = GROUP_TITLES.map(([title, groups]) => {
    const lines = COMMANDS.filter((entry) => groups.includes(entry.path.split(" ")[0])).map(
      (entry) => `  ${usageLine(entry)}`,
    );
    return `${title}:\n${lines.join("\n")}`;
  });
  return `Notify: reach a person on their phone from scripts and agents.

Common jobs:
  notify auth login                                   sign in once (browser)
  notify send "Build 142 passed" --title CI           tell someone
  notify send ask "Deploy build 142?" --approval --wait --timeout 10m
                                                      ask and wait; exit 0 only on approve
  notify activity start --key job-1 --title "Import" --status "Running" --progress 0
  notify doctor                                       check setup without printing secrets

${sections.join("\n\n")}

Global flags: --json (stable JSON on stdout; errors as JSON on stderr), --help.
Help for one command: notify <command> --help, for example notify send ask --help.

send sends a one-shot push; send ask sends a push that asks for an answer. A first
positional of exactly "ask" or "withdraw" selects that subcommand; "notify send -- ask"
sends the literal word. --wait blocks until an answer or --timeout; --poll waits at
most 20 seconds. A timed-out wait never cancels the prompt: resume with
notify interaction wait <id>, or cancel it with notify interaction cancel <id>.
Bodies hold up to 8,000 characters (16 KiB of UTF-8); asks up to 2,000.

Writes that create something (send, send ask, activity start/update/end) carry an
Idempotency-Key. Pass --idempotency-key to make a retry of the same event safe across
runs; without it the CLI generates one and reuses it when retrying a network failure.

page alerts whoever is on call and escalates until a person acknowledges on the phone
or website. Agents can raise, read and resolve pages; acknowledging, answering prompts,
accepting invites, approving app sign-in and creating tokens are human-only.

Default logins exclude events:read (activity feed, events list) and tokens:manage
(tokens list/revoke); request them with --scope. Personal and family use is free with
per-minute rate limits (300/service, 1,500/account); notify billing is authoritative.

Live Activity designs are strict version-1 JSON (activity design, validate-design,
--design-file); files are capped at 16 KiB. Mini-app build and validate run offline.

${EXIT_CODES}

Authentication: notify auth login, or NOTIFY_TOKEN for CI (NOTIFY_API_URL overrides the
API base). Tokens are never accepted as command arguments and are never printed.`;
}

/** All flags any command accepts, for completion. */
export function flagsFor(path) {
  const entry = COMMANDS.find((candidate) => candidate.path === path);
  return [...new Set([...(entry?.flags ?? []), ...GLOBAL_FLAGS])];
}

export function completionScript(shell) {
  const groups = commandGroups();
  const actions = Object.fromEntries(
    groups.map((group) => [
      group,
      COMMANDS.filter((entry) => entry.path.startsWith(`${group} `)).map((entry) => entry.path.split(" ")[1]),
    ]),
  );
  const flagCases = COMMANDS.map(
    (entry) => `    "${entry.path}") flags="${flagsFor(entry.path).map((flag) => `--${flag}`).join(" ")}" ;;`,
  ).join("\n");
  const actionCases = groups
    .filter((group) => actions[group].length > 0)
    .map((group) => `    ${group}) words="${actions[group].join(" ")}" ;;`)
    .join("\n");
  const body = `_notify_complete() {
  local cur="\${COMP_WORDS[COMP_CWORD]}" group="\${COMP_WORDS[1]}" action="\${COMP_WORDS[2]}" words="" flags=""
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${groups.join(" ")} --help --json" -- "$cur") ); return
  fi
  if [ "$COMP_CWORD" -eq 2 ] && [[ "$cur" != --* ]]; then
    case "$group" in
${actionCases}
    esac
    COMPREPLY=( $(compgen -W "$words" -- "$cur") ); return
  fi
  case "$group $action" in
${flagCases}
    *) case "$group" in
${COMMANDS.filter((entry) => !entry.path.includes(" ")).map((entry) => `      "${entry.path}") flags="${flagsFor(entry.path).map((flag) => `--${flag}`).join(" ")}" ;;`).join("\n")}
       esac ;;
  esac
  COMPREPLY=( $(compgen -W "$flags" -- "$cur") )
}
complete -F _notify_complete notify`;
  if (shell === "bash") return body;
  if (shell === "zsh") return `autoload -U +X bashcompinit && bashcompinit\n${body}`;
  return undefined;
}
