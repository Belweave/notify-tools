// SPDX-License-Identifier: Apache-2.0

export class UsageError extends Error {}

export class RequestError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** Raised when Ctrl-C stops a wait; carries the last known result. */
export class InterruptedError extends Error {
  constructor(message, result) {
    super(message);
    this.result = result;
  }
}

// Credential shapes that must never reach a terminal or log, even inside an
// upstream error message: API keys, webhook URL tokens, bearer headers.
const SECRET_PATTERNS = [
  /\b(ntf|ak|ncb|sk|pk)_[A-Za-z0-9_-]{8,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
  /(\/hooks\/)[A-Za-z0-9_-]+/g,
];

export function redact(text) {
  let value = String(text);
  for (const pattern of SECRET_PATTERNS) {
    value = value.replace(pattern, (match, prefix) =>
      typeof prefix === "string" && prefix.startsWith("/") ? `${prefix}[redacted]` : "[redacted]",
    );
  }
  return value;
}

function hintFor(error) {
  if (error instanceof UsageError) return "Run notify <command> --help for usage and an example.";
  if (!(error instanceof RequestError)) return undefined;
  const code = error.body?.error ?? error.body?.code;
  if (error.status === 0) {
    return "Check your network connection and NOTIFY_API_URL, then run notify doctor.";
  }
  if (code === "access_denied") return "The person declined. Run notify auth login again if that was a mistake.";
  if (code === "expired_token") return "Run the command again and approve within the time shown.";
  if (error.status === 401) {
    return "Sign in with notify auth login (or set NOTIFY_TOKEN). notify doctor shows what is configured.";
  }
  if (error.status === 403) {
    const required = Array.isArray(error.body?.required) ? error.body.required : [];
    if (required.length > 0) {
      return `Grant the missing scope: notify auth login ${required.map((scope) => `--scope ${scope}`).join(" ")} (repeat --scope for every scope you still need).`;
    }
    return "Your role or token does not allow this. Check notify auth status and the team role.";
  }
  if (error.status === 404) return "Check the ID. Resources outside your account are reported as not found.";
  if (error.status === 409) {
    return "An Idempotency-Key was reused for different content, or the state changed. Use a new --idempotency-key for a new event.";
  }
  if (error.status === 429) {
    const retry = error.body?.retryAfter ?? error.body?.interval;
    return `Rate limited. Retry later${retry ? ` (after ${retry}s)` : ""}; do not loop.`;
  }
  if (error.status >= 500) return "Notify had a temporary problem. Retry the same command; idempotent writes are safe to repeat.";
  if (error.status === 400 && error.body?.issues) return "The server rejected a field; see issues in --json output.";
  return undefined;
}

/** A stable, secret-free description of a failure for stderr. */
export function describeError(error) {
  const message = redact(error instanceof Error ? error.message : "Unexpected error");
  let exitCode = 1;
  let type = "error";
  if (error instanceof UsageError) {
    exitCode = 2;
    type = "usage";
  } else if (error instanceof InterruptedError) {
    exitCode = 130;
    type = "interrupted";
  } else if (error instanceof RequestError) {
    type = "api";
    if (error.body?.error === "access_denied") {
      exitCode = 5;
      type = "denied";
    } else if (error.status === 408 || error.body?.error === "expired_token") {
      exitCode = 4;
      type = "timeout";
    } else if (error.status === 401 || error.status === 403) {
      exitCode = 3;
      type = "auth";
    } else if (error.status === 0) {
      exitCode = 6;
      type = "network";
    }
  }
  const status = error instanceof RequestError ? error.status : undefined;
  const code = error instanceof RequestError ? (error.body?.code ?? error.body?.error) : undefined;
  const issues = error instanceof RequestError ? error.body?.issues : undefined;
  const required = error instanceof RequestError ? error.body?.required : undefined;
  return {
    exitCode,
    error: {
      type,
      message,
      ...(status !== undefined ? { status } : {}),
      ...(typeof code === "string" && code !== error.message ? { code: redact(code) } : {}),
      ...(Array.isArray(required) ? { required } : {}),
      ...(issues !== undefined ? { issues: JSON.parse(redact(JSON.stringify(issues))) } : {}),
      ...(hintFor(error) ? { hint: hintFor(error) } : {}),
    },
  };
}
