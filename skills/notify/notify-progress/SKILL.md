---
name: notify-progress
description: Start, update, inspect, and end a Notify Live Activity for an ongoing job, including queued starts and delayed device registration.
---

# Maintain one progress surface

Choose a stable job key. Start once, update meaningful milestones, and end on success, failure, or cancellation.

```sh
notify activity start --key "release-42" --title "Website release" --status "Checking" --progress 0 --idempotency-key "release-42-start"
notify activity update release-42 --status "Uploading" --progress 0.7 --idempotency-key "release-42-upload"
notify activity end release-42 --status "Released" --progress 1 --idempotency-key "release-42-end"
```

MCP equivalents are `activities_start`, `activities_update`, `activities_get`, and `activities_end`. A key selects an activity; an idempotency key identifies a particular write. Reusing the same write key for changing content is an error. Use `ifSequence` / `--if-sequence` for optimistic concurrency when multiple writers might update the same job; on conflict, read the current activity before deciding whether your update is still relevant.

Use real progress between 0 and 1 when measured. Otherwise send a truthful status and omit the fraction. `standard`, `ring`, `hero`, `terminal`, and `steps` are available styles; choose for the information rather than cycling styles during a task. `--replace` is explicit replacement of an activity, not an ordinary notification replacement feature.

## Design the surface

For curated templates, design-file generation/validation, or visual configuration, read [Live Activity design](references/design.md). Check its release and deployment availability before using new commands.

Supply semantic content and supported design tokens. Notify and the operating system own layout, safe areas, lock-screen and Dynamic Island presentation; do not send pixel dimensions, fold poses, or assumed device geometry. Keep the same job meaning on every supported surface and rely on returned device capability/readiness.

Make the title identify the job; use status for its current stage, subtitle for a short metric, and detail for useful context. Pair a meaningful SF Symbol (`--symbol`) with an accessible `--accent-color '#RRGGBB'`. Use `--privacy private` when lock-screen content is sensitive, and keep secrets out of all presentation text. `ring` suits measured completion, `hero` one key status, `terminal` compact technical output, and `steps` staged work. A style does not supply data automatically.

Set `--stale-after` for when the displayed state stops being reliable and `--expires-in` for the intended start lifetime. Clear obsolete subtitle text with `--clear-subtitle`; use `--dismiss-after` on end when the final result should linger. `notify activity list`, `get ID_OR_KEY`, and `feed --filter live_activity` inspect state/history; feed requires `events:read`.

## Interpret delivery truthfully

Read status, accepted/queued/failed counts, and `readiness` when returned. On iOS a start accepted by APNs can still be `starting` while Notify waits for the device's update token. Fresh starts are paced per device across senders, currently at least 60 seconds apart. Do not bypass that pacing with new keys or retry storms.

For high-priority milestones, coalescing, APNs budgets, or delayed-token diagnosis, read [delivery and pacing](references/delivery.md). Queued work is not delivered, and provider acceptance does not prove visibility. End the job even if it never became visible.
