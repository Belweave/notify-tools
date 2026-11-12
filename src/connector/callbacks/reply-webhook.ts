// SPDX-License-Identifier: Apache-2.0
import { createHmac, timingSafeEqual } from "node:crypto";

/** Header carrying `t=<unix seconds>,v1=<hex HMAC-SHA256>` on reply-webhook deliveries. */
export const REPLY_WEBHOOK_SIGNATURE_HEADER = "x-notify-signature";
/** Stable across retries of one delivery: deduplicate on it. */
export const REPLY_WEBHOOK_DELIVERY_HEADER = "x-notify-delivery-id";
/** Deliveries older than this, or from the future, are rejected. */
export const REPLY_WEBHOOK_MAX_AGE_SECONDS = 300;

function mac(secret: string, timestamp: string, body: string | Uint8Array): Buffer {
  return createHmac("sha256", secret).update(`${timestamp}.`, "utf8").update(body).digest();
}

/** Builds a signature header value; useful for tests of a receiver. */
export function signReplyWebhook(secret: string, timestamp: string, body: string | Uint8Array): string {
  return `t=${timestamp},v1=${mac(secret, timestamp, body).toString("hex")}`;
}

/**
 * Verifies a saved reply-webhook delivery. Pass the exact raw request bytes
 * (or the undecoded string) before any JSON parsing: re-serialised JSON does
 * not match the signature. Returns false for a malformed, stale, future or
 * forged signature; it does not deduplicate deliveries.
 */
export function verifyReplyWebhookSignature(input: {
  secret: string;
  body: string | Uint8Array;
  signature: string | null | undefined;
  now?: number;
  maxAgeSeconds?: number;
}): boolean {
  if (!input.secret || typeof input.signature !== "string") return false;
  const match = /^t=(\d{1,16}),v1=([a-f0-9]{64})$/.exec(input.signature);
  if (!match) return false;
  const [, timestamp, hex] = match;
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  const age = nowSeconds - Number(timestamp);
  if (!Number.isSafeInteger(Number(timestamp)) || age < 0 || age > (input.maxAgeSeconds ?? REPLY_WEBHOOK_MAX_AGE_SECONDS)) {
    return false;
  }
  const expected = mac(input.secret, timestamp, input.body);
  return timingSafeEqual(expected, Buffer.from(hex, "hex"));
}
