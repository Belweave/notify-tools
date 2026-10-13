// SPDX-License-Identifier: Apache-2.0
import { type MicroAuthOptions, validateOptions, MicroAuthError } from "../protocol.js";

export interface NotifyAppBridge {
  readonly version: number;
  microAuth?: (options: MicroAuthOptions) => Promise<string>;
  getToken?: () => Promise<string>;
  close?: () => void;
  capabilities?: () => Promise<Record<string, unknown>>;
  haptics?: (
    style: "light" | "medium" | "heavy" | "soft" | "rigid" | "success" | "warning" | "error",
  ) => Promise<unknown>;
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<{ ok: boolean }>;
  openSettings?: () => Promise<unknown>;
}

/** Feature detection only. Importing the SDK never starts sign-in or changes the page. */
export function notifyApp(): NotifyAppBridge | undefined {
  return typeof window === "undefined"
    ? undefined
    : (window as unknown as { notify?: NotifyAppBridge }).notify;
}

export function supportsMicroAuth(): boolean {
  return typeof notifyApp()?.microAuth === "function";
}

/** Returns a credential for your server. A returned token is not a browser session. */
export async function microAuth(options: MicroAuthOptions): Promise<string> {
  validateOptions(options);
  const bridge = notifyApp();
  if (!bridge?.microAuth)
    throw new MicroAuthError(
      "UNAVAILABLE",
      "Use this site's regular sign-in, or open it in an updated Notify app.",
    );
  const token = await bridge.microAuth({
    challenge: options.challenge,
    fields: options.fields ?? [],
  });
  if (typeof token !== "string" || token.length > 32768 || token.split(".").length !== 3)
    throw new MicroAuthError("INVALID_RESPONSE", "microAuth() returned an invalid pass.");
  return token;
}

export interface NotifyMiniBridge {
  readonly storage: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<null>;
    remove(key: string): Promise<null>;
  };
}

/** Detects the optional packaged-app storage broker without calling it or authenticating. */
export function notifyMini(): NotifyMiniBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const bridge = (window as unknown as { notifyMini?: NotifyMiniBridge }).notifyMini;
  return bridge && typeof bridge.storage?.get === "function" &&
    typeof bridge.storage.set === "function" && typeof bridge.storage.remove === "function"
    ? bridge : undefined;
}
