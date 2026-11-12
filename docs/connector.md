# Connector and relay reference

The complete security and transport reference for `notify connect` and the connector SDK. For a task-oriented guide, see the `notify-integrations` skill ([connectors](../skills/notify-integrations/references/connectors.md)).

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
Cloudflare relay and AWS backend. Tunnel identity, private key, certificate and
pending CSR persist under `$XDG_DATA_HOME/opentunnel/<profile>` (fallback
`~/.local/share/opentunnel`), with 0700 profile directories and 0600 files.
Unchanged credentials and configuration reuse the tunnel ID, hostname and
certificate across restarts; pending CSR bundles resume after interruption.
The hashed profile includes relay/Notify origins, token hash, team, connector
name and original route configuration, excluding random loopback gateway ports.
Changing those inputs selects a new identity and hostname. SDK options
`tunnelProfile` and `tunnelStorage` allow explicit control. Custom storage implements
the exported Promise-based `TunnelStorage` interface, including complete ready
and pending identities, listing and removal; raw SDK Effect storage is adapted
internally. Ephemeral storage is intended for tests.

Routine `connection.close()` preserves the identity. To retire it deliberately,
call `connection.removeTunnel()`: this offlines/closes the connector, deletes the
remote tunnel with its per-tunnel token, then removes local credentials only
after success. Failed deletion retains credentials for retry. Custom tunnel
factories must provide `TunnelSession.remove` for that opt-in API.
Run only one process for an identical profile. Incomplete credential bundles fail
closed and require operator recovery; they are never silently overwritten.
Initial persistence failure attempts remote cleanup, but simultaneous storage
and cleanup failure requires reconciliation. Historical orphan tunnels are not
automatically pruned.

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

HTML document navigation from sibling or external sites reaches the sign-in
prompt, or a live revalidated session. Same-site and cross-site subresources,
iframes and mutations remain forbidden. Mismatched Origin/Host checks remain
strict; navigation never bypasses authorization.

The gateway strips inbound Authorization and caller-supplied `x-notify-*`.
HTTP and WebSocket forwarding also removes `Forwarded`, `Via`, `X-Real-IP`,
`Client-IP`, `X-Client-IP`, `X-Cluster-Client-IP`, `X-Originating-IP`, `X-Remote-IP`,
`X-Remote-Addr`, `True-Client-IP`, `CF-Connecting-IP`, and all `X-Forwarded-*`,
`X-Original-Forwarded-*` and `CF-*` headers, including `CF-IPCountry`.
It synthesizes only `X-Forwarded-Host` and `X-Forwarded-Proto`; use opt-in PROXY
protocol for a trusted visitor address. Upstreams that previously read these
caller-controlled address/geolocation headers must use transport metadata.
It removes its session cookie before proxying and sets these
verified upstream headers: `x-notify-subject`, `x-notify-app-id`, and, for teams,
`x-notify-team-id` and `x-notify-team-role`. Employer services may trust these
only when direct access to their upstream listener is restricted to this gateway.
Ordinary application cookies remain application-local. Protected responses use
`Cache-Control: no-store`. Responses default to `X-Frame-Options: SAMEORIGIN`
and `Strict-Transport-Security: max-age=31536000`, without `includeSubDomains`.
Explicit upstream XFO, HSTS and CSP framing policies are preserved. The sign-in
page keeps its tighter `frame-ancestors 'none'` CSP; no full CSP is imposed on
employer applications.

The 1024-session bound includes exchanges awaiting authorization. Capacity
returns 503 with `Retry-After: 5` before consuming a pass; invalid authorization
remains 401. Expired sessions are pruned on exchange and at most every five
seconds during lookup. Proxy construction, invalid upstream status and aborted
responses return 502 before headers, or close an already-started response, with
bounded logs that omit URLs and credentials.
A saved device copy is subject to the mobile app's workspace data removal,
not a remote device wipe. Mutating requests and browser WebSocket upgrades
require an exact matching `Origin`.

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
