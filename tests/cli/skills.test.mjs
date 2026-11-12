// SPDX-License-Identifier: Apache-2.0
// Keeps the agent skills honest: every command, flag, MCP tool, HTTP route and
// code example they show must exist in this CLI and in the production API, and
// every CLI example must run against a stub of that API.
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";
import { run } from "../../src/cli/index.mjs";
import { parseArgs } from "../../src/cli/foundation/arguments.mjs";
import { GLOBAL_FLAGS, commandGroups, findCommand } from "../../src/cli/reference.mjs";
import { activityDesign } from "../../src/live-activities/design.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const skillsRoot = join(root, "skills");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const api = JSON.parse(await readFile(join(root, "tests", "fixtures", "agent-api.json"), "utf8"));

const operations = Object.entries(api.operations).map(([key, spec]) => {
  const [method, template] = key.split(" ");
  const pattern = new RegExp(`^${template.replace(/\{[^}]+\}/g, "[^/]+")}$`);
  return { key, method, template, pattern, ...spec };
});

function operationFor(method, path) {
  const bare = path.split("?")[0];
  return operations.find((operation) => operation.method === method && operation.pattern.test(bare));
}

async function skillDirectories() {
  const names = [];
  for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
    try {
      await readFile(join(skillsRoot, entry.name, "SKILL.md"));
      names.push(entry.name);
    } catch {}
  }
  return names.sort();
}

/** Every Markdown file reachable from a skill's SKILL.md through relative links. */
async function reachable(skill) {
  const bundle = await realpath(join(skillsRoot, skill));
  const visited = new Map();
  const pending = [join(bundle, "SKILL.md")];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    const content = await readFile(file, "utf8");
    visited.set(file, content);
    for (const [, target] of content.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (/^[a-z]+:|^#/i.test(target)) continue;
      const linked = await realpath(resolve(dirname(file), target.split("#")[0]));
      assert.ok(linked.startsWith(`${bundle}${sep}`), `${skill}: link escapes the skill: ${target}`);
      pending.push(linked);
    }
  }
  return visited;
}

function codeBlocks(markdown) {
  return [...markdown.matchAll(/```([a-z]*)\n([\s\S]*?)```/g)].map(([, lang, body]) => ({ lang, body }));
}

/** Splits shell text into words and control operators, honouring quotes. */
function shellTokens(text) {
  const source = text.replace(/\\\n\s*/g, " ");
  const tokens = [];
  let word = null;
  const push = () => {
    if (word !== null) tokens.push({ word });
    word = null;
  };
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "'") {
      const end = source.indexOf("'", index + 1);
      word = (word ?? "") + source.slice(index + 1, end);
      index = end;
    } else if (char === '"') {
      let value = "";
      index += 1;
      while (index < source.length && source[index] !== '"') {
        if (source[index] === "\\" && index + 1 < source.length) index += 1;
        value += source[index];
        index += 1;
      }
      word = (word ?? "") + value;
    } else if (/\s/.test(char)) {
      push();
      if (char === "\n") tokens.push({ op: "\n" });
    } else if ("|;&<>()".includes(char) || (char === "$" && source[index + 1] === "(")) {
      push();
      const two = source.slice(index, index + 2);
      const op = ["||", "&&", ">>", "$("].includes(two) ? two : char;
      tokens.push({ op });
      index += op.length - 1;
    } else if (char === "#" && word === null) {
      while (index < source.length && source[index] !== "\n") index += 1;
      tokens.push({ op: "\n" });
    } else {
      word = (word ?? "") + char;
    }
  }
  push();
  return tokens;
}

/** Simple commands (word lists) with the command that pipes into each. */
function shellCommands(text) {
  const commands = [];
  let current = [];
  let pipedFrom = null;
  let redirect = false;
  const finish = (op) => {
    while (["if", "then", "else", "do", "!", "while"].includes(current[0])) current.shift();
    const command = current.length ? { words: current, pipedFrom } : null;
    if (command) commands.push(command);
    pipedFrom = op === "|" ? command : null;
    current = [];
  };
  for (const token of shellTokens(text)) {
    if (token.op) {
      if (token.op === ">" || token.op === ">>" || token.op === "<") {
        redirect = true;
        continue;
      }
      finish(token.op);
      continue;
    }
    if (redirect) {
      redirect = false;
      continue;
    }
    current.push(token.word);
  }
  finish(null);
  return commands;
}

function stdinFor(command) {
  const source = command.pipedFrom;
  if (source && ["echo", "printf"].includes(source.words[0])) {
    const value = source.words.slice(1).join(" ");
    return source.words[0] === "printf" ? value.replace(/\\n/g, "\n") : `${value}\n`;
  }
  return "Sample text from a previous command\n";
}

