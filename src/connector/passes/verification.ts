// SPDX-License-Identifier: Apache-2.0
import { APP_PASS_JWKS_PATH, APP_PASS_ALGORITHM, APP_PASS_JWT_TYPE } from "../protocol.js";
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from "jose";

export interface PassVerifyOptions {
  /** Notify origin that publishes JWKS (the pass `iss`). */
  issuer?: string;
  /** Route origin the pass is bound to (`aud`). */
  audience: string;
}

export interface NotifyPassClaims extends JWTPayload {
  app_id?: string;
  team_id?: string;
  team_role?: string;
}

export const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function jwks(issuer: string) {
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
  const { payload, protectedHeader } = await jwtVerify(token, jwks(issuer), {
    issuer,
    audience: options.audience,
    algorithms: [APP_PASS_ALGORITHM],
    requiredClaims: ["exp"],
  });
  if (protectedHeader.typ !== APP_PASS_JWT_TYPE) {
    throw new Error("Invalid Notify pass type");
  }
  return payload as NotifyPassClaims;
}
