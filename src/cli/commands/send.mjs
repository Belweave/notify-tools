// SPDX-License-Identifier: Apache-2.0
import { parseDuration } from "../foundation/arguments.mjs";
import { UsageError } from "../foundation/errors.mjs";
import { readStdinJson } from "../foundation/input.mjs";
import {
  POLL_TIMEOUT_SECONDS,
  dispatchExitCode,
  interactionExitCode,
  pageExitCode,
  waitForInteraction,
} from "../foundation/results.mjs";
import { request, scopedRequest } from "../foundation/transport.mjs";
import {
  assertNotificationBody,
  designFromOptions,
  parseActionLabel,
  parseAccentColor,
  parseInteractiveStyle,
  resolveBodyFormat,
} from "../foundation/validation.mjs";

export async function handleSend(context) {
  const { group, positionals, options, separatorAt, config, runtime } = context;
  if (group === "send" || group === "notify") {
    // A first positional of exactly `ask` or `withdraw` selects the subcommand
    // unless it came after a bare `--`, which forces it to be the literal body.
    const isSubcommand = separatorAt === null || separatorAt > 1;
    if (positionals[1] === "withdraw" && isSubcommand) {
      if (options["design-file"] || options["clear-design"]) throw new UsageError("Design flags apply only to send ask --live-activity");
      if (positionals.length !== 3) {
        throw new UsageError(
          'send withdraw takes exactly one notification ID; use "notify send -- withdraw ..." to send that text',
        );
      }
      const path = `/api/agent/notifications/${encodeURIComponent(positionals[2])}/withdraw`;
      return {
        body: await scopedRequest(config, path, { method: "POST" }),
        exitCode: 0,
      };
    }
    const isAsk = positionals[1] === "ask" && isSubcommand;
    if (isAsk) {
      const selectors = [
        options.approval ? "approval" : null,
        options["yes-no"] ? "yes_no" : null,
        options.text ? "reply" : null,
      ].filter(Boolean);
      if (selectors.length !== 1) {
        throw new UsageError(
          "send ask requires exactly one response type: --approval, --yes-no, or --text",
        );
      }
      if (options.poll && (options.wait || options.timeout !== undefined)) {
        throw new UsageError("--poll cannot be combined with --wait or --timeout");
      }
      if (options.timeout !== undefined && !options.wait) {
        throw new UsageError("--timeout requires --wait");
      }
      if (
        options.project ||
        options.summary ||
        options.markdown ||
        options["body-format"] ||
        options.app
      ) {
        throw new UsageError(
          "--project, --summary, --markdown, --body-format, and --app apply to send, not send ask",
        );
      }
      const stdin = options.stdin ? await readStdinJson() : {};
      const prompt = positionals.slice(2).join(" ") || stdin.prompt;
      if (!prompt) throw new UsageError("send ask requires a prompt");
      const expiresInSeconds = parseDuration(options["expires-in"] ?? stdin.expiresIn ?? "15m");
      const liveActivity = options["live-activity"] || stdin.presentation === "live_activity";
      if (liveActivity && selectors[0] === "reply") {
        throw new UsageError("--live-activity supports --approval or --yes-no, not --text");
      }
      if (!liveActivity && (options["primary-label"] || options["secondary-label"])) {
        throw new UsageError("custom action labels require --live-activity");
      }
      if (!liveActivity && (options["design-file"] || options["clear-design"] || Object.hasOwn(stdin, "design"))) throw new UsageError("design requires send ask --live-activity");
      if (stdin.style !== undefined) parseInteractiveStyle(stdin.style);
      if (!liveActivity && (options.style || stdin.style !== undefined)) {
        throw new UsageError("interactive --style requires --live-activity");
      }
      if (!liveActivity && options["accent-color"] !== undefined) {
        throw new UsageError("--accent-color requires send ask --live-activity");
      }
      if (liveActivity && expiresInSeconds > 28_800) {
        throw new UsageError("--live-activity requests must expire within 8 hours");
      }
      const payload = {
        ...stdin,
        ...await designFromOptions(options, stdin, { kind: "ask" }),
        title: options.title ?? stdin.title ?? "Notify",
        prompt,
        kind: selectors[0],
        expiresInSeconds,
        ...(liveActivity ? { presentation: "live_activity" } : {}),
        ...(liveActivity && options.style ? { style: parseInteractiveStyle(options.style) } : {}),
        ...(liveActivity && options["accent-color"] ? { accentColor: parseAccentColor(options["accent-color"]) } : {}),
        ...(options["primary-label"]
          ? {
              primaryLabel: parseActionLabel(options["primary-label"], "primary-label"),
            }
          : {}),
        ...(options["secondary-label"]
          ? {
              secondaryLabel: parseActionLabel(options["secondary-label"], "secondary-label"),
            }
          : {}),
        ...(options.image ? { imageUrl: options.image } : {}),
        ...(options.url ? { url: options.url } : {}),
        ...(options.device.length > 0 ? { deviceIds: options.device } : {}),
        ...(options.group ? { group: options.group } : {}),
        ...(options.webhook ? { webhookId: options.webhook } : {}),
      };
      if (options.group && options.device.length > 0) {
        throw new UsageError("--group cannot be combined with --device");
      }
      const body = await request(config, "/api/agent/interactions", {
        method: "POST",
        headers: options["idempotency-key"]
          ? { "Idempotency-Key": options["idempotency-key"] }
          : undefined,
        body: JSON.stringify(payload),
      });
      if (dispatchExitCode(body) === 7) return { body, exitCode: 7 };
      if (!options.wait && !options.poll) return { body, exitCode: 0 };
      const timeout = options.poll
        ? POLL_TIMEOUT_SECONDS
        : parseDuration(options.timeout ?? `${expiresInSeconds}s`);
      const waited = await waitForInteraction(config, body.interaction.id, timeout, runtime);
      return {
        body: {
          ...body,
          interaction: waited.interaction,
          timedOut: waited.timedOut ?? false,
        },
        exitCode: waited.timedOut ? 4 : interactionExitCode(waited.interaction),
      };
    }
    const stdin = options.stdin ? await readStdinJson() : {};
    if (options["design-file"] || options["clear-design"] || Object.hasOwn(stdin, "design")) throw new UsageError("design applies to send ask --live-activity, not send");
    const notificationBody = positionals.slice(1).join(" ") || stdin.body;
    if (!notificationBody) throw new UsageError("send requires a message body");
    assertNotificationBody(notificationBody);
    const bodyFormat = resolveBodyFormat(options);
    const payload = {
      ...stdin,
      body: notificationBody,
      ...(options.title ? { title: options.title } : {}),
      ...(options.image ? { imageUrl: options.image } : {}),
      ...(options.url ? { url: options.url } : {}),
      ...(options.device.length > 0 ? { deviceIds: options.device } : {}),
      ...(options.project ? { project: options.project } : {}),
      ...(options.summary ? { summary: options.summary } : {}),
      ...(bodyFormat ? { bodyFormat } : {}),
      ...(options.app ? { appId: options.app } : {}),
      ...(options.oncall ? { oncall: options.oncall } : {}),
      ...(options.group ? { group: options.group } : {}),
    };
    if (options.oncall && options.device.length > 0) {
      throw new UsageError("--oncall cannot be combined with --device");
    }
    if (options.group && (options.device.length > 0 || options.oncall)) {
      throw new UsageError("--group cannot be combined with --device or --oncall");
    }
    const body = await request(config, "/api/agent/notifications", {
      method: "POST",
      headers: options["idempotency-key"]
        ? { "Idempotency-Key": options["idempotency-key"] }
        : undefined,
      body: JSON.stringify(payload),
    });
    if (options.oncall) return { body, exitCode: pageExitCode(body) };
    return { body, exitCode: dispatchExitCode(body) };
  }

  throw new UsageError("Unknown command. Run notify --help.");
}
