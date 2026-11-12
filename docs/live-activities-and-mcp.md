# Live Activity designs and MCP clients

## Live Activity designs


Notify Tools 0.13.0 and newer include nine curated templates with automatic light/dark appearance,
compact or comfortable spacing, semantic emphasis, and optional detail/symbol display.
The template catalog and validation commands run offline. New rendering also requires
the matching Notify backend and iOS app; this repository does not deploy either component.

```sh
notify activity designs --json
notify activity design ring --json > ring.json
notify activity validate-design ring.json
# With a matching server and installed phone build:
notify activity start --title "Release checks" --status "Testing" \
  --progress 0.4 --key release-checks --design-file ring.json
```

Use `--design-file` with activity start/update or `send ask --live-activity`.
JSON stdin also accepts a `design` object. On update, omission preserves it,
`--clear-design` removes it, and a new object replaces it. A supplied template
takes precedence over `style`; a style-only update clears an older template.
Interaction labels, privacy, credentials, timing and native layout remain separate.
See the [design guide](../skills/notify/references/live-activity-design.md) for the
schema, template choices and readable status copy.

Scripts can use the standalone `sdk/activity-design.mjs` and its declarations:

```js
import { activityDesign, validateActivityDesign } from "./vendor/notify/activity-design.mjs";

const design = validateActivityDesign(
  { ...activityDesign("hero"), emphasis: "progress" },
  { kind: "progress" },
);
// Include design in the existing activity-start or activity-update JSON payload.
```

Notify account sign-in uses Clerk. `notify auth login` still opens Notify's browser approval page, asks for the requested scopes, and securely saves the resulting API key. Existing `ntf_` keys and Clerk user API keys (`ak_`) are supported. These are user credentials, separate from Clerk's application publishable and secret keys. Advanced clients may supply an OAuth bearer token through `NOTIFY_TOKEN`; expiry and scope checks remain the server's responsibility. Never paste credentials into chat or pass them as command arguments.

## Connect a remote MCP client


Use `https://notify.belweave.ai/mcp`. An OAuth-capable client should follow the endpoint's protected-resource and authorization-server discovery metadata. A client with a private bearer-header setting can alternatively use a Notify API key as `Authorization: Bearer <key>`; store the key in that client's secret store. Existing Notify OAuth credentials continue to work during migration.

If a client asks for a static OAuth client ID despite dynamic registration support, register an OAuth application in the production Clerk Dashboard and configure that ID in the client. Obtain the client's exact callback URI first, register that URI verbatim, and enable the scopes the client needs. Use a client secret only when the registered client and host require one, entered through the host's private secret setting. A missing callback URI cannot be guessed from the MCP server URL. Discovery's advertised endpoints remain authoritative; do not hard-code a token endpoint or manually exchange tokens. Check the discovery metadata, callback match, requested scopes, and client authentication method when diagnosing setup failures. The CLI browser approval flow does not require an OAuth client ID or secret.