function checkFlags(argv, where) {
  const { positionals, options } = parseArgs(argv);
  const entry = findCommand(positionals);
  if (!entry && (positionals[1] === "..." || positionals.length === 1)) {
    assert.ok(commandGroups().includes(positionals[0]), `${where}: unknown command group: notify ${positionals[0]}`);
    return undefined;
  }
  assert.ok(entry, `${where}: unknown command: notify ${argv.join(" ")}`);
  const allowed = new Set([...(entry.flags ?? []), ...GLOBAL_FLAGS]);
  for (const [flag, value] of Object.entries(options)) {
    if (Array.isArray(value) && value.length === 0) continue;
    assert.ok(allowed.has(flag), `${where}: notify ${entry.path} does not take --${flag}`);
  }
  return entry;
}

function curlRequest(words) {
  let method;
  let url;
  let data;
  for (let index = 1; index < words.length; index += 1) {
    const word = words[index];
    if (word === "-X") method = words[++index];
    else if (word === "-H") index += 1;
    else if (word === "-d" || word === "--data") data = words[++index];
    else if (/^https?:\/\//.test(word)) url = new URL(word);
  }
  return { method: method ?? (data ? "POST" : "GET"), url, data };
}

const SAFE_TO_RUN = new Set(["send", "interaction", "activity", "page", "pages", "oncall", "devices",
  "inbox", "billing", "tokens", "events", "services", "webhooks", "apps", "connectors", "families",
  "teams", "groups", "doctor", "version"]);

function stubFetch(failures, where) {
  return async (url, init = {}) => {
    const target = new URL(String(url));
    const method = init.method ?? "GET";
    if (target.pathname === "/api/health") return Response.json({ ok: true });
    const operation = operationFor(method, target.pathname);
    if (!operation) {
      failures.push(`${where}: ${method} ${target.pathname} is not a production API operation`);
      return Response.json({ error: "unknown route" }, { status: 404 });
    }
    for (const key of target.searchParams.keys()) {
      if (!operation.query.includes(key)) failures.push(`${where}: ${operation.key} has no query parameter ${key}`);
    }
    if (typeof init.body === "string" && init.body.startsWith("{")) {
      for (const key of Object.keys(JSON.parse(init.body))) {
        if (!operation.body.includes(key)) failures.push(`${where}: ${operation.key} has no body field ${key}`);
      }
    }
    return Response.json({
      ok: true,
      accepted: 1,
      interaction: { id: "int_RETURNED_ID", kind: "approval", status: "approved", response: "approve" },
      timedOut: false,
      notification: { id: "anot_RETURNED_ID" },
      activity: { id: "act_RETURNED_ID", key: "release-142" },
      app: { id: "app_RETURNED_ID", name: "Release dashboard", url: "https://dashboard.example.com", consentedAt: "2026-11-12T00:00:00Z", team: null },
      apps: [],
      created: true,
      team: { id: "team_FAMILY_ID", kind: "family" },
      teams: [],
      members: [],
      group: { rotation: { members: [{ userId: "user_A" }], period: "weekly", handoffAt: "09:00", timezone: "UTC", startsAt: "2026-11-01T09:00:00Z" } },
      notifications: [],
      readThroughToken: "read-through",
      page: { id: "page_RETURNED_ID" },
      deduplicated: false,
      devices: [{ id: "dev_RETURNED_ID" }],
      authenticated: true,
      userId: "usr_RETURNED_ID",
      token: { id: "tok_RETURNED_ID", name: "laptop", scopes: [], expiresAt: null },
    });
  };
}

test("each skill has standard front matter matching the CLI version", async () => {
  const skills = await skillDirectories();
  assert.deepEqual(skills, ["notify", "notify-integrations"]);
  for (const skill of skills) {
    const content = await readFile(join(skillsRoot, skill, "SKILL.md"), "utf8");
    const front = /^---\n([\s\S]*?)\n---\n/.exec(content)?.[1];
    assert.ok(front, `${skill}: front matter`);
    assert.equal(/^name: (.+)$/m.exec(front)?.[1], skill);
    const description = /^description: (.+)$/m.exec(front)?.[1] ?? "";
    assert.ok(description.length > 80 && description.length <= 1024, `${skill}: description length`);
    assert.match(description, /^[^<>]+$/, `${skill}: description is plain text`);
    assert.equal(/^ {2}compatible-cli: "([^"]+)"$/m.exec(front)?.[1], packageJson.version);
    assert.ok(content.split("\n").length <= 80, `${skill}: SKILL.md stays short`);
    const files = await reachable(skill);
    const references = (await readdir(join(skillsRoot, skill, "references"))).map((name) =>
      join(skillsRoot, skill, "references", name),
    );
    for (const reference of references) {
      assert.ok(files.has(await realpath(reference)), `${skill}: ${relative(root, reference)} is not linked`);
    }
  }
});

