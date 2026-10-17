// SPDX-License-Identifier: Apache-2.0
import { activityDesign, activityDesignCatalog } from "../../live-activities/design.mjs";
import { parseDuration } from "../foundation/arguments.mjs";
import { UsageError } from "../foundation/errors.mjs";
import { readStdinJson } from "../foundation/input.mjs";
import { dispatchExitCode } from "../foundation/results.mjs";
import { request, scopedRequest } from "../foundation/transport.mjs";
import {
  designFromOptions,
  readDesignFile,
  parseAccentColor,
  parseNonNegativeInteger,
  parseStyle,
} from "../foundation/validation.mjs";

export async function handleActivity(context) {
  const { action, id, options, config } = context;
  if (["designs", "design", "validate-design"].includes(action)) {
    if (options["design-file"] || options["clear-design"]) throw new UsageError("Design catalog commands do not accept --design-file or --clear-design");
    if (action === "designs") return { body: activityDesignCatalog(), exitCode: 0 };
    if (!id) throw new UsageError(`activity ${action} requires ${action === "design" ? "a template name" : "a standalone design JSON file"}`);
    if (action === "validate-design") return { body: { valid: true, design: await readDesignFile(id) }, exitCode: 0 };
    try { return { body: activityDesign(id), exitCode: 0 }; }
    catch (error) { throw new UsageError(error.message); }
  }
  if ((options["design-file"] || options["clear-design"]) && !["start", "update"].includes(action)) throw new UsageError("Design flags apply only to activity start/update");
  if (action === "feed") {
    const query = new URLSearchParams();
    if (options.filter) query.set("filter", options.filter);
    if (options.page) query.set("page", parseNonNegativeInteger(options.page, "page"));
    const suffix = query.size > 0 ? `?${query}` : "";
    return {
      body: await scopedRequest(config, `/api/agent/activity-feed${suffix}`),
      exitCode: 0,
    };
  }
  if (action === "list") {
    const limit = options.limit ? Number.parseInt(options.limit, 10) : 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new UsageError("--limit must be an integer from 1 to 100");
    }
    return {
      body: await request(config, `/api/agent/activities?limit=${limit}`),
      exitCode: 0,
    };
  }
  if (action === "get") {
    const identifier = id ?? options.key;
    if (!identifier) throw new UsageError("activity get requires an activity ID or --key");
    return {
      body: await request(config, `/api/agent/activities/${encodeURIComponent(identifier)}`),
      exitCode: 0,
    };
  }
  if (action === "start") {
    const stdin = options.stdin ? await readStdinJson() : {};
    const progress = options.progress === undefined ? stdin.progress : Number(options.progress);
    if (progress !== undefined && (!Number.isFinite(progress) || progress < 0 || progress > 1)) {
      throw new UsageError("--progress must be a number from 0 to 1");
    }
    const title = options.title ?? stdin.title;
    const status = options.status ?? stdin.status;
    if (!title || !status) throw new UsageError("activity start requires --title and --status");
    if (stdin.style !== undefined) parseStyle(stdin.style);
    const payload = {
      ...stdin,
      ...await designFromOptions(options, stdin, { kind: "progress", update: action === "update" }),
      title,
      status,
      ...(options.key ? { key: options.key } : {}),
      ...(options.replace ? { replace: true } : {}),
      ...(options.subtitle ? { subtitle: options.subtitle } : {}),
      ...(options.detail ? { detail: options.detail } : {}),
      ...(progress !== undefined ? { progress } : {}),
      ...(options.symbol ? { symbol: options.symbol } : {}),
      ...(options.privacy ? { privacyMode: options.privacy } : {}),
      ...(options["accent-color"]
        ? { accentColor: parseAccentColor(options["accent-color"]) }
        : {}),
      ...(options.style ? { style: parseStyle(options.style) } : {}),
      ...(options.device.length > 0 ? { deviceIds: options.device } : {}),
      ...(options.group ? { group: options.group } : {}),
      ...(options["expires-in"] ? { expiresInSeconds: parseDuration(options["expires-in"]) } : {}),
      ...(options["stale-after"]
        ? { staleAfterSeconds: parseDuration(options["stale-after"]) }
        : {}),
    };
    const body = await request(config, "/api/agent/activities", {
      method: "POST",
      headers: options["idempotency-key"]
        ? { "Idempotency-Key": options["idempotency-key"] }
        : undefined,
      body: JSON.stringify(payload),
    });
    return { body, exitCode: dispatchExitCode(body) };
  }
  if (action === "update") {
    const identifier = id ?? options.key;
    if (!identifier) throw new UsageError("activity update requires an activity ID or --key");
    const stdin = options.stdin ? await readStdinJson() : {};
    const progress = options.progress === undefined ? stdin.progress : Number(options.progress);
    if (
      progress !== undefined &&
      progress !== null &&
      (!Number.isFinite(progress) || progress < 0 || progress > 1)
    ) {
      throw new UsageError("--progress must be a number from 0 to 1");
    }
    const ifSequence =
      options["if-sequence"] === undefined
        ? stdin.ifSequence
        : Number.parseInt(options["if-sequence"], 10);
    if (ifSequence !== undefined && (!Number.isInteger(ifSequence) || ifSequence < 0)) {
      throw new UsageError("--if-sequence must be a non-negative integer");
    }
    if (options.subtitle && options["clear-subtitle"])
      throw new UsageError("--subtitle conflicts with --clear-subtitle");
    const priority = options.priority ?? stdin.priority;
    if (priority !== undefined && !["normal", "high"].includes(priority))
      throw new UsageError("--priority must be normal or high");
    if (stdin.style !== undefined) parseStyle(stdin.style);
    const payload = {
      ...stdin,
      ...await designFromOptions(options, stdin, { kind: "progress", update: action === "update" }),
      ...(priority !== undefined ? { priority } : {}),
      ...(options.title ? { title: options.title } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(options.subtitle ? { subtitle: options.subtitle } : {}),
      ...(options["clear-subtitle"] ? { subtitle: null } : {}),
      ...(options.detail ? { detail: options.detail } : {}),
      ...(progress !== undefined ? { progress } : {}),
      ...(options.symbol ? { symbol: options.symbol } : {}),
      ...(options.privacy ? { privacyMode: options.privacy } : {}),
      ...(options["accent-color"]
        ? { accentColor: parseAccentColor(options["accent-color"]) }
        : {}),
      ...(options.style ? { style: parseStyle(options.style) } : {}),
      ...(options["stale-after"]
        ? { staleAfterSeconds: parseDuration(options["stale-after"]) }
        : {}),
      ...(ifSequence !== undefined ? { ifSequence } : {}),
    };
    const body = await request(config, `/api/agent/activities/${encodeURIComponent(identifier)}`, {
      method: "PATCH",
      headers: options["idempotency-key"]
        ? { "Idempotency-Key": options["idempotency-key"] }
        : undefined,
      body: JSON.stringify(payload),
    });
    return { body, exitCode: dispatchExitCode(body) };
  }
  if (action === "end") {
    const identifier = id ?? options.key;
    if (!identifier) throw new UsageError("activity end requires an activity ID or --key");
    const stdin = options.stdin ? await readStdinJson() : {};
    if (Object.hasOwn(stdin, "design")) throw new UsageError("design applies only to activity start/update");
    const ifSequence =
      options["if-sequence"] === undefined
        ? stdin.ifSequence
        : Number.parseInt(options["if-sequence"], 10);
    if (ifSequence !== undefined && (!Number.isInteger(ifSequence) || ifSequence < 0)) {
      throw new UsageError("--if-sequence must be a non-negative integer");
    }
    if (options.subtitle && options["clear-subtitle"])
      throw new UsageError("--subtitle conflicts with --clear-subtitle");
    const payload = {
      ...stdin,
      ...(options.status ? { status: options.status } : {}),
      ...(options.subtitle ? { subtitle: options.subtitle } : {}),
      ...(options["clear-subtitle"] ? { subtitle: null } : {}),
      ...(options.detail ? { detail: options.detail } : {}),
      ...(options.progress !== undefined ? { progress: Number(options.progress) } : {}),
      ...(options.symbol ? { symbol: options.symbol } : {}),
      ...(options["accent-color"]
        ? { accentColor: parseAccentColor(options["accent-color"]) }
        : {}),
      ...(options["dismiss-after"]
        ? { dismissAfterSeconds: parseDuration(options["dismiss-after"]) }
        : {}),
      ...(ifSequence !== undefined ? { ifSequence } : {}),
    };
    const body = await request(
      config,
      `/api/agent/activities/${encodeURIComponent(identifier)}/end`,
      {
        method: "POST",
        headers: options["idempotency-key"]
          ? { "Idempotency-Key": options["idempotency-key"] }
          : undefined,
        body: JSON.stringify(payload),
      },
    );
    return { body, exitCode: dispatchExitCode(body) };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
