---
name: notify-apps
description: Register a website in Notify, manage its sharing and sign-in, or implement microAuth with optional phone-approved profile fields.
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

## Add microAuth when the website needs identity

Copy the release's whole `sdk` directory, including shared chunks, declarations, and required notices. Browser code imports `connectMicroAuth` from `browser.mjs`; server code imports `createMicroAuthServer` and `createMicroAuthBinding` from `server.mjs`.

```js
const result = await connectMicroAuth({
  challengePath: "/auth/challenge",
  sessionPath: "/auth/session",
  fields: ["name", "timeZone"],
});
```

The browser asks your server for a challenge, obtains a signed response through the native bridge, and sends it back to establish your own cookie session. `available: false` means the browser lacks the bridge; show an appropriate alternative instead of attempting to fake it.

Use the release's `examples/microauth/node-session.mjs` as the complete server integration reference. Bind a cryptographically random challenge to the initiating browser and consume it atomically in durable storage. The server verifies signature, exact issuer and audience, app ID, nonce, expiry, and replay protection. Decoding a JWT is not verification. Set secure HttpOnly session cookies and enforce request-origin checks.

Identity uses a pairwise subject. Name, email, and other profile fields are optional and may be absent after a successful sign-in. Request only fields the feature needs, handle refusal, and do not substitute one person's profile for another.

Native app storage is partitioned by account, app, origin, workspace, and server-issued storage scope. Let the host select that scope; do not use another app's cookies or bridge identity. Workspace removal revokes server access and clears known local work data when the device reconciles. It does not remotely wipe the phone, personal data, or unknown legacy storage.

For private upstream services, use [notify-connectors](../notify-connectors/SKILL.md); an ordinary microAuth session alone does not provide continuous employer-access revocation.

## Personal mini apps (tools 0.12.0)

`notify mini-apps build DIRECTORY OUTPUT` creates a deterministic archive without signing in; `validate ARCHIVE` checks it locally. Existing output files are preserved. Packages must use `format: "web"`, `runtime: "notify-web-v1"`, `commerce: "none"`, a listed HTML entry point, SHA-256 file digests, and an authenticated publisher ID. Only free personal web packages are supported; arbitrary React Native bundles and paid commerce are disabled. Physical-device runtime availability remains gated pending Apple approval.

`publish ARCHIVE` checks the authenticated account before upload. `list`, `keys`, `review`, and `export` read owner-scoped metadata; export does not download archives. `get PACKAGE_ID` reads a package and `archive PACKAGE_ID` prints its archive JSON. Package IDs are lowercase SHA-256 digests. Archive stdout is parsed JSON, not a byte-exact copy suitable for signature verification; retain the original built archive.

`offer PACKAGE_ID` sends an installation offer only to your personal account (requires `apps:write` and `notifications:send`). Installation requires review in Notify. `report`, `block`, `disable`, and `remove` each require `PACKAGE_ID --reason "..."` (1–500 characters). These are explicit server mutations; remove records a removed state. Reads require `apps:read`; publishing and controls require `apps:write`.

The browser SDK exports `notifyMini()` separately from authenticated `notifyApp()` / `window.notify`. It only detects `window.notifyMini.storage`; it performs no sign-in, storage calls, or network requests. The broker is present only in supported packaged web runtimes declaring `local-storage`:

```ts
const mini = notifyMini();
if (mini) {
  await mini.storage.set("draft", "text");
  const draft: string | null = await mini.storage.get("draft");
  await mini.storage.remove("draft");
}
```

Keys must be nonempty and at most 256 UTF-8 bytes, values at most 64 KiB, with 256 entries and a 1 MiB encoded draft quota. Missing values return null; set/remove resolve null. Storage belongs to the signed-in account and app ID; revoked, disabled, stale, or invalid documents reject. This bridge grants no authenticated website access.
