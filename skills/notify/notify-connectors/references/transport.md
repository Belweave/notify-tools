# Optional connector transport metadata


OpenTunnel 0.5.1 adds `notify connect PORT --name NAME --proxy-protocol v1|v2`.
This is off by default: enable it only after confirming the exact upstream listener
accepts that PROXY version before HTTP, or before TLS for HTTPS. In the SDK, use
`{ target: "127.0.0.1:3000", proxyProtocol: "v2" }` as that route's value; string
routes remain supported. Ordinary web servers should omit the option.

The mandatory gateway still authorizes the user session or signed callback before
sending a preamble on a new upstream connection. Relay-supplied socket addresses
are network metadata, not identity and not trusted browser forwarding headers.
The connector retains tunnel/certificate state only in memory; restarting does
not restore a persisted tunnel identity or certificate.
