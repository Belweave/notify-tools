import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("the skill declares CLI compatibility and every local workflow link resolves inside its bundle", async () => {
  const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const packageRoot = repositoryRoot;
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const bundle = await realpath(join(repositoryRoot, "skills", "notify"));
  const entry = join(bundle, "SKILL.md");
  const skill = await readFile(entry, "utf8");
  assert.equal(/^ {2}compatible-cli: "([^"]+)"$/m.exec(skill)?.[1], packageJson.version);
  const visited = new Set();
  const pending = [entry];
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const content = await readFile(file, "utf8");
    for (const [, target] of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^[a-z]+:|^#/i.test(target)) continue;
      const linked = await realpath(resolve(dirname(file), target.split("#")[0]));
      assert.ok(linked.startsWith(`${bundle}${sep}`), `Link escapes bundle: ${target}`);
      pending.push(linked);
    }
  }
  assert.ok(visited.size > 1, "Router must reach its workflow guides");
});
