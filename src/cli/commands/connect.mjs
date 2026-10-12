// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "../foundation/errors.mjs";
import { writeConnectorSecret } from "../session/credentials.mjs";

export async function handleConnect(context) {
  const { action, options, config, env, runtime, overrides } = context;
  {
    const port = Number(action);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new UsageError("connect requires a PORT");
    }
    if (!options.name) throw new UsageError("connect requires --name");
    if (!/^(@|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/.test(options.name)) {
      throw new UsageError("--name must be a DNS label or @");
    }
    const connector = overrides.connector ?? (await import("../../connector/index.ts"));
    let handle;
    try {
      handle = await connector.connectInternal({
        token: config.token,
        apiUrl: config.apiUrl,
        name: options.name,
        routes: { [options.name]: `${options.host ?? "127.0.0.1"}:${port}` },
        teamId: options.team,
        relayDomain: env.NOTIFY_RELAY_DOMAIN,
        fetch: overrides.fetch ?? globalThis.fetch,
        tunnel: overrides.tunnel,
      });
    } catch (error) {
      if (/Insufficient scope/i.test(String(error))) {
        throw new UsageError(
          "connect needs connectors:write. Re-login with: notify auth login --scope connectors:write",
        );
      }
      throw error;
    }
    if (handle.callbackSecret) {
      runtime.stderr(
        `callbackSecret (shown once): ${handle.callbackSecret}\nStore it to verify HMAC-signed approval callbacks.`,
      );
      if (config.source === "file") {
        await writeConnectorSecret(config.path, handle.connector.id, handle.callbackSecret);
      }
    }
    const body = {
      connector: handle.connector,
      routes: handle.routes,
      reused: handle.reused === true,
    };
    if (overrides.detach) {
      await handle.close();
      return { body, exitCode: 0 };
    }
    await new Promise((resolve) => {
      const stop = () => {
        void handle.close().then(resolve);
      };
      process.once("SIGINT", stop);
      process.once("SIGTERM", stop);
    });
    return { body, exitCode: 0 };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
