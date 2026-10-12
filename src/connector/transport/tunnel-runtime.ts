// SPDX-License-Identifier: Apache-2.0
import { relayApiOrigin, DEFAULT_RELAY_DOMAIN } from "../protocol.js";
import type { ConnectOptions, TunnelSession } from "../types.js";
import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { FetchHttpClient } from "effect/http";
import { OpenTunnelClient, OpenTunnelStorage } from "@opentunnel/client/effect";
import { authorizeRelayCreate } from "./authorization.js";

/** Each tunnel owns its transport, credentials, and cleanup scope. */
export async function defaultTunnelFactory(
  options: ConnectOptions,
  routes: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TunnelSession> {
  const relayApi = options.relayApi ?? relayApiOrigin(options.relayDomain ?? DEFAULT_RELAY_DOMAIN);
  const authorized = authorizeRelayCreate(relayApi, options.token, fetchImpl);
  const layer = OpenTunnelClient.layer({ api: relayApi, storage: OpenTunnelStorage.memory() }).pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, authorized)),
  );
  const runtime = ManagedRuntime.make(layer);
  const scope = await runtime.runPromise(Scope.make());
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= runtime
      .runPromise(Scope.close(scope, Exit.void))
      .finally(() => runtime.dispose()));
  try {
    const connection = await runtime.runPromise(
      Effect.flatMap(OpenTunnelClient, (client) => client.tunnel.connect({ routes })).pipe(
        Effect.provideService(Scope.Scope, scope),
      ),
    );
    return { id: connection.tunnel.id, hostname: connection.tunnel.hostname, close };
  } catch (error) {
    await close();
    throw error;
  }
}
