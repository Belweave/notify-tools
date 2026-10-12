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

## Interpret delivery truthfully

Read status, accepted/queued/failed counts, and `readiness` when returned. On iOS a start accepted by APNs can still be `starting` while Notify waits for the device's update token. Fresh starts are paced per device across senders, currently at least 60 seconds apart. Do not bypass that pacing with new keys or retry storms.

The current server coalesces queued routine updates and reports superseded work separately. It preserves terminal and interaction boundaries. Routine updates use lower APNs priority; unlimited monthly usage does not imply unlimited instantaneous phone starts.

An `update_token_delayed` warning means token registration has not arrived after the diagnostic threshold, currently 90 seconds. Check the device and ask the person to open Notify if needed. Do not report the activity as visibly running based only on provider acceptance. Ending remains necessary even if it never became visible.

If the server predates these fields, report only the evidence it returns. Device operating systems ultimately control presentation.
