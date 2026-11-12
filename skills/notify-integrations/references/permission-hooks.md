# Agent permission hooks

The CLI routes an agent host's permission requests ("may I run this command?")
to the phone as a decision, and returns the answer to the host. A grant needs an
explicit approval and applies once; denial, expiry, errors and undelivered
prompts all deny. The phone sees only the agent name, tool name, project folder
name and a resource count: never commands, file contents, URLs or paths.

The CLI has adapters for Claude Code, Codex, and OpenCode:

```sh
notify permissions help
notify permissions doctor
notify permissions setup codex
notify permissions uninstall codex
```

Choose the actual host, inspect its supported mode, and change only that integration. These adapters translate the host's permission requests into durable Notify decisions; they do not grant blanket future authorization. Do not install `all` when only one host was requested. For another AI agent, use Notify MCP or CLI primitives and that agent's documented permission hooks instead of pretending a built-in adapter exists.

Keep the association between the host request and Notify interaction ID. Apply an answer to that exact outstanding request, handle cancellation and expiry, and stop retries when the host request no longer exists. A recovered process should inspect existing state before sending the person another prompt.

`setup claude` installs a `PermissionRequest` hook in `~/.claude/settings.json`; `setup codex` installs one in `~/.codex/hooks.json`. Codex then requires the person to trust it in `/hooks`; inspect returned warnings about inline hook definitions. macOS and Linux support these hooks; Windows setup is unsupported.

`setup opencode` currently requires macOS. It installs a LaunchAgent for the OpenCode v2 background bridge and a v1 event plugin at `~/.config/opencode/plugin/notify-permissions-v1.js`. Both generations are supported, not interchangeable manual HTTP recipes. Keep its durable state and private logs; use doctor and returned warnings to diagnose duplicate notification plugins. `uninstall HOST` removes that adapter. Do not invoke private `hook`, `daemon`, or `opencode-v1-event` entrypoints as interactive user commands.

Defaulting setup/uninstall to no host selects all: always name the requested host. Setup requires existing Notify authentication and the required scopes; doctor reports missing scopes. Repair only the reported prerequisite, preserve unrelated hooks, and do not reset authentication as a troubleshooting shortcut.

Setup needs the scopes `notifications:send`, `interactions:create` and
`interactions:read` (all in the default login). Answers can also be watched with
`notify interaction list` while a request is pending.
