// SPDX-License-Identifier: Apache-2.0
/** Public wire types and URL rules for the Notify connector API. */
export const DEFAULT_RELAY_DOMAIN = "clawchest.com";
export const APP_PASS_ALGORITHM = "ES256";
export const APP_PASS_JWKS_PATH = "/.well-known/jwks.json";
export const APP_PASS_JWT_TYPE = "notify-pass+jwt";
export const CALLBACK_SIGNATURE_VERSION = "v1";
export const CALLBACK_MAX_SKEW_SECONDS = 300;
export interface ConnectorRoute {
  name: string;
  target: string;
  url: string;
  appId?: string;
}
export interface ConnectorDto {
  id: string;
  name: string;
  tunnelId: string;
  hostname: string;
  routes: ConnectorRoute[];
  status: "online" | "offline" | "unknown";
  lastSeenAt: string | null;
  teamId: string | null;
  oncallGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ConnectorCreatedResponse {
  connector: ConnectorDto;
  callbackSecret?: string;
  reused?: boolean;
}
export interface CallbackTarget {
  connectorId: string;
  route: string;
  path: string;
}
export function isRouteName(value: unknown): value is string {
  return (
    typeof value === "string" && /^(@|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/.test(value.trim())
  );
}
const normalizeDomain = (domain: string) =>
  domain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
export function relayApiOrigin(domain = DEFAULT_RELAY_DOMAIN): string {
  return `https://api.${normalizeDomain(domain)}`;
}
export function tunnelHostname(id: string, route?: string, domain = DEFAULT_RELAY_DOMAIN): string {
  const labels = [id.trim().toLowerCase(), normalizeDomain(domain)];
  if (route && route !== "@") labels.unshift(route.trim().toLowerCase());
  return labels.join(".");
}
export function tunnelOrigin(id: string, route?: string, domain = DEFAULT_RELAY_DOMAIN): string {
  return `https://${tunnelHostname(id, route, domain)}`;
}
export function resolveCallbackTargetUrl(
  id: string,
  target: CallbackTarget,
  domain = DEFAULT_RELAY_DOMAIN,
): string {
  const pathname = target.path.startsWith("/") ? target.path : `/${target.path}`;
  return tunnelOrigin(id, target.route, domain) + pathname;
}
