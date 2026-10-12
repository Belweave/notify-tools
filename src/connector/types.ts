// SPDX-License-Identifier: Apache-2.0
import { type ConnectorDto, type ConnectorRoute } from "./protocol.js";

export interface TunnelSession {
  id: string;
  hostname: string;
  close: () => Promise<void>;
}

export interface TunnelFactory {
  connect: (routes: Record<string, string>, fetchImpl: typeof fetch) => Promise<TunnelSession>;
}

export interface ConnectOptions {
  token: string;
  name: string;
  routes: Record<string, string>;
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
