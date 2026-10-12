# microAuth Playground

A small phone app that demonstrates the complete microAuth browser → native
consent → server verification flow. It uses the released SDK, rather than
decoding a JWT in the browser. Each optional field starts unchecked. The phone
still makes the final sign-in and sharing decision.

Cloudflare Durable Objects store single-use challenges for two minutes and
verified sessions for five minutes, with alarms for cleanup. A session uses a
new random HttpOnly, Secure, SameSite=Strict cookie after each successful
handshake. Cookies and passes are never logged. The UI displays only the
verified fields and can clear its session. This does not revoke the user's
Notify sharing grant; that is managed in Notify's Access & details.

## Build and deploy

From the repository root, build the SDK with `pnpm build`, then:

```sh
APP_ORIGIN=https://notify-microauth-playground.YOUR-SUBDOMAIN.workers.dev \
  node examples/microauth/playground/build.mjs
```

Use your already-installed, reviewed Wrangler to deploy the generated
`artifacts/microauth-playground/wrangler.json` into your account. The first
deployment serves the page but rejects authentication until registered:

```sh
wrangler deploy --config artifacts/microauth-playground/wrangler.json
notify apps create --name 'microAuth Playground' \
  --url https://notify-microauth-playground.YOUR-SUBDOMAIN.workers.dev \
  --icon https://notify-microauth-playground.YOUR-SUBDOMAIN.workers.dev/icon.svg --json
```

Rebuild with that exact `APP_ORIGIN` and the returned `NOTIFY_APP_ID=app_...`,
then deploy again. The app ID is a public identifier, not a credential. No
Notify API token belongs in the Worker or browser. Send the registered app
with `notify send 'Try microAuth' --app app_...` when the user requests it.

The worker uses a separate origin and does not change the Notify backend.
Its platform storage may retain recovery history under the host's policies;
the five-minute limit describes application session access and active data.
For a production app, add your own retention policy, account controls,
rate limits, monitoring, and application authorization rules.

## Verify

```sh
pnpm build
pnpm exec vitest run --config examples/microauth/playground/vitest.config.mjs
```

The HTTP boundary tests use actual signed SDK handshakes and cover cookie
binding, cross-origin rejection, wrong app IDs/signatures, concurrent replay,
rotation, expiry, and clearing sessions. Run the built Worker under Wrangler
or deploy it to exercise the actual Durable Object storage implementation.
Use Notify iOS 1.5.2 (16) or newer for the real native consent flow. An ordinary
browser shows the interface and an explanation when Connect is pressed.

The source is Apache-2.0. The bundled SDK also includes `jose` (MIT); its
license is included in the normal Notify Tools release's `licenses` folder.
