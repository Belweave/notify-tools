// SPDX-License-Identifier: Apache-2.0
import { MicroAuthError } from "../protocol.js";
import { randomBytes } from "node:crypto";

/** Put this random binding in an HttpOnly, Secure, SameSite cookie; never read it from a request body. */
export function createMicroAuthBinding(): string {
  return randomBytes(32).toString("base64url");
}

export function httpsOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.origin !== value)
    throw new MicroAuthError(
      "INVALID_CONFIG",
      "Configure an exact HTTPS origin without a path or trailing slash.",
    );
  return url.origin;
}

export function string(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= limit;
}

export function invalid(): never {
  throw new MicroAuthError("INVALID_PASS", "The microAuth() pass was not accepted.");
}
