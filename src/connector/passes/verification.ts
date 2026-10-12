// SPDX-License-Identifier: Apache-2.0
import {
  APP_PASS_ALGORITHM,
  APP_PASS_JWKS_PATH,
  APP_PASS_JWT_TYPE,
  APP_PASS_TTL_SECONDS,
  TEAM_ROLES,
} from "../protocol.js";
import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";

export interface PassVerifyOptions {
  /** Notify origin that publishes JWKS (the pass `iss`). */
  issuer?: string;
  /** Route origin the pass is bound to (`aud`). */
  audience: string;
  /** Expected registered app and workspace, when known by the service. */
  appId?: string;
  teamId?: string | null;
}

export interface NotifyPassClaims extends JWTPayload {
  app_id: string;
  sub: string;
  jti: string;
  exp: number;
  iat: number;
  team_id?: string;
  team_role?: string;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(issuer: string) {
  const url = `${issuer}${APP_PASS_JWKS_PATH}`;
  let keys = jwksCache.get(url);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, keys);
  }
  return keys;
}

export async function verifyNotifyPass(
  token: string,
  options: PassVerifyOptions,
): Promise<NotifyPassClaims> {
  const issuer = (options.issuer ?? "https://notify.belweave.ai").replace(/\/$/, "");
  const issuerUrl = new URL(issuer);
  if (
    issuerUrl.origin !== issuer ||
    issuerUrl.username ||
    issuerUrl.password ||
    (issuerUrl.protocol !== "https:" &&
      !(issuerUrl.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(issuerUrl.hostname)))
  ) {
    throw new Error(
      "Notify issuer must be an exact HTTPS origin (HTTP loopback is allowed for local tests)",
    );
  }
  const { payload, protectedHeader } = await jwtVerify(token, jwks(issuer), {
    issuer,
    audience: options.audience,
    algorithms: [APP_PASS_ALGORITHM],
    requiredClaims: ["exp", "iat", "sub", "jti", "app_id"],
  });
  if (protectedHeader.typ !== APP_PASS_JWT_TYPE) {
    throw new Error("Invalid Notify pass type");
  }
  if (
    payload.aud !== options.audience ||
    new URL(options.audience).origin !== options.audience ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    typeof payload.jti !== "string" ||
    !payload.jti ||
    typeof payload.app_id !== "string" ||
    !payload.app_id ||
    typeof payload.exp !== "number" ||
    !Number.isSafeInteger(payload.exp) ||
    typeof payload.iat !== "number" ||
    !Number.isSafeInteger(payload.iat) ||
    payload.iat > Math.floor(Date.now() / 1000) ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > APP_PASS_TTL_SECONDS ||
    (payload.team_id === undefined && payload.team_role !== undefined) ||
    (options.appId !== undefined && payload.app_id !== options.appId) ||
    (options.teamId !== undefined && (payload.team_id ?? null) !== options.teamId) ||
    (payload.team_id !== undefined &&
      (typeof payload.team_id !== "string" ||
        !payload.team_id ||
        typeof payload.team_role !== "string" ||
        !(TEAM_ROLES as readonly string[]).includes(payload.team_role)))
  ) {
    throw new Error("Invalid Notify pass claims");
  }
  return payload as NotifyPassClaims;
}
