// SPDX-License-Identifier: Apache-2.0
import { type ConnectorDto, type ConnectorRoute } from "./protocol.js";

export type ProxyProtocol = "v1" | "v2";
export type ConnectorRouteTarget = string | { target: string; proxyProtocol?: ProxyProtocol };

export interface TunnelSession {
  id: string;
  hostname: string;
  close: () => Promise<void>;
}

export interface TunnelFactory {
  connect: (routes: Record<string, ConnectorRouteTarget>, fetchImpl: typeof fetch) => Promise<TunnelSession>;
}

export interface ConnectOptions {
  token: string;
  name: string;
  routes: Record<string, ConnectorRouteTarget>;
  apiUrl?: string;
  relayDomain?: string;
  relayApi?: string;
  teamId?: string;
  oncallGroupId?: string;
  fetch?: typeof fetch;
  tunnel?: TunnelFactory;
  heartbeatMs?: number;
  registerApps?: boolean;
  onWarning?: (message: string) => void;
}

export interface ConnectorHandle {
  connector: ConnectorDto;
  callbackSecret?: string;
  reused: boolean;
  routes: ConnectorRoute[];
  close: () => Promise<void>;
}
