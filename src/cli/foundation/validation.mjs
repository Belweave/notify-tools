// SPDX-License-Identifier: Apache-2.0
import { open } from "node:fs/promises";
import { ACTIVITY_DESIGN_MAX_BYTES, parseActivityDesign, validateActivityDesign } from "../../live-activities/design.mjs";
import { UsageError } from "./errors.mjs";

export function parseAccentColor(value) {
  if (!/^#[0-9a-fA-F]{6}$/.test(String(value))) {
    throw new UsageError("--accent-color must use #RRGGBB format");
  }
  return String(value);
}

export const ACTIVITY_STYLES = ["standard", "ring", "hero", "terminal", "steps"];

export const INTERACTIVE_ACTIVITY_STYLES = ["approval", "shell", "verdict", "signal"];

export function parseStyle(value) {
  if (!ACTIVITY_STYLES.includes(String(value))) {
    throw new UsageError(`--style must be one of: ${ACTIVITY_STYLES.join(", ")}`);
  }
  return String(value);
}

export function parseInteractiveStyle(value) {
  if (!INTERACTIVE_ACTIVITY_STYLES.includes(String(value))) {
    throw new UsageError(
      `--style must be one of: ${INTERACTIVE_ACTIVITY_STYLES.join(", ")} for --live-activity`,
    );
  }
  return String(value);
}

export function parseActionLabel(value, flag) {
  const label = String(value).trim();
  if (
    label.length === 0 ||
    Array.from(label).length > 24 ||
    Array.from(label).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    throw new UsageError(`--${flag} must be a single line of 1 to 24 characters`);
  }
  return label;
}

/** Server limits for notification bodies: 8,000 characters and 16 KiB of UTF-8. */
export const BODY_MAX_CHARS = 8000;

export const BODY_MAX_BYTES = 16384;

export function assertNotificationBody(value) {
  const body = String(value).trim();
  if (body.length === 0) throw new UsageError("send requires a message body");
  if (body.length > BODY_MAX_CHARS || Buffer.byteLength(body, "utf8") > BODY_MAX_BYTES) {
    throw new UsageError(
      `send body must be at most ${BODY_MAX_CHARS} characters and ${BODY_MAX_BYTES} bytes of UTF-8`,
    );
  }
  return String(value);
}

export function resolveBodyFormat(options) {
  const explicit = options["body-format"];
  if (explicit !== undefined && explicit !== "text" && explicit !== "markdown") {
    throw new UsageError("--body-format must be text or markdown");
  }
  if (options.markdown && explicit === "text") {
    throw new UsageError("--markdown conflicts with --body-format text");
  }
  if (options.markdown) return "markdown";
  return explicit;
}

export function requireId(id, usage) {
  if (!id) throw new UsageError(`${usage} requires an ID`);
  return encodeURIComponent(id);
}

export function parseNonNegativeInteger(value, flag) {
  if (!/^\d+$/.test(String(value))) {
    throw new UsageError(`--${flag} must be a non-negative integer`);
  }
  return String(Number.parseInt(value, 10));
}

export function parseMembers(value) {
  const members = String(value)
    .split(",")
    .map((member) => member.trim())
    .filter(Boolean);
  if (members.length === 0) throw new UsageError("--members needs at least one user ID");
  return members;
}

export function parseIdList(value, flag) {
  const ids = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (ids.length === 0) throw new UsageError(`--${flag} needs at least one ID`);
  return ids;
}

export function rotationFromOptions(options, stdinRotation) {
  const rotation = {
    ...(stdinRotation ?? {}),
    ...(options.members ? { memberIds: parseMembers(options.members) } : {}),
    ...(options.period ? { period: options.period } : {}),
    ...(options.handoff ? { handoffAt: options.handoff } : {}),
    ...(options.timezone ? { timezone: options.timezone } : {}),
    ...(options["starts-at"] ? { startsAt: options["starts-at"] } : {}),
  };
  return Object.keys(rotation).length > 0 ? rotation : undefined;
}

/** Bounded read even if the file grows between stat and read. */
export async function readDesignFile(path, kind) {
  const file = await open(path, "r").catch((error) => { throw new UsageError(`Cannot open design file ${path}: ${error.code ?? "read failed"}`); });
  try {
    const buffer = Buffer.alloc(ACTIVITY_DESIGN_MAX_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > ACTIVITY_DESIGN_MAX_BYTES) throw new UsageError(`Design file must be at most ${ACTIVITY_DESIGN_MAX_BYTES} bytes`);
    try { return parseActivityDesign(buffer.subarray(0, length).toString("utf8"), { kind }); }
    catch (error) { throw new UsageError(error.message); }
  } finally { await file.close(); }
}

export async function designFromOptions(options, stdin, { kind, update = false } = {}) {
  if (options["clear-design"] && !update) throw new UsageError("--clear-design is only valid for activity update");
  if (options["design-file"] && Object.hasOwn(stdin, "design")) throw new UsageError("--design-file conflicts with stdin design; choose one");
  if (options["clear-design"] && (options["design-file"] || Object.hasOwn(stdin, "design"))) throw new UsageError("--clear-design conflicts with --design-file or stdin design");
  if (options["clear-design"]) return { design: null };
  if (options["design-file"]) return { design: await readDesignFile(options["design-file"], kind) };
  if (!Object.hasOwn(stdin, "design")) return {};
  if (stdin.design === null && update) return { design: null };
  try { return { design: validateActivityDesign(stdin.design, { kind }) }; }
  catch (error) { throw new UsageError(error.message); }
}
