---
name: notify-workspaces
description: Manage Notify families and teams, share apps, select device groups, and operate on-call rotations and pages.
---

# Use the intended workspace

List existing teams or families before choosing one. Preserve the distinction between a family and an organization; use the corresponding CLI command or the live MCP schema. Membership, roles, and IDs are authoritative server state, not facts inferred from a person's email address.

Common organization workflows use `teams_list`, `teams_get`, `teams_invite`, `teams_set_role`, and `teams_remove_member`; CLI equivalents are under `notify teams`. Invitations return a join link that a signed-in person accepts. Send or share that link only as requested. Role changes and removals must identify the specific member and team.

Team apps use [notify-apps](../notify-apps/SKILL.md). Group targeting uses `groups_list` / `notify groups list --team <team_id>`. Current group members and organization admins/owners may target a group; membership in the broader team alone does not grant access to every group's devices.

## On-call work

Inspect `oncall_me`, `oncall_list`, and the relevant rotation before changing it. Rotation creation needs members, period, handoff time, and timezone. Resolve ambiguous local times before applying a schedule; retain the returned rotation ID. Overrides have explicit start and end timestamps.

```sh
notify page oncall_SELECTED_ID "API error rate is above threshold" --body "Investigate the current incident." --dedup-key "incident-42"
notify pages get page_RETURNED_ID
notify pages resolve page_RETURNED_ID --note "Error rate recovered after rollback."
```

MCP equivalents are `pages_create`, `pages_get`, and `pages_resolve`. Repeated alerts for the same incident reuse the deduplication key. A person acknowledges or escalates a page on the phone or website; agents may raise, inspect, and resolve it, not impersonate acknowledgement.

## Organization controls

Domain verification requires the returned DNS TXT proof. Do not mark a domain verified from its name alone. Auto-join requires a verified domain and owner authority. Retention settings apply to organization-targeted data, not every personal notification.

Employer audit data covers supported work events such as app launches, invitations, roles, and connector access changes. Launch events are client reports, not proof of attention. Device routing APIs expose some membership/device metadata; do not promise zero employer visibility. Notify is not an MDM and does not provide a whole-device wipe or attest passcode compliance.

Removal stops new work access on the server. Local cleanup occurs when a device reconciles; an offline phone cannot confirm deletion. Preserve personal app data and disclose that limit when it matters to the requested operation.
