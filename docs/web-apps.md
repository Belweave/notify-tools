# Web apps, microAuth and mini apps

Reference for website owners. Task guides: [web apps](../skills/notify/references/web-apps.md), [microAuth](../skills/notify-integrations/references/microauth.md), [mini apps](../skills/notify-integrations/references/mini-apps.md).

## Distribute a public website client


Registrations are private by default. The owner of a personal registration can
allow any signed-in Notify user to open its stable app ID:

```sh
notify apps update app_REGISTERED_ID --public-client --json
notify apps update app_REGISTERED_ID --private-client --json
```

Share `belweave-notify://web/app_REGISTERED_ID`. Notify iOS 1.5.9 adds deliberate
public opens to each viewer's library. Keep the website verifier pinned to this
same app ID and origin; viewers should not register separate copies. Everyone
approves sign-in independently and can decline optional profile details.

This grants launch/sign-in eligibility, not publisher management, team access,
or public-directory discovery. Disable public mode before moving the app into a
team. Disabling resets consent and storage generations and blocks future
nonowner passes. Already delivered passes expire within two minutes; the website
must manage its own established sessions. Each user can revoke their own consent
in Notify. This setting does not change packaged Mini Apps or establish Android
microAuth support.

## Add microAuth() to a website


Ordinary websites open in Notify without integration. microAuth() lets a participating site ask the user to sign in and share selected profile fields from their phone.

Clerk authenticates the Notify account underneath this flow. microAuth() still asks for phone consent and returns a Notify app pass signed with the app's existing signing keys; its audience, requested profile fields, challenge binding, and verification contract are unchanged. It is separate from generic Clerk website login.

Copy the release's **whole `sdk` directory** to your app's `vendor/notify` directory, retaining its chunks and declarations. Keep the release's license and third-party notices with redistributed files.

```js
// Browser module
import { connectMicroAuth } from "./vendor/notify/browser.mjs";

const result = await connectMicroAuth({
  challengePath: "/auth/challenge",
  sessionPath: "/auth/session",
  fields: ["name", "timeZone"],
});
// result.available is false in browsers without the Notify bridge.
```

```js
// Server module
import { createMicroAuthServer, createMicroAuthBinding } from "./vendor/notify/server.mjs";

const auth = createMicroAuthServer({
  origin: "https://dashboard.example.com",
  appId: "app_YOUR_REGISTERED_APP",
  store: yourDurableChallengeStore,
});
```

The server creates a random cookie-bound challenge and verifies the signed reply before establishing its own session. Challenge consumption must be atomic across server instances. Validate request origins and use secure, HttpOnly cookies. The [complete Node/SQLite example](../examples/microauth/node-session.mjs) includes those routes, persistent sessions, and one-time challenge consumption. [Integration guidance](../skills/notify-integrations/references/microauth.md) explains optional sharing and the legacy bridge.

The SDK exports separate browser and server modules. Its browser module has no Node or third-party runtime dependencies. Server verification includes ES256 signature, issuer, exact audience, app ID, nonce, expiration, and replay checks. Personal fields are optional and are shared only after phone approval.

## Personal mini apps (tools 0.12.1)


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
