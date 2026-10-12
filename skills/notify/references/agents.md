# Agents

## Route Coding-Agent Permissions Through Notify

Use the built-in permission bridge for Claude Code, Codex, OpenCode V1, and OpenCode V2:

```bash
notify permissions setup all
notify permissions doctor
```

The default login includes the required `notifications:send`, `interactions:create`, and
`interactions:read` scopes. If the user requested a narrowed login, confirm that all three remain;
setup and `doctor` report missing scopes before hooks are installed.

After Codex setup, tell the user to review and trust the hook through `/hooks`. Install one adapter
with `permissions setup claude`, `codex`, or `opencode`. Remove only bridge-owned configuration with
`permissions uninstall <agent|all>`. The OpenCode connector currently requires macOS. Only explicit
phone approval allows once; denial, timeout, malformed input, authentication failure, network
failure, and no-device delivery deny. Raw commands, patches, prompts, file contents, URLs,
environment variables, transcripts, and absolute paths are not sent to Notify.

For MCP `ask` with `presentation: "live_activity"`, creation returns immediately
with the pending interaction, `accepted: 0`, and `queued: N`. Use `interactions_wait`
or `interactions_get` with the original creating token to observe a server-confirmed
terminal answer before dependent work. Queued delivery is not approval. Notification
presentations retain the existing wait behavior.
