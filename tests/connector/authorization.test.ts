import { describe, expect, it } from "vitest";
import { authorizeRelayCreate } from "../../src/connector/transport/authorization.js";

describe("relay credential boundary", () => {
  it("never authorizes a lookalike host, userinfo, sibling route or GET", async () => {
    const seen: Headers[] = [];
    const send: typeof fetch = async (input, init) => {
      seen.push(
        new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)),
      );
      return Response.json({});
    };
    const authorized = authorizeRelayCreate("https://relay.example", "test-token", send);
    for (const target of [
      "https://relay.example.attacker.test/api/tunnel",
      "https://relay.example@attacker.test/api/tunnel",
      "https://relay.example/api/tunnel/other",
      "https://user@relay.example/api/tunnel",
    ])
      await authorized(target, { method: "POST" });
    await authorized("https://relay.example/api/tunnel");
    expect(seen.every((headers) => !headers.has("authorization"))).toBe(true);
  });
  it("preserves explicit auth and Request method/body while adding exact-origin auth", async () => {
    const seen: Request[] = [];
    const send: typeof fetch = async (input, init) => {
      seen.push(new Request(input, init));
      return Response.json({});
    };
    const authorized = authorizeRelayCreate("https://relay.example", "test-token", send);
    await authorized(
      new Request("https://relay.example/api/tunnel", {
        method: "POST",
        body: "payload",
      }),
    );
    await authorized("https://relay.example/api/tunnel", {
      method: "POST",
      headers: { authorization: "Bearer chosen-token" },
    });
    expect(seen[0]?.headers.get("authorization")).toBe("Bearer test-token");
    expect(await seen[0]?.text()).toBe("payload");
    expect(seen[1]?.headers.get("authorization")).toBe("Bearer chosen-token");
  });
});
