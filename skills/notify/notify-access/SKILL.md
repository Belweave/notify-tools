---
name: notify-access
description: Connect to Notify, inspect the current account and devices, and diagnose authentication or delivery prerequisites.
---

# Establish access

Start with MCP `auth_status` or `notify auth status`. If connected, reuse that identity. Use `devices_list` or `notify devices list` when device selection or delivery troubleshooting requires it; retain IDs rather than guessing from labels.

For a missing CLI login, `notify auth login` opens the human authorization flow. The person signs in and chooses access. A remote MCP client connects to `https://notify.belweave.ai/mcp` through its own OAuth flow. Agent tools cannot mint tokens or register the phone on the person's behalf.

When a write returns insufficient scope, identify the required scope from the tool error or current API schema. Request only that access through a new human authorization flow. The default CLI login omits `events:read` and `tokens:manage`; do not interpret that as a broken server. Do not automatically sign out, revoke tokens, or widen scopes to resolve a different error.

Tokens belong in the connected client's credential store or `NOTIFY_TOKEN`, never in command arguments, generated source, or chat. Webhook URLs and signing secrets can also grant access. Use the host's private secret-entry mechanism when available; otherwise guide the user to configure them locally without pasting them into the conversation.

## Delivery diagnosis

Check the target account, selected device IDs, device activity, and the returned delivery counts. Notification permission and native registration are completed on the phone. The person may need to open Notify to refresh native registration. An offline device or disabled permission cannot be repaired by sending duplicate pushes.

`billing_get` / `notify billing` reports the deployed plan. Read it when limits matter; do not infer pricing or quotas from a copied guide. Device removal, credential revocation, and account changes should correspond to the user's requested operation.

For installation, use the project's [release instructions](https://github.com/Belweave/notify-tools#install), check the installed version, and preserve existing credentials and releases. The release archive includes the entire `skills/notify` folder: retain its children when installing this skill.
