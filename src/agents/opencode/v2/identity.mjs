import { createHash } from "node:crypto";

export function key(request) {
  return `${request.sessionID}:${request.id}`;
}

export function decisionKey(request, location) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request.sessionID,
        location?.directory ?? null,
        request.action,
        [...(request.resources ?? [])].sort(),
      ]),
    )
    .digest("hex");
}

export function fingerprint(request) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request.id,
        request.sessionID,
        request.action,
        request.resources,
        request.save ?? null,
        request.source ?? null,
      ]),
    )
    .digest("hex");
}
