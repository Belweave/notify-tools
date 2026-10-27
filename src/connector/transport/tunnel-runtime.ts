// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, lstat, mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { relayApiOrigin, DEFAULT_RELAY_DOMAIN } from "../protocol.js";
import type { ConnectorRouteTarget, ConnectOptions, TunnelSession } from "../types.js";
import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { FetchHttpClient } from "effect/http";
import { OpenTunnelClient, OpenTunnelStorage, OpenTunnelStorageError } from "@opentunnel/client/effect";
import type { TunnelStorage } from "../storage.js";
import { authorizeRelayCreate, secureControlOrigin } from "./authorization.js";

const DEFAULT_API = "https://notify.belweave.ai";

/** Profiles must not alias across Notify credentials, workspaces or relay origins. */
function tunnelProfile(options: ConnectOptions, relayApi: string): string {
  const label = options.tunnelProfile ?? options.name;
  const safe =
    label
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+/, "")
      .slice(0, 24) || "connector";
  const scope = JSON.stringify({
    relay: secureControlOrigin(relayApi),
    domain: options.relayDomain ?? DEFAULT_RELAY_DOMAIN,
    notify: secureControlOrigin(options.apiUrl ?? DEFAULT_API),
    credential: createHash("sha256").update(options.token).digest("hex"),
    team: options.teamId ?? null,
    name: options.name,
    profile: options.tunnelProfile ?? null,
    // Never use the random loopback gateway ports as persistent identity inputs.
    routes: Object.entries(options.routes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => [
        name,
        typeof value === "string" ? value : value.target,
        typeof value === "string" ? null : (value.proxyProtocol ?? null),
      ]),
  });
  return `${safe}-${createHash("sha256").update(scope).digest("hex")}`;
}

/** SDK xdg uses private modes on creation; also secure existing files before reuse. */
function persistentTunnelStorage(): OpenTunnelStorage.OpenTunnelStorage {
  const storage = OpenTunnelStorage.xdg();
  const root = join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), "opentunnel");
  const secure = (profile: string, reading = false) =>
    Effect.tryPromise({
      try: async () => {
        const directory = join(root, profile);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const info = await lstat(directory);
        if (!info.isDirectory() || info.isSymbolicLink())
          throw new Error("Unsafe tunnel identity directory");
        await chmod(directory, 0o700);
        await access(directory, constants.W_OK);
        const present: string[] = [];
        for (const file of [
          "tunnel.json",
          "pending.json",
          "token",
          "private-key.pem",
          "certificate.pem",
          "chain.pem",
        ]) {
          const path = join(directory, file);
          const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return undefined;
            throw error;
          });
          if (!info) continue;
          if (!info.isFile() || info.isSymbolicLink())
            throw new Error("Unsafe tunnel identity file");
          await chmod(path, 0o600);
          present.push(file);
        }
        if (reading && present.length) {
          // SDK loaders treat absent/empty metadata as a new profile. Preserve
          // surviving credentials after a crash instead of overwriting them.
          let identified = false;
          for (const file of ["pending.json", "tunnel.json"]) {
            if (!present.includes(file)) continue;
            const raw = await readFile(join(directory, file), "utf8");
            if (!raw.trim()) continue;
            try {
              const metadata = JSON.parse(raw);
              if (
                metadata &&
                typeof metadata.id === "string" &&
                metadata.id &&
                typeof metadata.hostname === "string" &&
                metadata.hostname &&
                (file === "pending.json"
                  ? typeof metadata.csr === "string" && !!metadata.csr
                  : typeof metadata.certificateExpiry === "string" &&
                    Number.isFinite(Date.parse(metadata.certificateExpiry)))
              )
                identified = true;
            } catch {
              /* The SDK may still resume a valid pending manifest. */
            }
          }
          if (!identified)
            throw new Error("Incomplete tunnel identity metadata; preserve profile for recovery");
        }
      },
      catch: (cause) =>
        new OpenTunnelStorageError({ message: "Cannot secure tunnel identity storage", cause }),
    });
  return {
    ...storage,
    // save() publishes several files before deleting pending.json. If the
    // process crashes mid-save, the durable CSR remains the recovery authority.
    load: (profile) =>
      secure(profile, true).pipe(
        Effect.flatMap(() => storage.loadPending(profile)),
        Effect.flatMap((pending) => (pending ? Effect.succeed(undefined) : storage.load(profile))),
      ),
    loadPending: (profile) =>
      secure(profile, true).pipe(Effect.flatMap(() => storage.loadPending(profile))),
    save: (profile, identity) =>
      secure(profile).pipe(Effect.flatMap(() => storage.save(profile, identity))),
    savePending: (profile, identity) =>
      secure(profile).pipe(Effect.flatMap(() => storage.savePending(profile, identity))),
  };
}

