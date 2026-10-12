// SPDX-License-Identifier: Apache-2.0
import { MicroAuthError, type MicroAuthOptions } from "../protocol.js";
import { supportsMicroAuth, microAuth } from "./bridge.js";

export function sameOriginPath(path: string): string {
  const url = new URL(path, window.location.href);
  if (url.origin !== window.location.origin || url.username || url.password || url.hash)
    throw new MicroAuthError("INVALID_ENDPOINT", "microAuth() endpoints must be on this website.");
  return url.href;
}

/** Completes a same-origin cookie session handshake; ordinary browsers return unavailable. */
export async function connectMicroAuth(options: {
  challengePath: string;
  sessionPath: string;
  fields?: MicroAuthOptions["fields"];
  signal?: AbortSignal;
}): Promise<{ available: false } | { available: true }> {
  if (!supportsMicroAuth()) return { available: false };
  const challengeUrl = sameOriginPath(options.challengePath);
  const sessionUrl = sameOriginPath(options.sessionPath);
  const init: RequestInit = {
    method: "POST",
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    signal: options.signal,
  };
  const challengeResponse = await fetch(challengeUrl, { ...init, body: "{}" });
  if (!challengeResponse.ok)
    throw new MicroAuthError("CHALLENGE_FAILED", "Your server could not start sign-in.");
  const challenge = (await challengeResponse.json()) as { challenge?: unknown };
  if (typeof challenge?.challenge !== "string")
    throw new MicroAuthError("INVALID_CHALLENGE", "Your server did not return a challenge.");
  options.signal?.throwIfAborted();
  const token = await microAuth({
    challenge: challenge.challenge,
    fields: options.fields,
  });
  options.signal?.throwIfAborted();
  const sessionResponse = await fetch(sessionUrl, {
    ...init,
    body: JSON.stringify({ token }),
  });
  if (!sessionResponse.ok)
    throw new MicroAuthError("SESSION_FAILED", "Your server did not accept sign-in. Try again.");
  return { available: true };
}
