---
name: notify-decisions
description: Ask a person through Notify for a specific approval, yes/no decision, or written reply, then resume from the durable response.
---

# Ask once, resume the same decision

Use approval for permission to perform a named action, yes/no for a binary question, and text for information that cannot be expressed as a binary choice. Include the relevant object and consequence so the phone prompt stands alone.

```sh
notify send ask "Deploy reviewed commit abc123 to staging?" --approval --title "Staging release" --idempotency-key "deploy-abc123-staging" --wait --timeout 2m
notify send ask "Which customer account should receive this report?" --text --title "Report destination" --poll
```

MCP `ask` creates and briefly waits; `interactions_create` returns immediately. Inspect the schema for the interaction payload and supported presentation. Live Activity presentation is a separate choice from the question type and may return before any wait. Use it when the decision benefits from a persistent phone surface. CLI `--live-activity` supports approval and yes/no, not text; choose `--style approval|shell|verdict|signal` and concise `--primary-label` / `--secondary-label` when useful. These prompts expire within eight hours. Read queued counts and capability diagnostics; do not claim a Live Activity was shown when no capable device is registered.

For a designed approval or yes/no surface, read [Live Activity design](../notify-progress/references/design.md); new design-file support requires compatible CLI, server, and phone builds. Keep action labels specific to the question; design never changes who may answer.

Retain `interaction.id`. If the wait times out with a pending interaction, continue through `interactions_wait`, `interactions_get`, or `notify interaction wait <id>`. Do not create a second prompt. A host without a durable wake-up mechanism may return the pending ID to the user rather than run an unbounded polling loop.

## Act on the result

Read the status and response fields. `approved`, `yes`, and `replied` mean different things; a text reply is not automatically approval. `denied` and `no` reject the question. `expired` and `canceled` end it without permission. `timedOut` describes the wait, not the person's answer or the prompt's expiry.

An approval applies to the action that was shown, including its target and version. If the proposed action materially changes, present the revised decision. Only the person can answer; agent APIs can read or cancel a prompt but cannot approve it.

CLI rejection exits 5; cancellation or expiry exits 4. Inspect JSON as well as exit status. Preserve the ID if a command was interrupted.

For delivery of terminal responses into a running service, use [notify-automation](../notify-automation/SKILL.md). A webhook acknowledgement means the callback was received, not that the approved operation succeeded.
