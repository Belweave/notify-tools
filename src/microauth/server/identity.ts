// SPDX-License-Identifier: Apache-2.0
import { type SharedProfile } from "../protocol.js";
import { invalid, string } from "./binding.js";

export function sharedProfile(value: unknown): SharedProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  const raw = value as Record<string, unknown>;
  const result: SharedProfile = {};
  for (const field of ["phone", "timeZone", "pronouns"] as const) {
    if (raw[field] !== undefined) {
      if (!string(raw[field], 100)) return invalid();
      result[field] = raw[field];
    }
  }
  if (raw.custom !== undefined) {
    if (!Array.isArray(raw.custom) || raw.custom.length > 20) return invalid();
    result.custom = raw.custom.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
      const field = value as Record<string, unknown>;
      if (
        !string(field.id, 64) ||
        !/^field_[a-f0-9]{32}$/.test(field.id) ||
        !string(field.label, 80) ||
        !string(field.value, 512)
      )
        return invalid();
      return { id: field.id, label: field.label, value: field.value };
    });
  }
  return result;
}
