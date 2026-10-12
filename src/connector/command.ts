// SPDX-License-Identifier: Apache-2.0
import { connectInternal } from "./lifecycle.js";
import { type ConnectorDto, type ConnectorRoute, isRouteName } from "./protocol.js";
import { TunnelFactory } from "./types.js";

export async function runConnect(input: {
  token: string;
  apiUrl?: string;
  port: number;
  name: string;
  host?: string;
  teamId?: string;
  oncallGroupId?: string;
  relayDomain?: string;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  tunnel?: TunnelFactory;
}): Promise<{
  body: {
    connector: ConnectorDto;
    routes: ConnectorRoute[];
    callbackSecret?: string;
    reused: boolean;
  };
  exitCode: number;
}> {
  if (!isRouteName(input.name)) {
    throw new Error("--name must be a DNS label or @");
  }
  const target = `${input.host ?? "127.0.0.1"}:${input.port}`;
  const handle = await connectInternal({
    token: input.token,
    apiUrl: input.apiUrl,
    name: input.name,
    routes: { [input.name]: target },
    teamId: input.teamId,
    oncallGroupId: input.oncallGroupId,
    relayDomain: input.relayDomain,
    fetch: input.fetch,
    tunnel: input.tunnel,
  });
  const closed = new Promise<void>((resolve) => {
    if (!input.signal) return;
    if (input.signal.aborted) {
      void handle.close().then(resolve);
      return;
    }
    input.signal.addEventListener(
      "abort",
      () => {
        void handle.close().then(resolve);
      },
      { once: true },
    );
  });
  if (input.signal) await closed;
  return {
    body: {
      connector: handle.connector,
      routes: handle.routes,
      callbackSecret: handle.callbackSecret,
      reused: handle.reused,
    },
    exitCode: 0,
  };
}
