// SPDX-License-Identifier: Apache-2.0
import { lstat, mkdir, readFile, readdir, readlink, rename, rm, writeFile, copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { UsageError } from "../foundation/errors.mjs";
import { VERSION } from "../version.mjs";

/* global NOTIFY_BUNDLED_CLI */
const BUNDLED = typeof NOTIFY_BUNDLED_CLI !== "undefined" && NOTIFY_BUNDLED_CLI;

/** The skills shipped with this CLI: `skills/` in a checkout or a release. */
export function skillsSource() {
  return fileURLToPath(new URL(BUNDLED ? "../skills/" : "../../../skills/", import.meta.url));
}

const MARKER = ".notify-tools.json";
export const AGENTS = ["claude", "codex", "opencode", "hermes"];

const PROFILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Hermes Agent's home: HERMES_HOME, or ~/.hermes. */
function hermesHome(env, home) {
  return env.HERMES_HOME ? resolve(env.HERMES_HOME) : join(home, ".hermes");
}

/** Where each agent host reads user-level skills. */
export function agentSkillRoots(env = process.env, options = {}) {
  const home = env.HOME ?? homedir();
  const hermes = hermesHome(env, home);
  return {
    claude: join(env.CLAUDE_CONFIG_DIR ?? join(home, ".claude"), "skills"),
    codex: join(env.CODEX_HOME ?? join(home, ".codex"), "skills"),
    // Same configuration root as the OpenCode permission plugin. The skill
    // folder name itself is unconfirmed for every OpenCode version: see
    // opencodeNote(), which every OpenCode install result carries.
    opencode: join(home, ".config", "opencode", "skill"),
    // Hermes reads $HERMES_HOME/skills/<name>/SKILL.md; a named profile has its own.
    hermes: options.profile ? join(hermes, "profiles", options.profile, "skills") : join(hermes, "skills"),
  };
}

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

/** Skill folders in the source: each directory holding a SKILL.md. */
async function sourceSkills(source) {
  const names = [];
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory() && (await exists(join(source, entry.name, "SKILL.md")))) names.push(entry.name);
  }
  return names.sort();
}

/** Files a skill actually uses: SKILL.md plus everything reachable by relative links. */
export async function skillFiles(skillDirectory) {
  const root = resolve(skillDirectory);
  const visited = new Set();
  const pending = [join(root, "SKILL.md")];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const content = await readFile(file, "utf8");
    for (const [, target] of content.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:|^#/i.test(target)) continue;
      const linked = resolve(dirname(file), target.split("#")[0]);
      if (!linked.startsWith(`${root}${sep}`)) continue;
      if (await exists(linked)) pending.push(linked);
    }
  }
  return [...visited].map((file) => relative(root, file)).sort();
}

