# Notify Tools

The command line, agent skills, SDK and connector for [Notify](https://notify.belweave.ai):
reach a person on their phone from a script or an agent, ask for a decision and get the answer back.

[Documentation](https://notify.belweave.ai/docs) · [Releases](https://github.com/Belweave/notify-tools/releases) · [Agent skill](skills/notify/SKILL.md) · [Changelog](CHANGELOG.md)

## Quick start

Needs Node.js 22.23.4+, 24.22.1+ or 26.12.1+ and the Notify app on your phone,
signed in with notifications allowed.

```sh
curl -fLO https://notify.belweave.ai/downloads/notify-tools/v0.15.1/notify-tools-0.15.1.tar.gz
curl -fLO https://notify.belweave.ai/downloads/notify-tools/v0.15.1/SHA256SUMS
shasum -a 256 -c SHA256SUMS
mkdir notify-tools-0.15.1 && tar -xzf notify-tools-0.15.1.tar.gz -C notify-tools-0.15.1
node notify-tools-0.15.1/install.mjs
export PATH="$HOME/.local/bin:$PATH"
```

Sign in once in the browser, then check the setup:

```sh
notify auth login
notify doctor
```

Send your first notification:

```sh
notify send "Nightly backup finished" --title "Backups"
```

Ask for your first decision. The command waits for the answer on your phone and
exits 0 only if you approve (5 on deny, 4 if nobody answers in time):

```sh
notify send ask "Deploy build 142 to production?" --approval --wait --timeout 10m && ./deploy.sh
```

Every command has `--help` with a working example, and `--json` for scripts.

## Common jobs

| Job | Command |
|---|---|
| Tell someone | `notify send "Build 142 passed" --title CI` |
| Ask and wait | `notify send ask "Merge PR 88?" --approval --wait --timeout 10m` |
| Ask an open question | `notify send ask "Which region?" --text --wait --timeout 15m` |
| Resume or cancel a question | `notify interaction wait ID` · `notify interaction cancel ID` |
| Show progress on the lock screen | `notify activity start --key job-1 --title Import --status Running --progress 0` |
| Page whoever is on call | `notify page ocg_ID "API down" --dedup-key api-down` |
| Open your site in Notify | `notify apps create --name Dashboard --url https://dashboard.example.com` |
| Publish a local service to your phone | `notify connect 3000 --name dashboard` |
| Approve an agent's tool use from your phone | `notify permissions setup claude` |
| Check the setup | `notify doctor` |

Exit codes: 0 success or approved; 1 API error; 2 usage; 3 sign-in or scope;
4 no answer; 5 denied; 6 network; 7 nothing delivered; 130 interrupted.
`notify help exit-codes` explains each. Credentials come only from
`notify auth login` or `NOTIFY_TOKEN` and are never printed.

## Agent skills

Two portable skills teach an agent to use Notify: [`notify`](skills/notify/SKILL.md)
for day-to-day use (tell, ask, progress, paging, teams) and
[`notify-integrations`](skills/notify-integrations/SKILL.md) for building receivers,
connectors, microAuth sign-in, mini apps and permission hooks. Install or update
them for Claude Code, Codex, OpenCode or Hermes Agent with the CLI, versioned with it:

```sh
notify skills install --agent claude
notify skills status
notify skills uninstall --agent claude
```

`--agent all` covers every supported host and `--dir DIR` any other location.
For Hermes Agent, `--agent hermes` follows `HERMES_HOME` (default `~/.hermes`) and
`--profile NAME` targets a named profile.
Without `--agent`, it installs for the hosts it finds on this machine. Only
directories it installed are ever replaced or removed.

Agents can also use the remote MCP server at `https://notify.belweave.ai/mcp`
(see [MCP clients](docs/live-activities-and-mcp.md#connect-a-remote-mcp-client)) or the
[HTTP API](https://notify.belweave.ai/openapi.json).

## SDK and integrations

Each release has an `sdk/` directory to copy into your project (no npm install):

- `connector.mjs`: `connectInternal` for private services, Notify pass middleware,
  `verifyReplyWebhookSignature` and `verifyCallbackSignature` for receivers.
  Reference: [connector and relay](docs/connector.md).
- `browser.mjs` and `server.mjs`: microAuth phone sign-in for websites.
  Reference: [web apps, microAuth and mini apps](docs/web-apps.md).
- `activity-design.mjs`: Live Activity design validation.
  Reference: [Live Activity designs](docs/live-activities-and-mcp.md).

## Install details

The checksum detects a corrupted or mismatched download. `node install.mjs --dry-run`
shows what would change. Installation keeps each release under
`~/.local/share/notify-tools/VERSION` and points `~/.local/bin/notify` at it;
`--prefix DIR` picks another location. Earlier releases are kept, and the installer
refuses to replace an unrelated `notify` executable. On Windows, run
`node cli/notify.mjs` from the extracted archive. Older Node patches, odd-numbered
releases and prereleases are refused because the floors include the
[October 21, 2026 Node.js security fixes](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases).
Shell completion: `eval "$(notify completion zsh)"` (or `bash`).

The public download service is deployed from this repository; see
[release download maintenance](docs/downloads.md).

## Architecture and development

| Directory | Responsibility |
| --- | --- |
| `src/cli` | Command reference, lazy command dispatch, credentials, transport, input and output |
| `src/microauth` | Browser bridge and session exchange; server challenge, identity and binding validation |
| `src/connector` | Relay lifecycle and transport; signed passes, framework middleware, signature verifiers |
| `src/agents` | Claude/Codex hooks and setup; OpenCode v1/v2 event and decision adapters |
| `scripts` | Self-contained bundles, licences, versioned installation and release archives |
| `skills` | The `notify` and `notify-integrations` agent skills |

Development uses the pinned pnpm version in `package.json`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:release
pnpm release:archive
```

`pnpm check` typechecks, runs the CLI, SDK and skill tests (the skill test runs
every CLI example in the skills against a stub of the production API), and builds
runnable ESM files into `dist/`, keeping earlier output under ignored `artifacts/`.
Releases bundle their dependencies with full third-party licence texts. `patches/`
holds a small OpenTunnel compatibility fix for Node's standard WebSocket constructor.

## License and security

Notify Tools is licensed under [Apache-2.0](LICENSE). Bundled dependencies retain their own licenses, included in each release. Notify and Belweave names and logos are not licensed under the code license. Report security issues through [GitHub private vulnerability reporting](https://github.com/Belweave/notify-tools/security/advisories/new).
