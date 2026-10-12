// SPDX-License-Identifier: Apache-2.0
import { MicroAuthError } from "./errors.js";
import { MicroAuthOptions, MICRO_AUTH_FIELDS } from "./types.js";

export function validChallenge(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

export function validateOptions(options: MicroAuthOptions): void {
  if (!validChallenge(options?.challenge))
    throw new MicroAuthError("INVALID_CHALLENGE", "Use a fresh challenge from your server.");
  if (
    options.fields !== undefined &&
    (!Array.isArray(options.fields) ||
      options.fields.length > 6 ||
      options.fields.some((field) => !MICRO_AUTH_FIELDS.includes(field)))
  )
    throw new MicroAuthError("INVALID_FIELDS", "Choose supported profile fields.");
}
