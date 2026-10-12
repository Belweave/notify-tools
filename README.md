# Notify Tools

The command line, microAuth() SDK, service connector, and coding-agent integrations for [Notify](https://notify.belweave.ai).

[Documentation](https://notify.belweave.ai/docs) · [Releases](https://github.com/Belweave/notify-tools/releases) · [Agent skill](skills/notify/SKILL.md)

## Install

Requires **Node.js 22.13 or newer**. Download the archive and checksum file for the exact release, verify them, then inspect and run the installer. No npm packages need to be installed.

```sh
curl -fLO https://github.com/Belweave/notify-tools/releases/download/v0.9.0/notify-tools-0.9.0.tar.gz
curl -fLO https://github.com/Belweave/notify-tools/releases/download/v0.9.0/SHA256SUMS
shasum -a 256 -c SHA256SUMS
mkdir notify-tools-0.9.0
tar -xzf notify-tools-0.9.0.tar.gz -C notify-tools-0.9.0
cd notify-tools-0.9.0
node install.mjs --dry-run
node install.mjs
export PATH="$HOME/.local/bin:$PATH"
notify auth login
notify --help
```

The checksum detects a corrupted or mismatched download; it is distributed alongside the archive. On Linux, `sha256sum -c SHA256SUMS` also works. Installation keeps each release under `~/.local/share/notify-tools/VERSION` and points `~/.local/bin/notify` to it. Use `--prefix DIR` for another location. Earlier releases are preserved, and the installer refuses to replace an unrelated `notify` executable. Add the bin directory to your shell's PATH permanently as appropriate for your shell.

You can also run `node cli/notify.mjs` directly from the extracted archive, including on Windows. Agent service setup has platform-specific requirements described by `notify permissions help`; the OpenCode background service installer currently targets macOS.

## Use Notify

```sh
notify send "The build finished"
notify send ask "Deploy the reviewed change?" --approval --wait
notify apps create --name "My dashboard" --url https://dashboard.example.com --json
notify connect 3000 --name dashboard
notify permissions help
```

The CLI includes authentication, notifications, approvals and replies, Live Activities, apps, families, teams, groups, on-call rotations, pages, connectors, devices, services, inbox, tokens, billing, and reply webhooks. Authentication uses the browser flow or `NOTIFY_TOKEN`; tokens are never accepted as command-line arguments. Treat webhook URLs and callback secrets as credentials.

See the [complete CLI reference](https://notify.belweave.ai/docs/cli) for flags and the [workflow references](skills/notify/references) for examples.

## Add microAuth() to a website

Ordinary websites open in Notify without integration. microAuth() lets a participating site ask the user to sign in and share selected profile fields from their phone.

Copy the release's **whole `sdk` directory** to your app's `vendor/notify` directory, retaining its chunks and declarations. Keep the release's license and third-party notices with redistributed files.

```js
// Browser module
import { connectMicroAuth } from "./vendor/notify/browser.mjs";

const result = await connectMicroAuth({
  challengePath: "/api/microauth/challenge",
  sessionPath: "/api/microauth/session",
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

The server creates a random cookie-bound challenge and verifies the signed reply before establishing its own session. Challenge consumption must be atomic across server instances. Validate request origins and use secure, HttpOnly cookies. The [complete Node/SQLite example](examples/microauth/node-session.mjs) includes those routes, persistent sessions, and one-time challenge consumption. [Integration guidance](skills/notify/references/apps.md) explains optional sharing and the legacy bridge.

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
