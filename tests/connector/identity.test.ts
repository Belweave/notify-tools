import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenTunnelClient, OpenTunnelStorage, OpenTunnelStorageError } from "@opentunnel/client/effect";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promiseTunnelStorage } from "./storage-fixture.js";
import { connectInternal } from "../../src/connector/lifecycle.js";

describe("persistent tunnel identity", () => {
  const sdkLayer = OpenTunnelClient.layer;
  const connectedProfiles: string[] = [];
  const savedProfile = () => {
    const profile = connectedProfiles[0];
    if (!profile) throw new Error("Fixture did not connect a tunnel profile");
    return profile;
  };
  let creates: number;
  let binds: number;
  let deletes: number;
  let certificateFails: boolean;
  let deletionFails: boolean;
  let events: string[];
  const options = () => ({
    token: "identity-fixture",
    name: "dashboard",
    routes: { work: "127.0.0.1:3000" },
    relayApi: "https://relay.example",
    registerApps: false,
    fetch: send,
  });
  const send: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/tunnel" && request.method === "POST") {
      creates++;
      return Response.json(
        {
          tunnel: {
            id: `identity${creates}`,
            hostname: `identity${creates}.clawchest.com`,
            state: "offline",
          },
          token: "per-tunnel-fixture",
        },
        { status: 201 },
      );
    }
    if (path.startsWith("/api/tunnel/")) {
      expect(request.headers.get("authorization")).toBe("Bearer per-tunnel-fixture");
      if (request.method === "DELETE") {
        deletes++;
        events.push("remove");
        return new Response(null, { status: deletionFails ? 503 : 204 });
      }
      if (request.method === "POST") {
        binds++;
        return Response.json(
          { id: "certificate-fixture", state: { type: "issuing" } },
          { status: 202 },
        );
      }
      return Response.json({
        id: "certificate-fixture",
        state: certificateFails
          ? { type: "failed", reason: "fixture issuance interrupted" }
          : {
              type: "ready",
              certificate: "fixture-certificate",
              chain: "",
              expiry: new Date(Date.now() + 86_400_000).toISOString(),
            },
      });
    }
    const body = JSON.parse(await request.text());
    if (path.endsWith("/heartbeat")) events.push(body.status);
    return Response.json({ connector: { ...body, id: "conn_identity" } }, { status: 201 });
  };
  beforeEach(() => {
    creates = binds = deletes = 0;
    certificateFails = deletionFails = false;
    events = [];
    connectedProfiles.length = 0;
    // Exercise the real SDK ensure/provision/resume and its storage. Only the
    // external TLS/bridge attachment is replaced; no private keys leave the test.
    vi.spyOn(OpenTunnelClient, "layer").mockImplementation((input) => {
      const actual = sdkLayer(input);
      return Layer.effect(
        OpenTunnelClient,
        Effect.gen(function* () {
          const client = yield* OpenTunnelClient;
          return {
            ...client,
            tunnel: {
              ...client.tunnel,
              connect: (value) => {
                connectedProfiles.push(value.profile ?? "default");
                return client.tunnel
                  .ensure(value)
                  .pipe(Effect.map((tunnel) => ({ tunnel }) as never));
              },
            },
          };
        }),
      ).pipe(Layer.provide(actual));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("reuses one tunnel profile across restarts without another create or certificate bind", async () => {
    const storage = OpenTunnelStorage.memory();
    const first = await connectInternal({ ...options(), tunnelStorage: promiseTunnelStorage(storage) });
    await first.close();
    const second = await connectInternal({ ...options(), tunnelStorage: promiseTunnelStorage(storage) });
    try {
      expect(second.connector.tunnelId).toBe(first.connector.tunnelId);
      expect(second.routes[0]?.url).toBe(first.routes[0]?.url);
      expect(creates).toBe(1);
      expect(binds).toBe(1);
      expect(new Set(connectedProfiles).size).toBe(1);
      expect(deletes).toBe(0);
    } finally {
      await second.close();
    }
  });

  it("sanitises connector names into distinct filesystem-safe scoped profiles", async () => {
    const storage = OpenTunnelStorage.memory();
    for (const name of ["my app", "../escape", "a/b", "a?b", "x".repeat(200)]) {
      const handle = await connectInternal({ ...options(), name, tunnelStorage: promiseTunnelStorage(storage) });
      await handle.close();
    }
    expect(new Set(connectedProfiles).size).toBe(5);
    for (const profile of connectedProfiles) {
      expect(profile).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
      expect(profile.length).toBeLessThanOrEqual(96);
    }
    const base = options();
    for (const changed of [
      { token: "other-credential" },
      { teamId: "team_other" },
      { apiUrl: "https://other-notify.example" },
      { relayApi: "https://other-relay.example" },
      { routes: { work: "127.0.0.1:4000" } },
      { tunnelProfile: "explicit-one" },
      { tunnelProfile: "explicit-two" },
    ]) {
      const handle = await connectInternal({ ...base, ...changed, tunnelStorage: promiseTunnelStorage(storage) });
      await handle.close();
    }
    expect(new Set(connectedProfiles).size).toBe(12);
  });

  it("resumes a saved pending CSR after interrupted issuance without creating a new tunnel", async () => {
    const storage = OpenTunnelStorage.memory();
    certificateFails = true;
    await expect(connectInternal({ ...options(), tunnelStorage: promiseTunnelStorage(storage) })).rejects.toThrow(
      /issuance failed/,
    );
    expect(await Effect.runPromise(storage.profiles())).toHaveLength(1);
    certificateFails = false;
    const handle = await connectInternal({ ...options(), tunnelStorage: promiseTunnelStorage(storage) });
    try {
      expect(creates).toBe(1);
    } finally {
      await handle.close();
    }
  });

  it("retains pending identity when saving the certificate fails and resumes it on retry", async () => {
    const storage = OpenTunnelStorage.memory();
    const failing = {
      ...storage,
      save: () =>
        Effect.fail(new OpenTunnelStorageError({ message: "fixture storage unavailable" })),
    };
    await expect(connectInternal({ ...options(), tunnelStorage: promiseTunnelStorage(failing) })).rejects.toThrow(
      /storage failed/,
    );
    const profile = savedProfile();
    expect(await Effect.runPromise(storage.loadPending(profile))).toBeDefined();
    const handle = await connectInternal({ ...options(), tunnelStorage: promiseTunnelStorage(storage) });
    try {
      expect(creates).toBe(1);
    } finally {
      await handle.close();
    }
  });

  it("removes a newly created remote tunnel when its pending credential cannot be saved", async () => {
    const storage = OpenTunnelStorage.memory();
    const failing = {
      ...storage,
      savePending: () =>
        Effect.fail(new OpenTunnelStorageError({ message: "fixture pending storage unavailable" })),
    };
    await expect(connectInternal({ ...options(), tunnelStorage: promiseTunnelStorage(failing) })).rejects.toThrow(
      /storage failed/,
    );
    expect(creates).toBe(1);
    expect(deletes).toBe(1);
    expect(await Effect.runPromise(storage.profiles())).toEqual([]);
  });

  it("close retains a reusable identity and explicit removal runs offline first and retains credentials on failure", async () => {
    const storage = OpenTunnelStorage.memory();
    const handle = await connectInternal({ ...options(), tunnelStorage: promiseTunnelStorage(storage) });
    const profile = savedProfile();
    await handle.close();
    expect(deletes).toBe(0);
    expect(await Effect.runPromise(storage.load(profile))).toBeDefined();
    deletionFails = true;
    await expect(handle.removeTunnel()).rejects.toThrow();
    expect(await Effect.runPromise(storage.load(profile))).toBeDefined();
    deletionFails = false;
    await handle.removeTunnel();
    expect(await Effect.runPromise(storage.load(profile))).toBeUndefined();
    expect(events.indexOf("offline")).toBeLessThan(events.indexOf("remove"));
  });

  it("resumes a pending CSR after a crash during the final multi-file identity save", async () => {
    const home = await mkdtemp(join(tmpdir(), "notify-tunnel-pending-"));
    vi.stubEnv("XDG_DATA_HOME", home);
    try {
      certificateFails = true;
      await expect(connectInternal(options())).rejects.toThrow(/issuance failed/);
      const root = join(home, "opentunnel", savedProfile());
      await writeFile(
        join(root, "tunnel.json"),
        JSON.stringify({
          id: "identity1",
          hostname: "identity1.clawchest.com",
          certificateExpiry: new Date().toISOString(),
        }),
        { mode: 0o600 },
      );
      certificateFails = false;
      const handle = await connectInternal(options());
      try {
        expect(creates).toBe(1);
      } finally {
        await handle.removeTunnel();
      }
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it.each(["absent", "empty-ready", "empty-pending"])(
    "fails closed and preserves artifacts when %s metadata cannot identify a tunnel",
    async (kind) => {
      const home = await mkdtemp(join(tmpdir(), "notify-tunnel-incomplete-"));
      vi.stubEnv("XDG_DATA_HOME", home);
      let unexpected: Awaited<ReturnType<typeof connectInternal>> | undefined;
      try {
        const first = await connectInternal(options());
        await first.close();
        const root = join(home, "opentunnel", savedProfile());
        await rm(join(root, "tunnel.json"));
        if (kind === "empty-ready") await writeFile(join(root, "tunnel.json"), "");
        if (kind === "empty-pending") await writeFile(join(root, "pending.json"), "");
        const savedFiles = (await readdir(root)).sort();
        const savedToken = await readFile(join(root, "token"), "utf8");
        await expect(
          connectInternal(options()).then((handle) => {
            unexpected = handle;
            return handle;
          }),
        ).rejects.toThrow(/incomplete|secure/i);
        expect(creates).toBe(1);
        expect(deletes).toBe(0);
        expect((await readdir(root)).sort()).toEqual(savedFiles);
        expect((await readFile(join(root, "token"), "utf8")) === savedToken).toBe(true);
      } finally {
        await unexpected?.close();
        await rm(home, { recursive: true, force: true });
      }
    },
  );

  it("defaults to private persistent XDG storage without writing to the real home", async () => {
    const home = await mkdtemp(join(tmpdir(), "notify-tunnel-identity-"));
    vi.stubEnv("XDG_DATA_HOME", home);
    try {
      const first = await connectInternal(options());
      await first.close();
      const second = await connectInternal(options());
      await second.close();
      expect(creates).toBe(1);
      const root = join(home, "opentunnel", savedProfile());
      expect((await stat(root)).mode & 0o777).toBe(0o700);
      for (const file of await readdir(root))
        expect((await stat(join(root, file))).mode & 0o777).toBe(0o600);
      await second.removeTunnel();
      expect(await readdir(join(home, "opentunnel"))).toEqual([]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it.each(["load", "loadPending"] as const)(
    "fails closed before remote creation when a custom %s rejects",
    async (method) => {
      const storage = promiseTunnelStorage(OpenTunnelStorage.memory());
      const failing = { ...storage, [method]: async () => { throw new Error("fixture unavailable"); } };
      await expect(connectInternal({ ...options(), tunnelStorage: failing })).rejects.toThrow(
        "Custom tunnel identity storage failed",
      );
      expect(creates).toBe(0);
      expect(deletes).toBe(0);
    },
  );

  it("retains custom credentials when local removal fails after remote deletion", async () => {
    const backing = OpenTunnelStorage.memory();
    const storage = promiseTunnelStorage(backing);
    let removalFails = true;
    const handle = await connectInternal({
      ...options(),
      tunnelStorage: {
        ...storage,
        remove: async (profile) => {
          if (removalFails) throw new Error("fixture removal unavailable");
          await storage.remove(profile);
        },
      },
    });
    const profile = savedProfile();
    await expect(handle.removeTunnel()).rejects.toThrow("Custom tunnel identity storage failed");
    expect(deletes).toBe(1);
    expect(await storage.load(profile)).toBeDefined();
    removalFails = false;
    await handle.removeTunnel();
    expect(await storage.load(profile)).toBeUndefined();
  });

});
