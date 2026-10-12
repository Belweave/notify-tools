// SPDX-License-Identifier: Apache-2.0
import type { ConnectorRouteTarget, ConnectOptions, TunnelSession } from "../types.js";

/** Load the relay runtime only when a connection is requested. */
export async function defaultTunnelFactory(
  options: ConnectOptions,
  routes: Record<string, ConnectorRouteTarget>,
  fetchImpl: typeof fetch,
): Promise<TunnelSession> {
  const runtime = await import("./tunnel-runtime.js");
  return runtime.defaultTunnelFactory(options, routes, fetchImpl);
}
