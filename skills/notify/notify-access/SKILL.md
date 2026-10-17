---
name: notify-access
description: Connect to Notify, inspect the current account and devices, and diagnose authentication or delivery prerequisites.
---

# Establish access

Start with MCP `auth_status` or `notify auth status`. If connected, reuse that identity. Use `devices_list` or `notify devices list` when device selection or delivery troubleshooting requires it; retain IDs rather than guessing from labels.

For a missing CLI login, `notify auth login` opens the human authorization flow. The person signs in and chooses access. A remote MCP client connects to `https://notify.belweave.ai/mcp` through its own OAuth flow. Agent tools cannot mint tokens or register the phone on the person's behalf.

Account sign-in uses Clerk; CLI browser approval still issues a scoped API key. Reuse existing `ntf_` keys or Clerk user API keys (`ak_`), never Clerk application secret or publishable keys. MCP clients may use OAuth discovery or a privately configured API-key bearer header. Existing Notify OAuth credentials remain compatible during migration.

If the MCP host demands a static OAuth client ID, obtain its exact callback URI and register an OAuth application in the production Clerk Dashboard with that URI and the required scopes. Configure the client ID and, only if required by the registered client, its secret through the host's private credential settings. Do not guess callback URIs, expose secrets, hard-code OAuth endpoints, or implement a manual token exchange. Diagnose discovery metadata, callback matching, scopes, and client authentication method before changing registration. `notify auth login` needs no OAuth client ID or secret.

When a write returns insufficient scope, identify the required scope from the tool error or current API schema. Request only that access through a new human authorization flow. The default CLI login omits `events:read` and `tokens:manage`; do not interpret that as a broken server. Do not automatically sign out, revoke tokens, or widen scopes to resolve a different error.

Tokens belong in the connected client's credential store or `NOTIFY_TOKEN`, never in command arguments, generated source, or chat. Webhook URLs and signing secrets can also grant access. Use the host's private secret-entry mechanism when available; otherwise guide the user to configure them locally without pasting them into the conversation.

## Delivery diagnosis

Check the target account, selected device IDs, device activity, and the returned delivery counts. Notification permission and native registration are completed on the phone. The person may need to open Notify to refresh native registration. An offline device or disabled permission cannot be repaired by sending duplicate pushes.

`billing_get` / `notify billing` reports the deployed plan. Read it when limits matter; do not infer pricing or quotas from a copied guide. Device removal, credential revocation, and account changes should correspond to the user's requested operation.

For installation, use the project's [release instructions](https://github.com/Belweave/notify-tools#install), check the installed version, and preserve existing credentials and releases. The release archive includes the entire `skills/notify` folder: retain its children when installing this skill.

## Tokens and plan limits

`notify tokens list` and `notify tokens revoke TOKEN_ID` require `tokens:manage`; revoke the intended credential, recognizing its callers will stop working. No CLI command creates tokens: new tokens require signed-in human authorization. `notify auth logout` removes local login; it is not an account repair operation.

Personal use is currently free with unlimited monthly notifications and devices; rate limits still apply (currently 300/service/minute and 1,500/account/minute). Team pricing is TBD and unavailable for purchase. `notify billing` is authoritative for the deployed account's actual entitlement and usage. Do not imply a paid checkout, trial, or purchasable team plan exists.
