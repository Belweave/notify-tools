// SPDX-License-Identifier: Apache-2.0

export const MICRO_AUTH_FIELDS = [
  "name",
  "email",
  "phone",
  "timeZone",
  "pronouns",
  "custom",
] as const;

export type MicroAuthField = (typeof MICRO_AUTH_FIELDS)[number];

export interface MicroAuthOptions {
  challenge: string;
  fields?: readonly MicroAuthField[];
}

export interface SharedProfile {
  phone?: string;
  timeZone?: string;
  pronouns?: string;
  custom?: Array<{ id: string; label: string; value: string }>;
}
