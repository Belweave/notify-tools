import { createHash } from "node:crypto";

export function jobKey(serverUrl, directory, requestID) {
  return `${serverUrl}:${directory}:${requestID}`;
}

export function normalize(request) {
  return {
    id: request.id,
    sessionID: request.sessionID,
    action: request.permission ?? request.type ?? "permission",
    resources: request.patterns ?? (request.pattern ? [request.pattern] : []),
    save: request.always ?? [],
    source: request.tool
      ? { messageID: request.tool.messageID, callID: request.tool.callID }
      : request.messageID && request.callID
        ? { messageID: request.messageID, callID: request.callID }
        : undefined,
  };
}

export function fingerprint(request) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request.id,
        request.sessionID,
        request.action,
        request.resources,
        request.save,
        request.source ?? null,
      ]),
    )
    .digest("hex");
}