/** A symbolic link at `path`, with its target, or undefined. Links are never followed. */
async function symlinkAt(path) {
  try {
    const info = await lstat(path);
    return info.isSymbolicLink() ? { target: await readlink(path) } : undefined;
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function linkReason(path, target) {
  return `${path} is a symbolic link to ${target}. Notify Tools never follows or replaces links: remove or repoint the link yourself, or install somewhere else with --dir.`;
}

async function readMarker(directory) {
  try {
    return JSON.parse(await readFile(join(directory, MARKER), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    if (error instanceof SyntaxError) return { name: undefined, version: undefined, invalid: true };
    throw error;
  }
}

function selectTargets(options, env) {
  if (options.dir && options.agent) throw new UsageError("Use either --agent or --dir, not both");
  if (options.profile !== undefined) {
    if (!PROFILE.test(options.profile) || options.profile.includes("..")) {
      throw new UsageError("--profile must be a Hermes profile name (letters, digits, '.', '_' or '-')");
    }
    const agents = String(options.agent ?? "").split(",").map((agent) => agent.trim());
    if (!agents.includes("hermes") && !agents.includes("all")) {
      throw new UsageError("--profile applies to Hermes Agent: use it with --agent hermes (or all)");
    }
  }
  if (options.dir) return [{ agent: "dir", root: resolve(options.dir) }];
  const roots = agentSkillRoots(env, options);
  const requested = options.agent ?? "detected";
  if (requested === "all") return AGENTS.map((agent) => ({ agent, root: roots[agent] }));
  if (requested === "detected") return undefined;
  const agents = requested.split(",").map((agent) => agent.trim());
  for (const agent of agents) {
    if (!AGENTS.includes(agent)) throw new UsageError(`--agent must be ${AGENTS.join(", ")} or all`);
  }
  return agents.map((agent) => ({ agent, root: roots[agent] }));
}

/** Where an OpenCode install went and how to move it if OpenCode does not list it. */
export function opencodeNote(path) {
  return `OpenCode's skill folder could not be confirmed for every OpenCode version. Installed at ${path}. If OpenCode does not list this skill, move it to the folder your OpenCode version reads skills from (mv "${path}" "<that folder>/"), then update it later with notify skills install --dir "<that folder>".`;
}

/** Agents whose configuration directory already exists on this machine. */
async function detectedTargets(env) {
  const roots = agentSkillRoots(env);
  const found = [];
  for (const agent of AGENTS) {
    if (await exists(dirname(roots[agent]))) found.push({ agent, root: roots[agent] });
  }
  return found;
}

export async function skillStatus({ env = process.env, options = {} } = {}) {
  const source = skillsSource();
  const names = await sourceSkills(source);
  const targets = selectTargets(options, env) ?? AGENTS.map((agent) => ({ agent, root: agentSkillRoots(env)[agent] }));
  const result = [];
  for (const { agent, root } of targets) {
    for (const name of names) {
      const directory = join(root, name);
      const link = (await symlinkAt(root)) ?? (await symlinkAt(directory));
      const present = await exists(directory);
      const marker = present && !link ? await readMarker(directory) : undefined;
      result.push({
        agent,
        skill: name,
        path: directory,
        installed: present,
        managed: Boolean(marker && !marker.invalid),
        version: marker?.version ?? null,
        ...(link ? { symlink: link.target } : {}),
      });
    }
  }
  return result;
}

/** A skipped result when the skills folder or the skill folder is a link. */
async function refuseLinks(name, root) {
  const to = join(root, name);
  for (const path of [root, to]) {
    const link = await symlinkAt(path);
    if (link) return { skill: name, path: to, action: "skipped", reason: linkReason(path, link.target) };
  }
  return undefined;
}

async function installOne(source, name, root, dryRun) {
  const from = join(source, name);
  const to = join(root, name);
  const refused = await refuseLinks(name, root);
  if (refused) return refused;
  const present = await exists(to);
  const marker = present ? await readMarker(to) : undefined;
  if (present && (!marker || marker.invalid || marker.name !== name)) {
    return {
      skill: name,
      path: to,
      action: "skipped",
      reason: `${to} already exists and was not installed by Notify Tools. Move it away (or delete it if it is an old copy) and run the command again, or install somewhere else with --dir.`,
    };
  }
  const files = await skillFiles(from);
  const action = present ? (marker.version === VERSION ? "reinstalled" : "updated") : "installed";
  if (dryRun) return { skill: name, path: to, action: `would be ${action}`, files: files.length };
  await mkdir(root, { recursive: true });
  const suffix = `${process.pid}-${Date.now()}`;
  const staging = join(root, `.${name}.notify-staging-${suffix}`);
  const retired = join(root, `.${name}.notify-retired-${suffix}`);
  try {
    for (const file of files) {
      await mkdir(dirname(join(staging, file)), { recursive: true });
      await copyFile(join(from, file), join(staging, file));
    }
    await writeFile(
      join(staging, MARKER),
      `${JSON.stringify({ name, version: VERSION, files }, null, 2)}\n`,
    );
    if (present) await rename(to, retired);
    await rename(staging, to);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (present && !(await exists(to)) && (await exists(retired))) await rename(retired, to);
    throw error;
  }
  await rm(retired, { recursive: true, force: true });
  return { skill: name, path: to, action, files: files.length };
}

async function uninstallOne(name, root, dryRun) {
  const to = join(root, name);
  const refused = await refuseLinks(name, root);
  if (refused) return refused;
  if (!(await exists(to))) return { skill: name, path: to, action: "absent" };
  const marker = await readMarker(to);
  if (!marker || marker.invalid || marker.name !== name) {
    return { skill: name, path: to, action: "skipped", reason: "Not installed by Notify Tools; left unchanged" };
  }
  if (dryRun) return { skill: name, path: to, action: "would be removed" };
  await rm(to, { recursive: true, force: true });
  return { skill: name, path: to, action: "removed" };
}

export async function handleSkills({ action, options, env, runtime }) {
  if (!["install", "uninstall", "status"].includes(action ?? "")) {
    throw new UsageError("Usage: notify skills install|uninstall|status [--agent claude|codex|opencode|hermes|all] [--profile NAME] [--dir DIR] [--dry-run]");
  }
  if (action === "status") return { body: { version: VERSION, skills: await skillStatus({ env, options }) }, exitCode: 0 };
  const source = skillsSource();
  const names = await sourceSkills(source);
  let targets = selectTargets(options, env);
  if (!targets) {
    targets = await detectedTargets(env);
    if (targets.length === 0) {
      throw new UsageError(
        "No agent configuration found (~/.claude, ~/.codex, ~/.config/opencode, ~/.hermes or HERMES_HOME). Name one with --agent claude|codex|opencode|hermes|all, or use --dir DIR.",
      );
    }
  }
  const results = [];
  for (const { agent, root } of targets) {
    for (const name of names) {
      const outcome =
        action === "install"
          ? await installOne(source, name, root, Boolean(options["dry-run"]))
          : await uninstallOne(name, root, Boolean(options["dry-run"]));
      const moved = agent === "opencode" && action === "install" && !String(outcome.action).startsWith("skipped");
      results.push({ agent, ...outcome, ...(moved ? { note: opencodeNote(outcome.path) } : {}) });
    }
  }
  for (const entry of results) if (entry.note) runtime?.stderr?.(entry.note);
  const skipped = results.some((entry) => entry.action === "skipped");
  return { body: { version: VERSION, results }, exitCode: skipped ? 1 : 0 };
}
