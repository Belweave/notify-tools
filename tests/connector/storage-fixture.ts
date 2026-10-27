import { OpenTunnelStorage } from "@opentunnel/client/effect";
import { Effect } from "effect";
import type { TunnelStorage } from "../../src/connector/storage.js";

export function promiseTunnelStorage(storage: OpenTunnelStorage.OpenTunnelStorage): TunnelStorage {
  return {
    profiles: () => Effect.runPromise(storage.profiles()),
    load: (profile) => Effect.runPromise(storage.load(profile)),
    save: (profile, identity) => Effect.runPromise(storage.save(profile, identity)),
    loadPending: (profile) => Effect.runPromise(storage.loadPending(profile)),
    savePending: (profile, identity) => Effect.runPromise(storage.savePending(profile, identity)),
    remove: (profile) => Effect.runPromise(storage.remove(profile)),
    list: () => Effect.runPromise(storage.list()),
  };
}
