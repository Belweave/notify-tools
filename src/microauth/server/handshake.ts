// SPDX-License-Identifier: Apache-2.0
import { MicroAuthError, validChallenge } from "../protocol.js";
import { httpsOrigin, string, invalid } from "./binding.js";
import { sharedProfile } from "./identity.js";
import { MicroAuthChallengeStore, MicroAuthChallenge, MicroAuthIdentity } from "./types.js";
import { type JWTVerifyGetKey, createRemoteJWKSet, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";

export function createMicroAuthServer(config: {
  origin: string;
  appId: string;
  store: MicroAuthChallengeStore;
  issuer?: string;
  /** Trusted server configuration only, e.g. a pinned JWKS for isolated tests. */
  keys?: JWTVerifyGetKey;
}) {
  const issuer = httpsOrigin(config.issuer ?? "https://notify.belweave.ai");
  const origin = httpsOrigin(config.origin);
  if (!string(config.appId, 256))
    throw new MicroAuthError("INVALID_CONFIG", "Set your registered Notify app ID.");
  const keys = config.keys ?? createRemoteJWKSet(new URL("/.well-known/jwks.json", issuer));
  return {
    async begin(binding: string): Promise<MicroAuthChallenge> {
      if (!validChallenge(binding))
        throw new MicroAuthError("INVALID_BINDING", "Use a random browser-session binding.");
      const challenge = {
        challenge: randomBytes(32).toString("base64url"),
        expiresAt: Date.now() + 120000,
      };
      await config.store.put(binding, challenge);
      return challenge;
    },
    async complete(token: string, binding: string): Promise<MicroAuthIdentity> {
      if (!validChallenge(binding) || !string(token, 32768)) return invalid();
      const pending = await config.store.get(binding);
      if (
        !pending ||
        !validChallenge(pending.challenge) ||
        !Number.isFinite(pending.expiresAt) ||
        pending.expiresAt <= Date.now()
      )
        return invalid();
      let verified: Awaited<ReturnType<typeof jwtVerify>>;
      try {
        verified = await jwtVerify(token, keys, {
          algorithms: ["ES256"],
          issuer,
          audience: origin,
          typ: "notify-pass+jwt",
          maxTokenAge: 120,
          clockTolerance: 0,
          requiredClaims: ["iss", "aud", "sub", "iat", "exp", "jti", "app_id", "nonce"],
        });
      } catch {
        return invalid();
      }
      const { payload } = verified;
      if (
        payload.aud !== origin ||
        payload.app_id !== config.appId ||
        payload.nonce !== pending.challenge ||
        !string(payload.sub, 256) ||
        !string(payload.jti, 128) ||
        typeof payload.iat !== "number" ||
        !Number.isInteger(payload.iat) ||
        typeof payload.exp !== "number" ||
        !Number.isInteger(payload.exp) ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > 120
      )
        return invalid();
      const identity: MicroAuthIdentity = {
        subject: payload.sub,
        issuer,
        appId: config.appId,
      };
      for (const field of ["name", "email"] as const) {
        if (payload[field] !== undefined) {
          if (!string(payload[field], 320)) return invalid();
          identity[field] = payload[field];
        }
      }
      if (payload.profile !== undefined) identity.profile = sharedProfile(payload.profile);
      if (payload.team_id !== undefined || payload.team_role !== undefined) {
        if (
          !string(payload.team_id, 256) ||
          !["owner", "admin", "member"].includes(String(payload.team_role))
        )
          return invalid();
        identity.team = {
          id: payload.team_id,
          role: payload.team_role as "owner" | "admin" | "member",
        };
      }
      if (
        pending.expiresAt <= Date.now() ||
        !(await config.store.consume(binding, pending.challenge))
      )
        return invalid();
      return identity;
    },
  };
}