/** Keep SDK effects behind the lazy runtime and public stores dependency-free. */
function customTunnelStorage(storage: TunnelStorage): OpenTunnelStorage.OpenTunnelStorage {
  const operation = <A>(run: () => Promise<A>) =>
    Effect.tryPromise({
      try: run,
      catch: (cause) => new OpenTunnelStorageError({ message: "Custom tunnel identity storage failed", cause }),
    });
  return {
    profiles: () => operation(() => storage.profiles()),
    load: (profile) => operation(() => storage.load(profile)),
    save: (profile, identity) => operation(() => storage.save(profile, identity)),
    loadPending: (profile) => operation(() => storage.loadPending(profile)),
    savePending: (profile, identity) => operation(() => storage.savePending(profile, identity)),
    remove: (profile) => operation(() => storage.remove(profile)),
    list: () => operation(() => storage.list()),
  };
}

/** Each tunnel owns its transport, credentials, and cleanup scope. */
export async function defaultTunnelFactory(
  options: ConnectOptions,
  routes: Record<string, ConnectorRouteTarget>,
  fetchImpl: typeof fetch,
): Promise<TunnelSession> {
  const relayApi = options.relayApi ?? relayApiOrigin(options.relayDomain ?? DEFAULT_RELAY_DOMAIN);
  const authorized = authorizeRelayCreate(relayApi, options.token, fetchImpl);
  const profile = tunnelProfile(options, relayApi);
  const backingStorage = options.tunnelStorage
    ? customTunnelStorage(options.tunnelStorage)
    : persistentTunnelStorage();
  // Fail before creating a remote tunnel if existing credentials cannot be read
  // or the default storage directory cannot be secured/written.
  const existing = await Effect.runPromise(backingStorage.load(profile));
  const pending = await Effect.runPromise(backingStorage.loadPending(profile));
  const removeRemote = async (credential: { id: string; token: string }) => {
    const response = await fetchImpl(
      new URL(`/api/tunnel/${encodeURIComponent(credential.id)}`, relayApi),
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${credential.token}` },
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok && response.status !== 404)
      throw new Error(`Tunnel removal failed (${response.status})`);
  };
  const storage: OpenTunnelStorage.OpenTunnelStorage = {
    ...backingStorage,
    savePending: (name, identity) =>
      backingStorage.savePending(name, identity).pipe(
        Effect.catch((error) =>
          Effect.promise(async () => {
            // A new create whose token cannot be persisted must not be abandoned.
            // Never delete a reusable identity during a certificate re-provision.
            if (!existing && !pending) {
              try {
                await removeRemote(identity);
                await Effect.runPromise(backingStorage.remove(name));
              } catch {
                // Retain any partial files for recovery if removal itself failed.
                (options.onWarning ?? console.warn)(
                  `Could not remove unsaved tunnel ${identity.id}; operator cleanup is required.`,
                );
              }
            }
          }).pipe(Effect.andThen(Effect.fail(error))),
        ),
      ),
  };
  const layer = OpenTunnelClient.layer({ api: relayApi, storage }).pipe(
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
      Effect.flatMap(OpenTunnelClient, (client) => client.tunnel.connect({ routes, profile })).pipe(
        Effect.provideService(Scope.Scope, scope),
      ),
    );
    return {
      id: connection.tunnel.id,
      hostname: connection.tunnel.hostname,
      close,
      remove: async () => {
        // The SDK remove path ignores pending-only identities. Preserve both on
        // failure so an interrupted provision or removal can be retried safely.
        const identity = await Effect.runPromise(storage.load(profile));
        const pending = await Effect.runPromise(storage.loadPending(profile));
        const credential = identity ?? pending;
        if (!credential) return;
        await removeRemote(credential);
        await Effect.runPromise(storage.remove(profile));
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
