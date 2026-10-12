// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "./errors.mjs";

export function parseDuration(value) {
  const match = String(value).match(/^(\d+(?:\.\d+)?)(s|m|h|d)?$/);
  if (!match) throw new UsageError(`Invalid duration: ${value}`);
  const amount = Number(match[1]);
  const multiplier =
    match[2] === "d" ? 86_400 : match[2] === "h" ? 3600 : match[2] === "m" ? 60 : 1;
  return Math.round(amount * multiplier);
}

export function parseArgs(argv) {
  const positionals = [];
  const options = { device: [], scope: [] };
  /** Index in `positionals` where post-`--` arguments start, or null. */
  let separatorAt = null;
  const valueFlags = new Set([
    "title",
    "image",
    "url",
    "device",
    "expires-in",
    "idempotency-key",
    "timeout",
    "client-name",
    "scope",
    "key",
    "status",
    "subtitle",
    "detail",
    "progress",
    "symbol",
    "privacy",
    "accent-color",
    "style",
    "stale-after",
    "dismiss-after",
    "if-sequence",
    "limit",
    "primary-label",
    "secondary-label",
    "project",
    "summary",
    "body-format",
    "name",
    "icon",
    "app",
    "cursor",
    "filter",
    "page",
    "team",
    "family",
    "email",
    "role",
    "members",
    "period",
    "handoff",
    "timezone",
    "starts-at",
    "ends-at",
    "user",
    "body",
    "dedup-key",
    "host",
    "proxy-protocol",
    "note",
    "oncall",
    "group",
    "domain",
    "retention",
    "devices",
    "webhook",
    "reply-webhook",
    "preset",
  ]);
  const booleanFlags = new Set([
    "clear-subtitle",
    "approval",
    "yes-no",
    "text",
    "wait",
    "poll",
    "replace",
    "json",
    "stdin",
    "help",
    "open",
    "no-open",
    "live-activity",
    "markdown",
    "unread",
    "no-icon",
    "no-project",
    "personal",
    "all",
    "no-notify",
    "auto-join",
    "no-auto-join",
    "no-domain",
    "no-retention",
    "enabled",
    "disabled",
    "no-reply-webhook",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (separatorAt === null && argument === "--") {
      separatorAt = positionals.length;
      continue;
    }
    if (separatorAt !== null || !argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const [rawName, inline] = argument.slice(2).split("=", 2);
    if (valueFlags.has(rawName)) {
      const value = inline ?? argv[++index];
      if (!value || value.startsWith("--")) throw new UsageError(`--${rawName} requires a value`);
      if (rawName === "device" || rawName === "scope") options[rawName].push(value);
      else options[rawName] = value;
    } else if (booleanFlags.has(rawName) && inline === undefined) {
      options[rawName] = true;
    } else {
      throw new UsageError(`Unknown option: --${rawName}`);
    }
  }
  return { positionals, options, separatorAt };
}
