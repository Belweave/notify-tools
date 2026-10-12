// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { readFile, mkdir, stat, open, chmod, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

export function digest(content) {
  return createHash("sha256").update(content).digest("hex");
}

export async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function atomicWrite(path, content, expected) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const latest = await readOptional(path);
  if ((latest === undefined ? undefined : digest(latest)) !== expected) {
    throw new Error(`Configuration changed while installing: ${path}`);
  }
  const previousMode = latest === undefined ? 0o600 : (await stat(path)).mode & 0o777;
  const temporary = `${path}.notify-${process.pid}-${Date.now()}`;
  try {
    const handle = await open(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(temporary, previousMode);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function readJson(path, fallback) {
  const content = await readOptional(path);
  const value = content === undefined ? structuredClone(fallback) : JSON.parse(content);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected a JSON object in ${path}`);
  }
  return {
    content,
    hash: content === undefined ? undefined : digest(content),
    value,
  };
}
