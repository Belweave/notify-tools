# Notify Tools

The command line, microAuth() SDK, service connector, and coding-agent integrations for [Notify](https://notify.belweave.ai).

[Documentation](https://notify.belweave.ai/docs) · [Releases](https://github.com/Belweave/notify-tools/releases) · [Agent skill](skills/notify/SKILL.md)

## Install

Requires **Node.js 22.13 or newer**. Download the archive and checksum file for the exact release, verify them, then inspect and run the installer. No npm packages need to be installed.

```sh
curl -fLO https://notify.belweave.ai/downloads/notify-tools/v0.12.2/notify-tools-0.12.2.tar.gz
curl -fLO https://notify.belweave.ai/downloads/notify-tools/v0.12.2/SHA256SUMS
shasum -a 256 -c SHA256SUMS
mkdir notify-tools-0.12.2
tar -xzf notify-tools-0.12.2.tar.gz -C notify-tools-0.12.2
cd notify-tools-0.12.2
node install.mjs --dry-run
node install.mjs
export PATH="$HOME/.local/bin:$PATH"
notify auth login
notify --help
```

The checksum detects a corrupted or mismatched download; it is distributed alongside the archive. On Linux, `sha256sum -c SHA256SUMS` also works. Installation keeps each release under `~/.local/share/notify-tools/VERSION` and points `~/.local/bin/notify` to it. Use `--prefix DIR` for another location. Earlier releases are preserved, and the installer refuses to replace an unrelated `notify` executable. Add the bin directory to your shell's PATH permanently as appropriate for your shell.

You can also run `node cli/notify.mjs` directly from the extracted archive, including on Windows. Agent service setup has platform-specific requirements described by `notify permissions help`; the OpenCode background service installer currently targets macOS.

The public download service is owned and deployed from this Tools repository.
See [release download maintenance](docs/downloads.md).

## Use Notify

```sh
notify send "The build finished"
notify send ask "Deploy the reviewed change?" --approval --wait
notify apps create --name "My dashboard" --url https://dashboard.example.com --json
notify connect 3000 --name dashboard
notify permissions help
```

The CLI includes authentication, notifications, approvals and replies, Live Activities, apps, families, teams, groups, on-call rotations, pages, connectors, devices, services, inbox, tokens, billing, and reply webhooks. Authentication uses the browser flow or `NOTIFY_TOKEN`; tokens are never accepted as command-line arguments. Treat webhook URLs and callback secrets as credentials.

See the [complete CLI reference](https://notify.belweave.ai/docs/cli) for flags and the [workflow guides](skills/notify/SKILL.md) for examples.

Notify account sign-in uses Clerk. `notify auth login` still opens Notify's browser approval page, asks for the requested scopes, and securely saves the resulting API key. Existing `ntf_` keys and Clerk user API keys (`ak_`) are supported. These are user credentials, separate from Clerk's application publishable and secret keys. Advanced clients may supply an OAuth bearer token through `NOTIFY_TOKEN`; expiry and scope checks remain the server's responsibility. Never paste credentials into chat or pass them as command arguments.

### Connect a remote MCP client

Use `https://notify.belweave.ai/mcp`. An OAuth-capable client should follow the endpoint's protected-resource and authorization-server discovery metadata. A client with a private bearer-header setting can alternatively use a Notify API key as `Authorization: Bearer <key>`; store the key in that client's secret store. Existing Notify OAuth credentials continue to work during migration.

If a client asks for a static OAuth client ID despite dynamic registration support, register an OAuth application in the production Clerk Dashboard and configure that ID in the client. Obtain the client's exact callback URI first, register that URI verbatim, and enable the scopes the client needs. Use a client secret only when the registered client and host require one, entered through the host's private secret setting. A missing callback URI cannot be guessed from the MCP server URL. Discovery's advertised endpoints remain authoritative; do not hard-code a token endpoint or manually exchange tokens. Check the discovery metadata, callback match, requested scopes, and client authentication method when diagnosing setup failures. The CLI browser approval flow does not require an OAuth client ID or secret.

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

The server creates a random cookie-bound challenge and verifies the signed reply before establishing its own session. Challenge consumption must be atomic across server instances. Validate request origins and use secure, HttpOnly cookies. The [complete Node/SQLite example](examples/microauth/node-session.mjs) includes those routes, persistent sessions, and one-time challenge consumption. [Integration guidance](skills/notify/notify-apps/SKILL.md) explains optional sharing and the legacy bridge.

The SDK exports separate browser and server modules. Its browser module has no Node or third-party runtime dependencies. Server verification includes ES256 signature, issuer, exact audience, app ID, nonce, expiration, and replay checks. Personal fields are optional and are shared only after phone approval.

## Connect an internal service

Import `connectInternal` from `./vendor/notify/connector.mjs`, or use `notify connect`. The connector publishes named local routes through the Notify relay, registers apps, maintains heartbeats, and closes resources when stopped. It also exports Notify-pass verification, Hono/Express/Fastify middleware, and callback HMAC verification.

```js
import { connectInternal } from "./vendor/notify/connector.mjs";

const connection = await connectInternal({
  token: process.env.NOTIFY_TOKEN,
  name: "Dashboard",
  routes: { dashboard: "127.0.0.1:3000" },
});
// At application shutdown:
await connection.close();
```

The CLI saves one-time callback signing secrets under `connectors/<id>.secret`
beside its normal configuration file, with mode `0600`; it prints only the saved
path. This also works with `NOTIFY_TOKEN` without saving the environment token.
A running `notify connect` prints route/app metadata immediately and does not
repeat it on shutdown. If saving a newly issued secret fails, the connector
stops. Fix storage, reconnect, then use `notify connectors rotate-secret <id>`
to save a replacement: reconnecting alone may reuse the connector without
returning its original secret again.

### OpenTunnel 0.5.1 options

Run the web app and `notify connect` on your computer, keep both running, then
open the registered app from **Apps** in Notify on your phone. Sensitive apps
still pass through the mandatory access gateway described below.

Ordinary HTTP servers need no extra flags. Only enable PROXY protocol when the
configured upstream listener explicitly supports it:

```sh
notify connect 3000 --name dashboard --proxy-protocol v2
```

`--proxy-protocol` accepts `v1` or `v2` and is off by default. The SDK accepts a
per-route object alongside existing string routes:

```ts
routes: {
  dashboard: { target: "127.0.0.1:3000", proxyProtocol: "v2" },
}
```

The upstream must consume the matching PROXY preamble before HTTP, or before
TLS for an HTTPS target. Enabling it for a normal web server breaks that route.
The gateway consumes transport metadata, authorizes the session or signed
callback, and only then sends a PROXY preamble on a new upstream connection.
It never forwards unauthenticated traffic. Visitor addresses originate from
the relay socket, not caller-supplied HTTP forwarding headers; they are network
metadata, not an authorization identity.

The 0.5.1 client brings reconnect and transient-failure handling. Notify keeps its
Cloudflare relay and AWS backend. Tunnel and certificate state remain in memory
for the connector's lifetime; no persistent identity or certificate reuse across
restarts is configured.

### Mandatory access gateway

`connectInternal` (including `notify connect`) binds a separate loopback HTTP
access gateway for each route. Both the built-in and custom tunnel factories
receive these gateway addresses; raw employer targets are never handed to the
tunnel. Until connector registration and the route's app binding succeed, access
fails closed. `registerApps: false` requires an existing valid route/app binding;
it does not create a public route.

The only unauthenticated HTML is Notify's own sign-in prompt. The visitor presses
**Connect with Notify** to obtain a pass from the verified native bridge and
POST it to `/.notify/session`. A successful one-time exchange sets a random,
host-only `__Host-notify_session` cookie with `HttpOnly`, `Secure`,
`SameSite=Strict` and no lifetime beyond the pass. Passes never appear in URLs,
browser storage or logs. Restarting the connector invalidates its in-memory
sessions; the server's durable replay claim prevents re-exchanging the same pass.

Every request—including JavaScript, CSS, images and WebSocket upgrades—calls
`POST /api/agent/connectors/:id/access` with the connector credential. Notify
validates ES256, exact issuer, exact origin audience, expiry, app/workspace
binding, the pass grant and current team membership. `consume: true` atomically
claims the pass `jti` for the exchange; later `consume: false` checks must match
that existing connector/route claim. Network errors, expired passes, membership
loss, disabled routes/connectors and rate limits deny access. Open WebSockets
and streaming responses recheck at most every 15 seconds and close at expiry.
A revocation therefore stops new requests immediately and existing streams
within 15 seconds plus the authorization timeout (5 seconds).

The gateway strips inbound Authorization and caller-supplied `x-notify-*` and
forwarding headers. It removes its session cookie before proxying and sets these
verified upstream headers: `x-notify-subject`, `x-notify-app-id`, and, for teams,
`x-notify-team-id` and `x-notify-team-role`. Employer services may trust these
only when direct access to their upstream listener is restricted to this gateway.
Ordinary application cookies remain application-local. Protected responses use
`Cache-Control: no-store`; a saved device copy is subject to the mobile app's
workspace data removal, not a remote device wipe. Mutating requests and browser
WebSocket upgrades require an exact matching `Origin`.

Machine callbacks have a separate, fixed ingress: `POST /.notify/callback`.
The gateway sends the exact UTF-8 JSON body (at most 64 KiB), timestamp and HMAC
signature to Notify's connector-authenticated `callback-access` endpoint. Notify
must match the persisted interaction, callback route/body and delivery state,
verify the signature, check current membership/connector/route enablement,
admit the team request budget and record a durable replay receipt. Only then
does it return the configured receiver path. The gateway forwards to that path
on its fixed upstream; no caller can select a different destination.

This endpoint rejects browser Origin headers, query strings, other HTTP methods
and WebSocket upgrades. It rejects every Authorization header: connector-target
callbacks do not support bearer credentials, and their signed body cannot bind
such a header. It forwards only the signature/timestamp headers with the JSON
body, never cookies, caller identity headers or a synthesized user identity.
Classic direct URL/token callbacks retain their separate bearer-authenticated flow.
The dedicated connector endpoint returns status only
(204 for successful delivery), never employer response content or cookies, and
does not follow redirects. Upstream delivery times out after five seconds. HMAC
headers on ordinary app routes do not bypass pass authentication. Existing
connector-target senders must use the updated Notify delivery endpoint; direct
HMAC-only requests to arbitrary app paths are denied.

There is no anonymous fallback. Existing sessions are deliberately short-lived;
reopening the app or connecting again obtains a new pass after authorization.
Do not add an alternate public proxy pointing directly at the upstream.

### Standalone middleware

`verifyNotifyPass` verifies cryptography and required claims; it is **not** a
complete session or current-membership authorizer. Hono, Express and Fastify
helpers additionally consume `jti` and reject replay. Pass validity is at most
120 seconds; team roles must be owner/admin/member and cannot appear without a
team id. They require an atomic `consumeJti(jti, expiresAt)` backed by shared durable
storage, including single-instance production deployments that may restart.
Missing or unavailable storage denies access; there is no memory-only fallback. Apply
middleware before static routes and every other protected handler. Framework
HTTP middleware does not automatically cover Node's `upgrade` event; use the
mandatory connector gateway for tunnel traffic, including WebSockets. Optional
`appId` and `teamId` verification constraints bind standalone services to an
expected app/workspace. The gateway's server authorization is required for live
membership checks, route disablement and distributed replay protection.

For example, with your existing connected PostgreSQL pool `db`, create a durable
receipt table and install the middleware before static assets and handlers:

```sql
CREATE TABLE notify_pass_receipt (
  replay_key text PRIMARY KEY,
  expires_at bigint NOT NULL
);
```

```ts
import { honoNotifyPass } from "./vendor/notify/connector.mjs";

app.use("*", honoNotifyPass({
  audience: "https://your-app.example.com",
  appId: process.env.NOTIFY_APP_ID,
  teamId: process.env.NOTIFY_TEAM_ID,
  consumeJti: async (replayKey, expiresAt) => {
    const result = await db.query(
      `INSERT INTO notify_pass_receipt (replay_key, expires_at)
       VALUES ($1, $2) ON CONFLICT (replay_key) DO NOTHING
       RETURNING replay_key`,
      [replayKey, expiresAt],
    );
    return result.rowCount === 1;
  },
}));
```

Every instance must use the same receipt table. The unique insert is the atomic
claim; do not replace it with a separate lookup followed by an insert. A maintenance
job may delete receipts only after `expires_at` has passed; passes are bounded to
120 seconds and expired passes fail verification before the claim. Use a new pass
for a later middleware request, or the connector gateway's authenticated session
for normal browser loading. This example does not implement current team membership
checks; the connector gateway delegates those to Notify on every request.

### Network and certificate boundary

The connector initiates outbound HTTPS/WSS connections to
`api.clawchest.com`; it opens no employer-network inbound port. Its per-route
listeners bind **127.0.0.1** only. The phone initiates TLS to the route hostname at
the relay's public TCP endpoint and does not listen for incoming connections.
Public relay servers are necessarily inbound listeners; this is separate from
the employer connector and the phone.

In the pinned OpenTunnel 0.5.1 client, the connector generates its private key
locally and submits a CSR. Phone TLS bytes pass through the TCP relay and Worker
bridge to the connector, where TLS terminates before the loopback access gateway.
The gateway connects to the explicitly configured HTTP or HTTPS employer
upstream. Use HTTPS for an upstream on another host. The production relay
operator controls DNS and certificate issuance, so this forwarding design is
**not** a cryptographic guarantee against a malicious relay operator issuing a
substitute certificate. The relay deployment must verify issuance, renewal and operational readiness before employer rollout.

## Architecture and development

| Directory | Responsibility |
| --- | --- |
| `src/cli` | Lazy command dispatch; focused commands; credentials, transport, input, and output boundaries |
| `src/microauth` | Browser bridge and session exchange; server challenge, identity, and binding validation |
| `src/connector` | Relay lifecycle and transport; signed passes, framework middleware, callback signatures |
| `src/agents` | Claude/Codex hooks and setup; separate OpenCode v1/v2 event and decision adapters |
| `scripts` | Self-contained bundles, licenses, versioned installation, and release archives |
| `skills/notify` | Agent instructions and task-specific workflow references |

Development uses the pinned pnpm version in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:release
pnpm release:archive
```

Builds produce runnable ESM files in `dist/` and preserve earlier output under ignored `artifacts/`. Releases bundle their dependencies and include full third-party license texts. `patches/` contains a small OpenTunnel compatibility fix for Node's standard WebSocket constructor; relay fetch and credentials are scoped to each connector runtime.

## License and security

Notify Tools is licensed under [Apache-2.0](LICENSE). Bundled dependencies retain their own licenses, included in each release. Notify and Belweave names and logos are not licensed under the code license. Report security issues through [GitHub private vulnerability reporting](https://github.com/Belweave/notify-tools/security/advisories/new).

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
