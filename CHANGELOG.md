# Notify Tools 0.14.2

- Require patched Node.js 22.23.4+, 24.22.1+ or 26.12.1+ within those supported major lines, incorporating the October 21, 2026 security updates including the Brotli decoder RCE fix.
- Reject vulnerable patches, unsupported majors and prereleases before CLI commands, connector startup or installation. The installer bundles its runtime policy and remains dependency-free.
- Pin CI to Node.js 22.23.4, 24.22.1 and 26.12.1; build releases on 22.23.4. Browser and non-Node server SDK entrypoints keep their portability.

# Notify Tools 0.14.1

- Preserve connector tunnel identities, hostnames and certificates across unchanged restarts in a private XDG store. Add explicit `removeTunnel()` retirement; failed deletion retains credentials for retry.
- Strip caller-supplied address and forwarding metadata for HTTP and WebSockets. Services needing visitor addresses must opt into PROXY protocol.
- Let cross-route HTML document navigation reach Notify sign-in while retaining exact-origin and subresource restrictions.
- Bound active sessions and pending exchanges; report capacity as retryable 503. Add framing/HSTS defaults while preserving upstream policies and handle asynchronous proxy failures safely.
- Requires the matching server/relay admission fixes, deployed before connector clients. Existing profiles must have a single running process; historical orphan tunnels are not removed automatically.

# Notify Tools 0.14.0

- Let website owners enable public Notify sign-in with `apps update --public-client`, retaining one stable app ID across unrelated accounts.
- Add `--private-client` to disable public eligibility. Each viewer still approves their own sign-in and optional profile sharing.
- Document private publisher controls, independent storage and consent, and existing website-session revocation limits. Requires the matching Notify backend; iOS 1.5.9 records public launches in Apps.

# Notify Tools 0.13.0

- Add versioned Live Activity design configurations, an offline template catalog, config generation and validation, and file-based configuration for progress and decision commands.
- Export a portable activity-design SDK with strict validation, JSON Schema and TypeScript declarations.
- Expand the agent skills across the supported feature set with focused, lazily loaded references and accurate delivery, authentication and availability boundaries.
- Live Activity design rendering requires the matching Notify backend and iOS app. CLI/SDK archives, the public download service, and TestFlight are released separately.

# Notify Tools 0.12.2

- Accept Clerk user API keys (`ak_`) in saved CLI credentials while preserving existing `ntf_` keys and browser approval login.
- Validate bearer token syntax before creating authorization headers; retain support for OAuth bearer tokens through `NOTIFY_TOKEN`.
- Document Clerk account authentication and the unchanged Notify microAuth app-pass contract.

# Notify Tools 0.12.1

- Fix `notify mini-apps list` to use the catalog endpoint without a trailing slash. Verified against the live backend.

# Notify Tools 0.12.0

- Add personal mini-app package build/validation/publish, owner reads, keys/archive, installation offers, and reason-bound report/block/disable/remove commands.
- Add typed, side-effect-free `notifyMini()` storage detection, separate from authenticated hosted-app microAuth.
- Keep free web-only packages and the Apple physical-runtime approval gate explicit. No server SDK changes or npm publication.

# Notify Tools 0.11.1

- Add `notify activity update --priority high` for visible milestones. Responses report the APNs priority selected; excess milestone requests fall back to normal within per-activity budgets.
- Explain routine coalescing, independent start/end/interaction priority, and the limits of provider acceptance versus on-screen display.

# Notify Tools 0.11.0

- Upgrade the connector to OpenTunnel 0.5.1 with its reconnect and transient-failure handling, retaining Notify's Cloudflare relay and AWS backend.
- Add opt-in per-route PROXY protocol v1/v2 support in the SDK and `notify connect --proxy-protocol v1|v2`. Matching upstream support is required; all traffic continues through the mandatory authenticated gateway.
- Clarify the computer-hosted app to phone Apps workflow and the connector's in-memory certificate and tunnel lifetime.

# Notify Tools 0.10.1

- Share simultaneous authorization checks and stream rechecks without caching completed access decisions.
- Send compact liveness heartbeats with bounded timeouts and serialize shutdown after pending online requests.

# Notify Tools 0.10.0

- Put every connector route behind Notify pass exchange, durable replay protection, current membership checks, and bounded stream revocation.
- Keep signed machine callbacks on a separate ingress bound to the saved interaction and route.
- Require a durable atomic `consumeJti` store in raw pass middleware; missing storage fails closed.
- Save CLI callback secrets privately for both saved-login and environment-token flows; emit only safe metadata during a running connection.
- Recognize superseded progress as a successful replay outcome.
- Replace the previous agent instructions with a new router and eight focused, portable workflow skills.

# Notify Tools 0.9.0

- Public Apache-2.0 toolkit with versioned GitHub release archives and a local installer.
- CLI command modules for all Notify resources, browser authentication, and stdin/JSON workflows.
- microAuth() browser and server SDKs, standalone TypeScript declarations, and a durable Node/SQLite session example.
- Internal service connector, pass-verification middleware, and callback signature verification.
- Claude Code, Codex, and OpenCode permission integrations, with modular installation and event handling.
- Agent skill and focused workflow references.
- Exact-origin relay authorization, per-connector fetch isolation, and Node WebSocket compatibility.
