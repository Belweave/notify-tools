# Design a Live Activity

## Availability

Design files work with Notify Tools 0.13.0 and newer and need a phone app build with design support (iOS 1.5.5 or newer). Local validation proves the file is valid, not that a phone shows it. Plain `--style`, `--symbol` and `--accent-color` remain the compatible route.

## Choose by intent

| Intent | Template | Useful content |
|---|---|---|
| General job | `standard` | Stage and next milestone |
| Measured completion | `ring` | Actual fraction and units |
| One prominent outcome | `hero` | Short status with supporting context |
| Technical operation | `terminal` | One current command or stage, no secrets |
| Staged workflow | `steps` | Current stage; no invented stage completion |
| Human approval | `approval` | Exact action and consequence |
| Command permission | `shell` | Specific command and target |
| Binary decision | `verdict` | Clear yes/no question |
| Attention or choice | `signal` | Brief question and meaningful action labels |

The first five templates are progress surfaces; the last four are interactive asks requiring `--live-activity` with approval or yes/no. Text replies use ordinary prompts. A template supplies presentation, not progress data or authorization.

Write for a glance: title identifies the job, status names the current stage, subtitle gives a useful metric, detail explains a next action or consequence. Prefer “Uploading 3 of 5 files” to “Processing…” when measured. Omit progress when its denominator is unknown; never animate fabricated percentages. Use one recognizable symbol and a restrained accent. Keep sensitive context behind `--privacy private` and avoid secrets entirely. System appearance and comfortable density are sensible defaults; choose compact only for concise technical content. Update on meaningful transitions, and end with a clear result or failure and next action. See [progress](progress.md) for pacing and [troubleshooting](troubleshooting.md) when a card does not appear.

## Generate and use a configuration

Offline commands discover templates, generate a standalone config, and validate a local file:

```sh
notify activity designs --json
notify activity design ring --json > activity-design.json
notify activity validate-design activity-design.json
```

Pass the validated file to `activity start` or `activity update` with `--design-file`; an interactive `send ask` also needs `--live-activity`:

```sh
notify activity start --key backup-7 --title "Backup" --status "Copying" --progress 0.2 --design-file activity-design.json
notify send ask "Approve the restore of backup 7?" --approval --live-activity --design-file approval.json --wait --timeout 10m
```
 Structured `--stdin` payloads may carry `design` directly. Files are limited to 16 KiB. Validate locally before a real send; these discovery commands need no account or phone.

Canonical shape (only `version` is required):

```json
{"version":1,"template":"ring","appearance":"system","density":"comfortable","emphasis":"progress","showDetail":true,"showSymbol":true}
```

`appearance`: `system|light|dark`; `density`: `comfortable|compact`; `emphasis`: `balanced|title|status|progress`. Defaults are system/comfortable/balanced. `showDetail` and `showSymbol` are optional booleans. Unknown fields, markup, fonts, scripts, custom geometry, action overrides, and privacy overrides are unsupported. `accentColor` remains a separate presentation field; the native renderer keeps safe contrast. The operating system owns layout and placement across supported devices.

On update, absent `design` preserves it, `null` resets it (`--clear-design`), and an object replaces it. A design template overrides legacy `style`; a style-only update clears a stale template. Do not combine `--design-file` and `--clear-design`.

Scripts can import pure helpers `validateActivityDesign`, `activityDesign`, `activityDesignCatalog`, `activityDesignSchema`, and `parseActivityDesign` from the complete release SDK's `activity-design.mjs`. Use the SDK declarations for signatures and return/error shapes; these helpers perform no network calls or native rendering.
