// SPDX-License-Identifier: Apache-2.0
import {
  isRouteName,
  DEFAULT_RELAY_DOMAIN,
  type ConnectorRoute,
  tunnelOrigin,
  type ConnectorCreatedResponse,
} from "./protocol.js";
import { notifyRequest } from "./transport/notify.js";
import { defaultTunnelFactory } from "./transport/tunnel.js";
import { ConnectOptions, ConnectorHandle } from "./types.js";

export const DEFAULT_API = "https://notify.belweave.ai";

export async function connectInternal(options: ConnectOptions): Promise<ConnectorHandle> {
  for (const name of Object.keys(options.routes)) {
    if (!isRouteName(name)) {
      throw new Error(`Invalid route name: ${name}`);
    }
  }
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const warn = options.onWarning ?? ((message: string) => console.warn(message));
  const apiUrl = `${(options.apiUrl ?? DEFAULT_API).replace(/\/$/, "")}/`;
  const domain = options.relayDomain ?? DEFAULT_RELAY_DOMAIN;
  const factory = options.tunnel ?? {
    connect: (routes: Record<string, string>, nextFetch: typeof fetch) =>
      defaultTunnelFactory(options, routes, nextFetch),
  };

  const session = await factory.connect(options.routes, fetchImpl);
  const hostname = session.hostname.replace(/\.$/, "");
  const declared: ConnectorRoute[] = Object.entries(options.routes).map(([name, target]) => ({
    name,
    target,
    url: tunnelOrigin(session.id, name, domain),
  }));

  const created = await notifyRequest<ConnectorCreatedResponse>(
    apiUrl,
    options.token,
    "/api/agent/connectors",
    {
      method: "POST",
      body: JSON.stringify({
        name: options.name,
        tunnelId: session.id,
        hostname,
        routes: declared,
        ...(options.teamId ? { teamId: options.teamId } : {}),
        ...(options.oncallGroupId ? { oncallGroupId: options.oncallGroupId } : {}),
      }),
    },
    fetchImpl,
  );

  const routes = [...created.body.connector.routes];
  if (options.registerApps !== false) {
    for (const route of routes) {
      try {
        const app = await notifyRequest<{ app: { id: string } }>(
          apiUrl,
          options.token,
          "/api/agent/apps",
          {
            method: "POST",
            body: JSON.stringify({
              name: route.name === "@" ? options.name : `${options.name} / ${route.name}`,
              url: route.url,
              ...(options.teamId ? { teamId: options.teamId } : {}),
            }),
          },
          fetchImpl,
        );
        route.appId = app.body.app.id;
      } catch {
        // App registration is best-effort; the tunnel still works.
      }
    }
    if (routes.some((route) => route.appId)) {
      try {
        await notifyRequest(
          apiUrl,
          options.token,
          `/api/agent/connectors/${created.body.connector.id}`,
          { method: "PATCH", body: JSON.stringify({ routes }) },
          fetchImpl,
        );
      } catch (error) {
        warn(
          `Could not save app ids on connector ${created.body.connector.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  const heartbeatMs = options.heartbeatMs ?? 30_000;
  const timer = setInterval(() => {
    void notifyRequest(
      apiUrl,
      options.token,
      `/api/agent/connectors/${created.body.connector.id}/heartbeat`,
      {
        method: "POST",
        body: JSON.stringify({
          status: "online",
          tunnelId: session.id,
          hostname,
          routes,
        }),
      },
      fetchImpl,
    ).catch(() => undefined);
  }, heartbeatMs);
  timer.unref();

  return {
    connector: { ...created.body.connector, routes },
    callbackSecret: created.body.callbackSecret,
    reused: created.body.reused === true || created.status === 200,
    routes,
    close: async () => {
      clearInterval(timer);
      await notifyRequest(
        apiUrl,
        options.token,
        `/api/agent/connectors/${created.body.connector.id}/heartbeat`,
        {
          method: "POST",
          body: JSON.stringify({ status: "offline", graceful: true }),
        },
        fetchImpl,
      ).catch(() => undefined);
      await session.close();
    },
  };
}
