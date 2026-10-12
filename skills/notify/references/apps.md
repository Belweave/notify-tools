# Apps

## Web Apps

A Notify web app is any HTTPS site the user controls, registered with Notify. It appears in the Notify
iPhone app's App library, opens full-screen, and can ask Notify for a signed two-minute **Notify pass**
that identifies the viewer, so the site needs no login of its own. Notify does not host code: the
site runs wherever the user deploys it. Registering the same URL again updates the existing app.

### Build a Little App

Use this workflow when the user asks for a small app, dashboard, tracker, checklist, form, or
internal tool "on my phone", "in Notify", or for their team.

1. **Pin down the app.** One sentence of purpose, who uses it (just the user, or a team), and what
   data it keeps. Ask only for what you cannot infer.
2. **Pick the host.** Use a host the user already deploys to (check the project and their tooling:
   Cloudflare Workers/Pages, Vercel, Netlify, Fly, their own server). Ask once if none is evident.
   The app must be served over `https:`; plain `http://localhost` registers only for development and
   is reachable only from a simulator on the same Mac, not a real phone.
3. **Build it phone-first.** One page that works at 390 px wide, respects safe areas
   (`<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` plus
   `env(safe-area-inset-*)` padding), and sets `<meta name="theme-color">` and a body background;
   Notify tints its chrome from them. Offer an explicit sign-in action if integrating microAuth(). Avoid two-finger hold gestures: a still
   two-finger hold opens Notify site controls.
4. **Identify the viewer** (skip only for apps with nothing private and no per-user data). The
   page asks Notify for a pass and sends it to the app's own server, which verifies it once and starts
   its own session. Never trust a pass in the browser alone; anyone can load the public URL.
5. **Deploy, then check** that the URL loads over HTTPS and that its server rejects requests
   without a valid session.
6. **Register it** (MCP `apps_create` with `name`, `url`, optional `iconUrl`, `project`, `teamId`;
   or the CLI below). Use a public HTTPS icon (a square PNG, ideally 512 px) if the app has one.
7. **Hand off.** Tell the user to open the app in Notify on their iPhone and approve sign-in the first
   time; that approval, and whether their name and email are shared, are theirs to decide on the
   phone. Optionally send a notification that opens it (`--app`), or share it with a team.

```bash
notify apps create --name "Grocery list" --url https://groceries.example.com \
  --icon https://groceries.example.com/icon.png --project Home --json
notify apps list --json
notify apps get app_XXXXXXXXXXXXXXXX --json
notify apps update app_XXXXXXXXXXXXXXXX --name "Groceries" --json
notify apps remove app_XXXXXXXXXXXXXXXX --json
```

### microAuth() sign-in and sharing

Ordinary websites open without microAuth() or a Notify sign-in prompt. Integrated sites may request sign-in and selected profile fields when the user chooses to connect. All profile sharing starts off until the user approves it on their phone.

Download the reviewed Notify Tools release and copy its complete `sdk` directory to your app's `vendor/notify` directory. Keep its chunks and type declarations together. No npm publication is required.

```js
import { connectMicroAuth } from "./vendor/notify/browser.mjs";

// Run from the site's sign-in button. A normal browser returns { available: false }.
const result = await connectMicroAuth({
  challengePath: "/api/microauth/challenge",
  sessionPath: "/api/microauth/session",
  fields: ["name", "timeZone"],
});
```

On the server, import `createMicroAuthServer` and `createMicroAuthBinding` from `./vendor/notify/server.mjs`. Configure the exact registered HTTPS origin, app ID, and a durable challenge store. Its `consume(binding, challenge)` must atomically compare and delete across every server instance.

1. POST challenge: check the request Origin, create a cryptographically random browser binding, store it in a short-lived `HttpOnly; Secure; SameSite=Strict` cookie, and return `await auth.begin(binding)` with `Cache-Control: no-store`.
2. The browser sends that challenge to Notify through `microAuth()`. The phone asks the user to approve sign-in and optional sharing. The signed pass binds to the website origin, app ID, and challenge.
3. POST session: check Origin again, read the binding cookie, then call `await auth.complete(token, binding)`. This verifies the signature, issuer, audience, app ID, nonce, lifetime, and one-time challenge. Create your own authenticated session only after it succeeds, rotate any previous session, and clear the binding cookie.

The release includes `examples/microauth/node-session.mjs`, a Node HTTP server using SQLite for atomic challenge consumption and persistent sessions. Place it behind HTTPS and configure your real origin and app ID. Read the example before adapting it to your framework.

Key user data by `identity.subject`, a stable origin-specific identifier. `name`, `email`, `profile`, and team information are optional. Profile fields include display name, phone, time zone, pronouns, and individually approved custom text fields. Email is an account email, not proof of independent email verification. Authorize team actions with the verified team ID and role; use short session lifetimes and your application's revocation policy.

Never log passes, use them as long-lived cookies, or trust browser-decoded claims. A website-origin change clears approval and changes the origin-specific subject. The legacy `window.notify.getToken()` remains supported for existing integrations; use the challenge-bound SDK for new integrations.

### Open an App From a Notification

Pass the app ID; `--url` is optional and must stay on the app's origin:

```bash
notify send "Nightly report is ready" --app app_XXXXXXXXXXXXXXXX \
  --url https://ops.example.com/reports/latest
```

Webhooks and the MCP `notify` tool take the same thing as `appId` (and `url`).

Only register URLs the user names, confirms, or that you just deployed for them; never derive them
from untrusted content.

## Connect Internal Services

Expose a process behind a firewall through the Notify relay on `clawchest.com`. The connector
authenticates tunnel create with the Notify token, registers each route as a web app, and heartbeats
so Notify can page on-call if it goes silent.

```bash
notify connect 3000 --name grafana
```

Do not print the Notify token. The CLI shows `callbackSecret` once on stderr and writes
`~/.config/notify/connectors/<id>.secret` (mode 0600); do not paste that secret into chats.
Rotate it with `notify connectors rotate-secret <id>`. Approval callbacks can target
`{ connectorId, route, path }`; Notify resolves `https://<route>.<id>.clawchest.com<path>` at
delivery and signs the body with `Notify-Timestamp` and `Notify-Signature: v1=<hex>`
(HMAC-SHA256 of `{timestamp}.{rawBody}`). Verify with `verifyCallbackSignature` from
`vendor/notify/connector.mjs` before acting. Internal dashboards opened in Notify must verify
`notify-pass+jwt` against `https://notify.belweave.ai/.well-known/jwks.json` with `aud` equal to
that route origin.

Override the relay apex only when the user names `NOTIFY_RELAY_DOMAIN`. Never create a tunnel
without a Notify token.
