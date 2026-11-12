import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signReplyWebhook, verifyReplyWebhookSignature } from "../../src/connector/index.js";

const secret = "fixture-signing-secret";
const body = Buffer.from('{"type":"interaction.answered","interaction":{"id":"int_fixture","status":"approved"}}');
const now = 1_790_000_000_000;
const timestamp = String(Math.floor(now / 1000) - 10);

describe("reply webhook signatures", () => {
  it("accepts the documented t=,v1= HMAC over timestamp.rawBody", () => {
    const hex = createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex");
    const signature = `t=${timestamp},v1=${hex}`;
    expect(signReplyWebhook(secret, timestamp, body)).toBe(signature);
    expect(verifyReplyWebhookSignature({ secret, body, signature, now })).toBe(true);
    expect(verifyReplyWebhookSignature({ secret, body: body.toString("utf8"), signature, now })).toBe(true);
  });

  it("rejects tampering, wrong secrets, stale, future and malformed headers", () => {
    const signature = signReplyWebhook(secret, timestamp, body);
    const altered = Buffer.from(body.toString().replace("approved", "denied"));
    expect(verifyReplyWebhookSignature({ secret, body: altered, signature, now })).toBe(false);
    expect(verifyReplyWebhookSignature({ secret: "other", body, signature, now })).toBe(false);
    expect(verifyReplyWebhookSignature({ secret, body, signature, now: now + 301_000 })).toBe(false);
    expect(verifyReplyWebhookSignature({ secret, body, signature, now: now - 60_000 })).toBe(false);
    for (const value of [undefined, null, "", "v1=abc", `t=${timestamp}`, signature.toUpperCase(), `${signature},v0=1`]) {
      expect(verifyReplyWebhookSignature({ secret, body, signature: value, now })).toBe(false);
    }
    expect(verifyReplyWebhookSignature({ secret: "", body, signature, now })).toBe(false);
  });
});
