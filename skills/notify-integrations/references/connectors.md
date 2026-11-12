# Connectors and the relay

A connector publishes a web service that runs on your computer or private network
to Notify phones, without opening an inbound port. It dials out to the Notify
relay, registers each route as a web app, and puts a mandatory access gateway in
front of the service: every page, asset, API call and WebSocket needs a valid
Notify pass and current membership, checked again at most every 15 seconds.

## Publish a local service

Run the service and the connector on the same machine and keep both running:

```sh
notify connect 3000 --name dashboard
notify connect 3000 --name dashboard --team team_SELECTED_ID
```

- `--name` is a DNS label (lowercase letters, digits, hyphens) used in the route
  hostname, not a display title. `--host` targets another local address.
- It prints one JSON line with the connector, routes, URLs and app IDs, then runs
  until Ctrl-C or SIGTERM, which closes it cleanly. The same machine, token and
  routes reuse the same hostname across restarts.
- On the phone, open **Apps** in Notify and choose the app. The first visit shows
  Notify's own "Connect with Notify" screen.
- The callback signing secret is saved to `connectors/<id>.secret` beside the CLI
  configuration with mode 0600; only the path is printed.
- `--proxy-protocol v1|v2` only if your upstream listener expects PROXY protocol.

The CLI targets plain HTTP on the port. For an HTTPS upstream use the SDK with a
`https://` target so TLS is kept end to end to your service.

## Manage connectors

```sh
notify connectors list
notify connectors get conn_SELECTED_ID
notify connectors update conn_SELECTED_ID --disabled
notify connectors update conn_SELECTED_ID --oncall ocg_SELECTED_ID
notify connectors rotate-secret conn_SELECTED_ID
notify connectors remove conn_SELECTED_ID
```

`--disabled` cuts off access at the gateway immediately for new requests and
within about 20 seconds for open streams. `--oncall` names the on-call group to
page when the connector goes offline. Team connectors need an admin or owner.
Reconnecting does not return an existing secret again: rotate it if it was lost.

## SDK

```js
import { connectInternal } from "./vendor/notify/connector.mjs";

const connection = await connectInternal({
  token: process.env.NOTIFY_TOKEN,
  name: "dashboard",
  routes: { dashboard: "https://127.0.0.1:3443" },
});
// Save connection.callbackSecret (if present) to a 0600 file or secret manager.
process.once("SIGTERM", () => connection.close());
```

`routes` maps route names to `host:port`, an `http(s)://` URL, or
`{ target, proxyProtocol }`. `close()` keeps the tunnel identity for the next
start; `removeTunnel()` retires it. Run one process per identity.

### Trusting identity in your service

The gateway removes caller-supplied identity and forwarding headers and adds
verified ones: `x-notify-subject`, `x-notify-app-id`, and for teams
`x-notify-team-id` and `x-notify-team-role`. Trust them only if the upstream
listener can be reached solely through the gateway (bind it to 127.0.0.1).

Outside the gateway, the SDK's `honoNotifyPass`, `expressNotifyPass` and
`fastifyNotifyPass` verify a pass and require an atomic, durable
`consumeJti(jti, expiresAt)` (for example a unique-key insert) to stop replays.
`verifyNotifyPass` alone checks cryptography only.

## Callbacks into the connected service

A prompt can deliver its answer to a route on the connector:
`{"callback": {"target": {"connectorId": "conn_…", "route": "cb", "path": "/notify/answers"}}}`.
Notify signs the body, the gateway accepts it only at `POST /.notify/callback`,
checks the signature, the saved prompt and the route, and forwards it to that
path. See [receivers](receivers.md) for the body and verification.

## HTTP and MCP

```sh
curl -sS https://notify.belweave.ai/api/agent/connectors -H "Authorization: Bearer $NOTIFY_TOKEN"
```

```sh
curl -sS -X PATCH https://notify.belweave.ai/api/agent/connectors/conn_SELECTED_ID \
  -H "Authorization: Bearer $NOTIFY_TOKEN" -H "Content-Type: application/json" \
  -d '{"enabled":false}'
```

```mcp
{"tool": "connectors_update", "arguments": {"connectorId": "conn_SELECTED_ID", "enabled": false}}
```

Scopes: `connectors:read`, `connectors:write` (both in the default login).
