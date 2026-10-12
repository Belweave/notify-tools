// SPDX-License-Identifier: Apache-2.0

export const STATUS_MESSAGE = "Waiting for Notify approval...";

export function cleanEmptyHooks(config) {
  if (!config.hooks || Object.keys(config.hooks).length > 0) return;
  delete config.hooks;
}

export function isClaudeHandler(handler) {
  return (
    handler?.type === "command" &&
    handler?.statusMessage === STATUS_MESSAGE &&
    Array.isArray(handler.args) &&
    handler.args.at(-3) === "permissions" &&
    handler.args.at(-2) === "hook" &&
    handler.args.at(-1) === "claude"
  );
}

export function isCodexHandler(handler) {
  return (
    handler?.type === "command" &&
    typeof handler.command === "string" &&
    handler.command.includes("notify") &&
    handler.command.endsWith(" permissions hook codex")
  );
}

export function removeGroups(groups, predicate) {
  if (groups === undefined) return [];
  if (!Array.isArray(groups)) throw new Error("PermissionRequest hooks must be an array");
  return groups
    .map((group) => {
      if (!group || typeof group !== "object" || !Array.isArray(group.hooks)) return group;
      return {
        ...group,
        hooks: group.hooks.filter((hook) => !predicate(hook)),
      };
    })
    .filter((group) => !Array.isArray(group?.hooks) || group.hooks.length > 0);
}

export function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}
