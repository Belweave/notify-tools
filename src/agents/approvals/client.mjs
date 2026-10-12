// SPDX-License-Identifier: Apache-2.0
import { runNotify } from "./process.mjs";

export const WAIT_DURATION = "5m";

export const REQUIRED_PERMISSION_SCOPES = [
  "notifications:send",
  "interactions:create",
  "interactions:read",
];

export async function notifyAuthenticationStatus() {
  const result = await runNotify(["auth", "status"], undefined, true);
  if (result.code !== 0) {
    return {
      authenticated: false,
      scopes: [],
      missingScopes: [...REQUIRED_PERMISSION_SCOPES],
    };
  }
  const body = JSON.parse(result.output);
  const scopes = Array.isArray(body?.token?.scopes) ? body.token.scopes : [];
  return {
    authenticated: body?.authenticated === true,
    scopes,
    missingScopes: REQUIRED_PERMISSION_SCOPES.filter((scope) => !scopes.includes(scope)),
  };
}

export async function checkNotifyAuthentication() {
  const status = await notifyAuthenticationStatus();
  return status.authenticated && status.missingScopes.length === 0;
}

export async function askNotifyPermission({ title, body, imageUrl, idempotencyKey }) {
  try {
    const result = await runNotify(
      [
        "send",
        "ask",
        "--stdin",
        "--approval",
        "--wait",
        "--timeout",
        WAIT_DURATION,
        "--expires-in",
        WAIT_DURATION,
        "--idempotency-key",
        idempotencyKey,
      ],
      JSON.stringify({
        prompt: body,
        title,
        ...(imageUrl ? { imageUrl } : {}),
      }),
    );
    return result.code === 0 ? "approved" : "denied";
  } catch {
    return "denied";
  }
}
