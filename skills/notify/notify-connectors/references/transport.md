# Optional connector transport metadata


OpenTunnel 0.5.1 adds `notify connect PORT --name NAME --proxy-protocol v1|v2`.
This is off by default: enable it only after confirming the exact upstream listener
accepts that PROXY version before HTTP, or before TLS for HTTPS. In the SDK, use
`{ target: "127.0.0.1:3000", proxyProtocol: "v2" }` as that route's value; string
routes remain supported. Ordinary web servers should omit the option.

The mandatory gateway still authorizes the user session or signed callback before
sending a preamble on a new upstream connection. Relay-supplied socket addresses
are network metadata, not identity and not trusted browser forwarding headers.
HTTP and WebSocket requests strip caller-supplied forwarding/address headers,
including X-Real-IP, X-Client-IP, CF-Connecting-IP, Via and X-Original-Forwarded-For.
Use PROXY protocol when the upstream needs a transport-derived visitor address.

CLI/SDK 0.14.1 preserves tunnel identity and certificates in a private XDG profile.
Unchanged credentials and route configuration reuse the hostname across restarts;
changing those inputs selects a new profile. Run only one process per profile.
Routine close preserves the identity. Explicit SDK `removeTunnel()` retirement
deletes the remote tunnel before removing local credentials; failed deletion
retains them. Incomplete credentials fail closed and require recovery. Historical
orphan tunnels are not automatically removed.
