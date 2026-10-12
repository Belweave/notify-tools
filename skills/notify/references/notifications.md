# Notifications

## Send Notifications

Send a one-shot notification:

```bash
notify send "Production deployed" \
  --title "Deploy bot" \
  --image https://example.com/deploy-bot.png \
  --url https://example.com/deployments/184 \
  --idempotency-key deploy-184-complete
```

The body is required. `--title` defaults to `Notify`; `--image` must be a public HTTPS URL; `--url`
opens when the notification is tapped. Repeat `--device <id>` for targeted delivery. Device targeting
is included in the free plan. Use
`devices list` to discover device IDs. Replace the example image and destination URLs with real
values or omit those flags.

Bodies hold up to 8,000 characters (16 KiB of UTF-8). For long bodies, pass `--summary <text>` so
the push banner and inbox previews show a short digest while the full body stays readable in the
app. `--project <name>` groups the notification under a named project in the app inbox; project
names are case-insensitive per account and created on first use. `--markdown` records the body as
Markdown metadata; the app currently renders plain text with tappable links. These three flags
apply to `send`, not `send ask`.

`--url` also accepts an app deep link or Apple Shortcuts URL. Quote URLs containing `&`, and
percent-encode the shortcut name and input:

```bash
notify send "Production deployed" \
  --url 'shortcuts://run-shortcut?name=Deployment%20Follow-up&input=text&text=production'
```

The destination runs only after an explicit notification tap. Do not claim that notification
delivery itself launches an app or shortcut; iOS may also require an unlock or action-specific
permission.

For generated payloads, pipe JSON with `--stdin`; explicit flags override stdin fields:

```bash
printf '%s' '{"body":"Tests passed","title":"CI"}' | \
  notify send --stdin --idempotency-key build-184-tests
```

When a body comes from an external source, first place it in `UNTRUSTED_BODY` without generating
shell source from its value, then validate and encode it as data:

```bash
jq -en --arg body "$UNTRUSTED_BODY" '
  if (($body | length) > 0 and
      ($body | length) <= 8000 and
      (($body | utf8bytelength) <= 16384) and
      ($body | test("[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]") | not))
  then {body: $body, title: "CI"}
  else error("invalid notification body")
  end
' | \
  notify send --stdin --idempotency-key build-184-tests
```

## Run a Live Activity

Use one activity for changing task state instead of sending many notifications:

```bash
notify activity start \
  --key deploy-main --replace --style ring \
  --title "Deploy #184" --status "Building" --subtitle "Compile and bundle" --progress 0.1

notify activity update deploy-main \
  --status "Testing" --subtitle "Run checks" --progress 0.7

notify activity end deploy-main \
  --status "Shipped" --clear-subtitle --progress 1 --dismiss-after 45s
```

Styles are `standard`, `ring`, `hero`, `terminal`, and `steps`. Use a short task
`title`, current `status`, and optional `--subtitle` as a whole-word second-line
summary replacing visible status in expanded/Lock Screen layouts only; compact
and banner views retain status. Update the subtitle as the stage changes, or use
`--clear-subtitle` on update/end so an old summary does not hide the new status. `--detail` supports a two-line context region;
second-line overflow appears before explicit detail. Title overflow does not use
that region. Use the [current per-field compact and expanded/Lock Screen budgets](https://notify.belweave.ai/docs#activity-fields)
from the shared contract for the chosen style: these are suggested authoring
budgets, not API limits or guaranteed fit. Glyph width, device size, locale, and
accessibility text size affect fit. Compact hides title/subtitle/detail; percentage
wins over status when progress is supplied. The native layout measures, scales
no smaller than 75%, and clips at whole-word boundaries, retaining original text
for VoiceOver. Never promise a scrolling marquee: Apple's animation duration is
at most two seconds, and Notify uses static summary/detail fallback with no
animation, including Reduce Motion.

Use `--replace` for a fixed-key task
that should replace the same requester’s active key on each run; other keys and requesters are preserved.
Up to five concurrent activities per device include interactive prompts. Device capacity returns
`422 ACTIVITY_CAPACITY_EXCEEDED`. Update/end may return `queued` while an iOS update token is
pending; queued operations are durable, not provider acceptance or confirmed device display. Use the returned sequence with `--if-sequence` to
reject stale writes. Prefer meaningful updates over tight progress loops. iOS may suppress fresh
activity starts less than about one minute apart; update the current activity instead.
