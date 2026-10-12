// SPDX-License-Identifier: Apache-2.0
import { createHash, randomUUID } from "node:crypto";

export function stableIdempotencyKey(prefix, values) {
  const digest = createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0, 40);
  return `${prefix}-${digest}`;
}

export function uniqueIdempotencyKey(prefix) {
  return stableIdempotencyKey(prefix, [randomUUID()]);
}
