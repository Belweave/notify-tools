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
import { secureControlOrigin } from "./transport/authorization.js";
import type { ConnectorRouteTarget, ConnectOptions, ConnectorHandle, TunnelSession } from "./types.js";
import { type AccessGateway, type AccessIdentity, createAccessGateway } from "./gateway.js";
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
  secureControlOrigin(apiUrl);
  if (options.relayApi) secureControlOrigin(options.relayApi);
  const domain = options.relayDomain ?? DEFAULT_RELAY_DOMAIN;
  const factory = options.tunnel ?? {
    connect: (routes: Record<string, ConnectorRouteTarget>, nextFetch: typeof fetch) =>
      defaultTunnelFactory(options, routes, nextFetch),
  };

  const gateways: AccessGateway[] = [];
  let connectorId: string | undefined;
  let session: TunnelSession | undefined;
  try {
    const protectedRoutes: Record<string, ConnectorRouteTarget> = {};
    for (const [routeName, value] of Object.entries(options.routes)) {
      const { target, proxyProtocol } = typeof value === "string" ? { target: value } : value;
      if (typeof target !== "string" || (proxyProtocol !== undefined && proxyProtocol !== "v1" && proxyProtocol !== "v2")) {
        throw new Error("Routes require a target and optional proxyProtocol v1 or v2");
      }
      const gateway = await createAccessGateway({
        target,
        proxyProtocol,
        routeName,
        authorizeCallback: async (input) => {
          if (!connectorId) throw new Error("Connector is not ready");
          const result = await notifyRequest<{ path: string }>(
            apiUrl,
            options.token,
            `/api/agent/connectors/${connectorId}/callback-access`,
            {
              method: "POST",
              body: JSON.stringify({ routeName, ...input }),
              signal: AbortSignal.timeout(5_000),
            },
            fetchImpl,
          );
          return result.body;
        },
        authorize: async (pass, consume) => {
          if (!connectorId) throw new Error("Connector is not ready");
          const result = await notifyRequest<{ identity: AccessIdentity }>(
            apiUrl,
            options.token,
            `/api/agent/connectors/${connectorId}/access`,
            {
              method: "POST",
              body: JSON.stringify({ routeName, pass, consume }),
              signal: AbortSignal.timeout(5_000),
            },
            fetchImpl,
          );
          return result.body.identity;
        },
      });
      gateways.push(gateway);
      protectedRoutes[routeName] = proxyProtocol ? { target: gateway.target, proxyProtocol } : gateway.target;
    }
    const activeSession = await factory.connect(protectedRoutes, fetchImpl);
    session = activeSession;
    const hostname = activeSession.hostname.replace(/\.$/, "");
    const declared: ConnectorRoute[] = Object.entries(options.routes).map(([name, target]) => ({
      name,
      target: typeof target === "string" ? target : target.target,
      url: tunnelOrigin(activeSession.id, name, domain),
    }));

    const created = await notifyRequest<ConnectorCreatedResponse>(
      apiUrl,
      options.token,
      "/api/agent/connectors",
      {
        method: "POST",
        body: JSON.stringify({
          name: options.name,
          tunnelId: activeSession.id,
          hostname,
          routes: declared,
          ...(options.teamId ? { teamId: options.teamId } : {}),
          ...(options.oncallGroupId ? { oncallGroupId: options.oncallGroupId } : {}),
        }),
      },
      fetchImpl,
    );

    connectorId = created.body.connector.id;
    gateways.forEach((gateway, index) => {
      const route = declared[index];
      if (!route) throw new Error("Missing gateway route");
      gateway.setOrigin(route.url);
    });
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
          // Route stays inaccessible until an app binding is saved successfully.
          warn(`Could not register Notify app for route ${route.name}; access remains denied.`);
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
    let heartbeat: Promise<void> | undefined;
    const timer = setInterval(() => {
      if (heartbeat) return;
      heartbeat = notifyRequest(
        apiUrl,
        options.token,
        `/api/agent/connectors/${created.body.connector.id}/heartbeat`,
        {
          method: "POST",
          // Registration saves metadata; heartbeats report liveness only.
          body: JSON.stringify({ status: "online" }),
          signal: AbortSignal.timeout(5_000),
        },
        fetchImpl,
      )
        .then(
          () => undefined,
          () => undefined,
        )
        .finally(() => {
          heartbeat = undefined;
        });
    }, heartbeatMs);
    timer.unref();

    let shutdown: Promise<void> | undefined;
    const close = () =>
      (shutdown ??= (async () => {
        clearInterval(timer);
        await heartbeat;
        await notifyRequest(
          apiUrl,
          options.token,
          `/api/agent/connectors/${created.body.connector.id}/heartbeat`,
          {
            method: "POST",
            body: JSON.stringify({ status: "offline", graceful: true }),
            signal: AbortSignal.timeout(5_000),
          },
          fetchImpl,
        ).catch(() => undefined);
        try {
          await activeSession.close();
        } finally {
          await Promise.all(gateways.map((gateway) => gateway.close()));
        }
      })());
    return {
      connector: { ...created.body.connector, routes },
      callbackSecret: created.body.callbackSecret,
      reused: created.body.reused === true || created.status === 200,
      routes,
      close,
      removeTunnel: async () => {
        await close();
        if (!activeSession.remove)
          throw new Error("This tunnel factory does not support explicit removal");
        await activeSession.remove();
      },
    };
  } catch (error) {
    await session?.close().catch(() => undefined);
    await Promise.all(gateways.map((gateway) => gateway.close()));
    throw error;
  }
}
