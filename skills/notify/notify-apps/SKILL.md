---
name: notify-apps
description: Register Notify websites, add optional microAuth or phone capabilities, and build free personal packaged Mini Apps.
---

# Put a website in Notify

A normal HTTPS website can open in Notify without a special SDK. Discover existing apps first, then create or update the intended one:

```sh
notify apps list --json
notify apps create --name "Release dashboard" --url https://dashboard.example.com --json
notify send "Your dashboard is ready" --app app_REGISTERED_ID
```

MCP equivalents are `apps_list`, `apps_create`, `apps_update`, and `apps_get`. Creating an existing URL updates its registration. Save the returned app ID. A registration does not grant the website profile access; each person decides sign-in and optional sharing on their phone.

Team sharing is explicit through `apps_share` / `notify apps share <id> --team <team_id>`. `--personal` moves it back. Sign-in revocation uses `apps_revoke`; removal uses `apps_remove`. A move to a new origin requires fresh consent. Check the resulting state after such changes.

## Optional capabilities

- For website identity, sessions, profile consent, or phone features, read [microAuth and device features](references/microauth.md).
- For local free personal web archives, publishing, installation offers, controls, or isolated draft storage, read [Mini Apps](references/mini-apps.md). Physical-device runtime remains gated pending Apple approval.

Website registration, microAuth, packaged Mini Apps, and an internal-service connector are distinct capabilities. A site needs no SDK to open in Notify. Add only what its feature requires.