test("every command, flag, tool, route and example in the skills is real", async () => {
  const failures = [];
  const commands = [];
  for (const skill of await skillDirectories()) {
    for (const [file, content] of await reachable(skill)) {
      const where = relative(root, file);
      for (const { lang, body } of codeBlocks(content)) {
        if (lang === "sh") {
          for (const command of shellCommands(body)) {
            if (command.words[0] === "notify") {
              checkFlags(command.words.slice(1), where);
              commands.push({ where, command });
            }
            if (command.words[0] === "curl") {
              const { method, url, data } = curlRequest(command.words);
              assert.equal(url.origin, "https://notify.belweave.ai", `${where}: curl origin`);
              const operation = operationFor(method, url.pathname);
              assert.ok(operation, `${where}: ${method} ${url.pathname} is not a production operation`);
              for (const key of url.searchParams.keys()) assert.ok(operation.query.includes(key), `${where}: query ${key}`);
              if (data) {
                for (const key of Object.keys(JSON.parse(data))) assert.ok(operation.body.includes(key), `${where}: ${operation.key} body ${key}`);
              }
            }
          }
        } else if (lang === "mcp") {
          const { tool, arguments: args } = JSON.parse(body);
          const spec = api.mcpTools[tool];
          assert.ok(spec, `${where}: MCP tool ${tool} is not in production`);
          const operation = api.operations[spec.operation];
          const allowed = new Set([...Object.values(spec.pathArgs), ...spec.queryArgs, ...spec.extraArgs, ...operation.body]);
          for (const key of Object.keys(args)) assert.ok(allowed.has(key), `${where}: ${tool} has no argument ${key}`);
        } else if (lang === "json") {
          JSON.parse(body);
        } else if (["js", "ts"].includes(lang)) {
          await transform(body, { loader: lang, format: "esm" });
        } else {
          assert.fail(`${where}: code block needs a language (sh, json, mcp, js or ts)`);
        }
      }
      for (const [, span] of content.matchAll(/`(notify [^`]+)`/g)) {
        if (/[<>]|\.\.\./.test(span) && /<command>/.test(span)) continue;
        checkFlags(shellTokens(span).filter((token) => token.word !== undefined).map((token) => token.word).slice(1), `${where} inline`);
      }
      for (const [, tool] of content.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
        if (tool.includes("_") && /^(activities|apps|auth|billing|connectors|devices|events|groups|inbox|interactions|mini_apps|oncall|pages|services|teams|tokens|webhooks)_/.test(tool)) {
          assert.ok(api.mcpTools[tool], `${where}: MCP tool ${tool} is not in production`);
        }
      }
    }
  }
  assert.ok(commands.length > 60, `found ${commands.length} CLI examples`);

  const workspace = await mkdtemp(join(tmpdir(), "notify-skill-examples-"));
  const previous = process.cwd();
  const originalFetch = globalThis.fetch;
  try {
    process.chdir(workspace);
    for (const [name, template] of [["activity-design.json", "ring"], ["ring.json", "ring"], ["approval.json", "approval"]]) {
      await writeFile(name, JSON.stringify(activityDesign(template)));
    }
    let ran = 0;
    for (const { where, command } of commands) {
      const argv = command.words.slice(1).map((word) => word.replace("PACKAGE_ID", "a".repeat(64)));
      const group = argv[0];
      if (!SAFE_TO_RUN.has(group)) continue;
      globalThis.fetch = stubFetch(failures, `${where}: notify ${argv.join(" ")}`);
      const stderr = [];
      const code = await run(
        argv,
        { NOTIFY_TOKEN: "ntf_examplefixture0000", NOTIFY_API_URL: "https://example.test", HOME: workspace },
        {
          stdout: () => {},
          stderr: (line) => stderr.push(line),
          sleep: async () => {},
          stdin: Readable.from([stdinFor(command)]),
          onInterrupt: () => () => {},
        },
      );
      if (code === 2 || code === 1) failures.push(`${where}: notify ${argv.join(" ")} exited ${code}: ${stderr.join(" ")}`);
      ran += 1;
    }
    assert.ok(ran > 50, `ran ${ran} CLI examples`);
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(previous);
    await rm(workspace, { recursive: true, force: true });
  }
  assert.deepEqual(failures, []);
});
