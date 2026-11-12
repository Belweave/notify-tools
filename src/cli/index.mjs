// SPDX-License-Identifier: Apache-2.0
import { assertSupportedNode } from "../runtime/node.mjs";
import { parseArgs } from "./foundation/arguments.mjs";
import { InterruptedError, UsageError, describeError } from "./foundation/errors.mjs";
import { sleep } from "./foundation/results.mjs";
import { help } from "./help.mjs";
import { ALIASES, EXIT_CODES, commandGroups, commandHelp, completionScript } from "./reference.mjs";
import { login, openBrowser } from "./session/authorize.mjs";
import { loadConfig, writeConfig } from "./session/credentials.mjs";
import { VERSION } from "./version.mjs";

const commandModules = {
  "mini-apps": () => import("./commands/mini-apps.mjs").then((module) => module.handleMiniApps),
  connect: () => import("./commands/connect.mjs").then((module) => module.handleConnect),
  connectors: () => import("./commands/connectors.mjs").then((module) => module.handleConnectors),
  auth: () => import("./commands/auth.mjs").then((module) => module.handleAuth),
  devices: () => import("./commands/devices.mjs").then((module) => module.handleDevices),
  webhooks: () => import("./commands/webhooks.mjs").then((module) => module.handleWebhooks),
  services: () => import("./commands/services.mjs").then((module) => module.handleServices),
  inbox: () => import("./commands/inbox.mjs").then((module) => module.handleInbox),
  billing: () => import("./commands/billing.mjs").then((module) => module.handleBilling),
  tokens: () => import("./commands/tokens.mjs").then((module) => module.handleTokens),
  events: () => import("./commands/events.mjs").then((module) => module.handleEvents),
  interaction: () =>
    import("./commands/interaction.mjs").then((module) => module.handleInteraction),
  activity: () => import("./commands/activity.mjs").then((module) => module.handleActivity),
  apps: () => import("./commands/apps.mjs").then((module) => module.handleApps),
  families: () => import("./commands/families.mjs").then((module) => module.handleFamilies),
  teams: () => import("./commands/teams.mjs").then((module) => module.handleTeams),
  groups: () => import("./commands/groups.mjs").then((module) => module.handleGroups),
  oncall: () => import("./commands/oncall.mjs").then((module) => module.handleOncall),
  page: () => import("./commands/page.mjs").then((module) => module.handlePage),
  pages: () => import("./commands/pages.mjs").then((module) => module.handlePages),
  send: () => import("./commands/send.mjs").then((module) => module.handleSend),
};
commandModules.notify = commandModules.send;

/** Commands that work without credentials. */
const offline = {
  doctor: () => import("./commands/doctor.mjs").then((module) => module.handleDoctor),
  skills: () => import("./commands/skills.mjs").then((module) => module.handleSkills),
};

function interruptHandler(handler) {
  process.once("SIGINT", handler);
  return () => process.removeListener("SIGINT", handler);
}

function textResult(text) {
  return { body: { help: text }, exitCode: 0, text: true };
}

export async function execute(argv, env = process.env, overrides = {}) {
  assertSupportedNode();
  const { positionals, options, separatorAt } = parseArgs(argv);
  // Accept alternative spellings (`interactions`, `activities`) for the command group.
  if (positionals.length > 0 && ALIASES[positionals[0]] && positionals[0] !== "notify") {
    positionals[0] = ALIASES[positionals[0]];
  }
  if (options.version || positionals[0] === "version") {
    return options.json
      ? { body: { version: VERSION }, exitCode: 0 }
      : { body: { version: VERSION }, output: VERSION, exitCode: 0 };
  }
  if (positionals[0] === "help") {
    if (positionals[1] === "exit-codes") return textResult(EXIT_CODES);
    return textResult(positionals.length > 1 ? (commandHelp(positionals.slice(1)) ?? help()) : help());
  }
  if (positionals.length === 0) return textResult(help());
  if (options.help) {
    if (positionals[0] === "permissions" && positionals.length === 1) {
      const { main } = await import("../agents/dispatch.mjs");
      return textResult((await main(["help"])).help);
    }
    return textResult(commandHelp(positionals) ?? help());
  }
  const [group, action, id] = positionals;
  const runtime = {
    now: () => Date.now(),
    openBrowser,
    sleep,
    stdout: (message) => console.log(message),
    stderr: (message) => console.error(message),
    stderrIsTTY: Boolean(process.stderr.isTTY),
    stdin: process.stdin,
    onInterrupt: interruptHandler,
    writeConfig,
    ...overrides,
  };
  if (group === "completion") {
    const script = completionScript(action);
    if (!script) throw new UsageError("completion requires bash or zsh, for example: notify completion zsh");
    return { body: {}, output: script, exitCode: 0 };
  }
  if (group === "auth" && action === "login")
    return { body: await login(options, env, runtime), exitCode: 0 };
  if (group === "permissions") {
    const { main } = await import("../agents/dispatch.mjs");
    const body = await main(positionals.slice(1));
    return {
      body: body ?? { ok: true },
      exitCode: 0,
      ...(body?.help ? { text: true } : {}),
    };
  }
  if (group === "mini-apps" && ["build", "validate"].includes(action)) {
    const { handleMiniApps } = await import("./commands/mini-apps.mjs");
    return handleMiniApps({ action, id, positionals, options });
  }
  if (group === "activity" && ["designs", "design", "validate-design"].includes(action)) {
    const { handleActivity } = await import("./commands/activity.mjs");
    return handleActivity({ action, id, positionals, options });
  }
  if (Object.hasOwn(offline, group)) {
    const handler = await offline[group]();
    return handler({ group, action, id, positionals, options, env, runtime, overrides });
  }
  const loadCommand = Object.hasOwn(commandModules, group) ? commandModules[group] : undefined;
  if (!loadCommand) {
    throw new UsageError(
      `Unknown command "${group}". Commands: ${commandGroups().join(", ")}. Run notify --help.`,
    );
  }
  const config = { ...(await loadConfig(env)), sleep: runtime.sleep };
  const handler = await loadCommand();
  return handler({
    group,
    action,
    id,
    positionals,
    options,
    separatorAt,
    config,
    env,
    runtime,
    overrides,
  });
}

export async function run(argv, env = process.env, overrides = {}) {
  const stdout = overrides.stdout ?? ((message) => console.log(message));
  const stderr = overrides.stderr ?? ((value) => console.error(value));
  try {
    const result = await execute(argv, env, overrides);
    if (!result.outputEmitted) {
      if (result.text) stdout(result.body.help);
      else if (result.output !== undefined) stdout(result.output);
      else stdout(JSON.stringify(result.body));
    }
    return result.exitCode;
  } catch (error) {
    const described = describeError(error);
    // An interrupted wait still reports the last known state on stdout.
    if (error instanceof InterruptedError && error.result) stdout(JSON.stringify(error.result));
    if (argv.includes("--json")) {
      stderr(JSON.stringify({ ok: false, exitCode: described.exitCode, error: described.error }));
    } else {
      stderr(described.error.message);
      if (described.error.hint) stderr(`hint: ${described.error.hint}`);
    }
    return described.exitCode;
  }
}

export { parseArgs, parseDuration } from "./foundation/arguments.mjs";
export { UsageError, RequestError } from "./foundation/errors.mjs";
export { configPath, loadConfig, writeConfig } from "./session/credentials.mjs";
export { openBrowser } from "./session/authorize.mjs";
export { VERSION } from "./version.mjs";
