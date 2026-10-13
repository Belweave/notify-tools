import { afterEach, describe, expect, it, vi } from "vitest";
import { connectMicroAuth, microAuth, supportsMicroAuth } from "../../src/microauth/browser.js";

const challenge = "c".repeat(43);
afterEach(() => vi.unstubAllGlobals());
function page(bridge = vi.fn(async () => "header.payload.signature")) {
  vi.stubGlobal("window", {
    location: {
      href: "https://site.example/start",
      origin: "https://site.example",
    },
    notify: { version: 3, microAuth: bridge },
  });
  return bridge;
}
describe("optional browser integration", () => {
  it("does no network or sign-in work outside Notify", async () => {
    vi.stubGlobal("window", { location: { origin: "https://site.example" } });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(supportsMicroAuth()).toBe(false);
    expect(
      await connectMicroAuth({
        challengePath: "/challenge",
        sessionPath: "/session",
      }),
    ).toEqual({ available: false });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(microAuth({ challenge })).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
  });
  it("never downgrades to the old unbound getToken API", async () => {
    const legacy = vi.fn();
    vi.stubGlobal("window", { notify: { getToken: legacy } });
    await expect(microAuth({ challenge })).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });
    expect(legacy).not.toHaveBeenCalled();
  });
  it("exchanges the pass only in a same-origin POST body with cookies and no redirects", async () => {
    const bridge = page();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ challenge }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetcher);
    expect(
      await connectMicroAuth({
        challengePath: "/challenge",
        sessionPath: "/session",
        fields: ["phone"],
      }),
    ).toEqual({ available: true });
    expect(bridge).toHaveBeenCalledWith({ challenge, fields: ["phone"] });
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://site.example/session",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
        body: JSON.stringify({ token: "header.payload.signature" }),
      }),
    );
  });
  it.each([
    "https://evil.example/session",
    "//evil.example/session",
    "https://user:pass@site.example/session",
    "/session#fragment",
  ])("rejects foreign or ambiguous endpoints: %s", async (sessionPath) => {
    const bridge = page();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      connectMicroAuth({ challengePath: "/challenge", sessionPath }),
    ).rejects.toMatchObject({ code: "INVALID_ENDPOINT" });
    expect(bridge).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects malformed challenges and fields before requesting native sign-in", async () => {
    const bridge = page();
    await expect(microAuth({ challenge: "short" })).rejects.toMatchObject({
      code: "INVALID_CHALLENGE",
    });
    await expect(microAuth({ challenge, fields: ["password" as "name"] })).rejects.toMatchObject({
      code: "INVALID_FIELDS",
    });
    expect(bridge).not.toHaveBeenCalled();
  });
});

import { notifyMini } from "../../src/microauth/browser.js";

describe("packaged mini-app storage detection", () => {
  it("is safe outside browsers and rejects incomplete brokers", () => {
    vi.stubGlobal("window", undefined);
    expect(notifyMini()).toBeUndefined();
    vi.stubGlobal("window", { notifyMini: { storage: { get() {} } } });
    expect(notifyMini()).toBeUndefined();
  });
  it("returns the broker without storage, network or authentication side effects", async () => {
    const storage = { get: vi.fn(async () => null), set: vi.fn(async () => null), remove: vi.fn(async () => null) };
    const microAuth = vi.fn();
    const fetcher = vi.fn();
    const bridge = { storage };
    vi.stubGlobal("window", { notifyMini: bridge, notify: { microAuth } });
    vi.stubGlobal("fetch", fetcher);
    expect(notifyMini()).toBe(bridge);
    expect(storage.get).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(microAuth).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await notifyMini()?.storage.get("missing")).toBeNull();
  });
});
