// SPDX-License-Identifier: Apache-2.0
import { parseArgs } from "./foundation/arguments.mjs";
import { RequestError, UsageError } from "./foundation/errors.mjs";
import { sleep } from "./foundation/results.mjs";
import { help } from "./help.mjs";
import { login, openBrowser } from "./session/authorize.mjs";
import { loadConfig, writeConfig } from "./session/credentials.mjs";

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

export async function execute(argv, env = process.env, overrides = {}) {
  const { positionals, options, separatorAt } = parseArgs(argv);
  if (options.help || positionals.length === 0)
    return { body: { help: help() }, exitCode: 0, text: true };
  const [group, action, id] = positionals;
  const runtime = {
    now: () => Date.now(),
    openBrowser,
    sleep,
    stdout: (message) => console.log(message),
    stderr: (message) => console.error(message),
    stderrIsTTY: Boolean(process.stderr.isTTY),
    writeConfig,
    ...overrides,
  };
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
  const config = await loadConfig(env);
  const loadCommand = Object.hasOwn(commandModules, group) ? commandModules[group] : undefined;
  if (!loadCommand) throw new UsageError("Unknown command. Run notify --help.");
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
  try {
    const result = await execute(argv, env, overrides);
    const stdout = overrides.stdout ?? ((message) => console.log(message));
    if (!result.outputEmitted) {
      if (result.text) stdout(result.body.help);
      else if (result.output !== undefined) stdout(result.output);
      else stdout(JSON.stringify(result.body));
    }
    return result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    (overrides.stderr ?? ((value) => console.error(value)))(message);
    if (error instanceof UsageError) return 2;
    if (error instanceof RequestError) {
      if (error.body?.error === "access_denied") return 5;
      if (error.status === 408 || error.body?.error === "expired_token") return 4;
      if (error.status === 401 || error.status === 403) return 3;
      if (error.status === 0) return 6;
    }
    return 1;
  }
}

export { parseArgs, parseDuration } from "./foundation/arguments.mjs";
export { UsageError, RequestError } from "./foundation/errors.mjs";
export { configPath, loadConfig, writeConfig } from "./session/credentials.mjs";
export { openBrowser } from "./session/authorize.mjs";
