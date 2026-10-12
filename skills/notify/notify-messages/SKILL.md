---
name: notify-messages
description: Send one-time Notify updates, organize or inspect the inbox, and withdraw an existing notification.
---

# Send a useful update

Use MCP `notify` or the CLI:

```sh
notify send "Release checks passed. The review is ready." --title "Build finished" --project "Website" --idempotency-key "build-42-finished"
```

Set a concrete title and body. For a long report, use `summary` / `--summary` for the short banner and put detail in the body; markdown is selected explicitly with `--markdown`. Current limits are 8,000 characters and 16 KiB of UTF-8. Use `--stdin` for structured payloads that are awkward to quote; read current help for its input shape.

Omitting a device target follows the account's normal targeting. Use an explicitly selected device or group when the request calls for it. Do not pick the first device merely because it appears first. A registered app target uses `appId` / `--app`; a supplied URL must stay on that app's origin.

The CLI reserves first positionals `ask` and `withdraw`. To send those literal words, use `notify send -- ask` or `notify send -- withdraw`.

Keep the notification ID and delivery counts. A retry of the same event reuses its idempotency key; a different event gets a new key. Project grouping files messages in the inbox; it does not replace older system notifications. For an ongoing process, use [notify-progress](../notify-progress/SKILL.md).

## Read or remove a prior update

MCP `inbox_projects`, `inbox_list`, and `inbox_get` inspect history. The CLI equivalents are `notify inbox projects`, `notify inbox list`, and `notify inbox get <notification_id>`. Follow returned cursors when the task requires all results.

Use `inbox_read` or `notify inbox read <notification_id>` only when marking that item read is part of the task. `inbox_read_all` applies to items that existed when the operation ran.

`notification_withdraw` / `notify send withdraw <notification_id>` requests removal from phones and marks the item read. It does not undo anything a person already saw or did. Use the retained ID, not a new send to imitate removal.
