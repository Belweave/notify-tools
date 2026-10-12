// SPDX-License-Identifier: Apache-2.0
import { CALLBACK_SIGNATURE_VERSION, CALLBACK_MAX_SKEW_SECONDS } from "../protocol.js";
import { createHmac, timingSafeEqual } from "node:crypto";

export function signCallbackBody(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

export function verifyCallbackSignature(input: {
  secret: string;
  body: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  now?: number;
  maxSkewSeconds?: number;
}): boolean {
  if (!input.timestamp || !input.signature) return false;
  if (!/^\d{10,16}$/.test(input.timestamp)) return false;
  const prefix = `${CALLBACK_SIGNATURE_VERSION}=`;
  if (!input.signature.startsWith(prefix)) return false;
  if (!/^[a-fA-F0-9]{64}$/.test(input.signature.slice(prefix.length))) return false;
  const expected = signCallbackBody(input.secret, input.timestamp, input.body);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(input.signature.slice(prefix.length), "hex");
  if (expectedBuf.length === 0 || expectedBuf.length !== providedBuf.length) return false;
  if (!timingSafeEqual(expectedBuf, providedBuf)) return false;
  const nowSec = Math.floor((input.now ?? Date.now()) / 1000);
  const skew = input.maxSkewSeconds ?? CALLBACK_MAX_SKEW_SECONDS;
  const age = nowSec - Number(input.timestamp);
  return age >= 0 && age <= skew;
}
