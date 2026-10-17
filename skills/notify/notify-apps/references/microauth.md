# Optional microAuth and device features


Copy the release's whole `sdk` directory, including shared chunks, declarations, and required notices. Browser code imports `connectMicroAuth` from `browser.mjs`; server code imports `createMicroAuthServer` and `createMicroAuthBinding` from `server.mjs`.

```js
const result = await connectMicroAuth({
  challengePath: "/auth/challenge",
  sessionPath: "/auth/session",
  fields: ["name", "timeZone"],
});
```

The browser asks your server for a challenge, obtains a signed response through the native bridge, and sends it back to establish your own cookie session. `available: false` means the browser lacks the bridge; show an appropriate alternative instead of attempting to fake it.

Use the release's `examples/microauth/node-session.mjs` as the complete server integration reference. Bind a cryptographically random challenge to the initiating browser and consume it atomically in durable storage. The server verifies ES256 signature, protected JWT type, exact issuer and HTTPS audience, app ID, nonce, expiry, and replay protection. Decoding a JWT is not verification. Set secure HttpOnly session cookies and enforce request-origin checks.

Identity uses a pairwise subject. Name, email, and other profile fields are optional and may be absent after a successful sign-in. Request only fields the feature needs, handle refusal, and do not substitute one person's profile for another.

Native app storage is partitioned by account, app, origin, workspace, and server-issued storage scope. Let the host select that scope; do not use another app's cookies or bridge identity. Workspace removal revokes server access and clears known local work data when the device reconciles. It does not remotely wipe the phone, personal data, or unknown legacy storage.

For private upstream services, use [notify-connectors](../../notify-connectors/SKILL.md); an ordinary microAuth session alone does not provide continuous employer-access revocation.


Supported fields are `name`, `email`, `phone`, `timeZone`, `pronouns`, `custom`. Every new choice starts off; custom details are approved individually. Use `(issuer, subject)` for identity, check app ID, and apply your own authorization. Email and profile text are not identity attestations; never auto-link accounts by email. Challenges and passes last at most two minutes, including consent time. Revocation prevents future passes; your website must terminate its own sessions and delete its own retained data when appropriate. There is no background profile sync.

Feature-detect `notifyApp()` methods `capabilities`, `haptics`, `share`, `openSettings`, and `close` before use. OS and per-app phone permissions are separate from microAuth consent; ask for a device capability when the feature needs it. Do not require it merely to browse. The current microAuth integration targets iOS bridge v3; Android support is deferred. Legacy `getToken()` lacks a browser-bound challenge and is not a verifier substitute.

The current iOS host also exposes `authenticate`, `authenticateChallenge`, `dictate`, `speech.start/stop`, and bridge event listeners; these extend the narrow public SDK type and must be feature-detected on `window.notify`. Use browser media/file/geolocation APIs for the hosted web experience rather than inventing SDK camera methods. `navigator.geolocation` is permission-scoped by the host. The native permission categories are camera, microphone, location, motion, photos, files, downloads, haptics, authenticate, speech, and share; each has ask/allow/block state scoped to account, app, and origin. An available method or `mediaCaptureEnabled` is not a permission grant. Handle cancellation, blocked/denied access, document changes, and ordinary-browser fallback. Authentication verifies a local device action; apply server verification and authorization for any sensitive remote operation.
