// SPDX-License-Identifier: Apache-2.0
import { RequestError } from "../foundation/errors.mjs";
import { DEFAULT_API_URL } from "../foundation/settings.mjs";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

export function configPath(env = process.env) {
  if (env.NOTIFY_CONFIG) return env.NOTIFY_CONFIG;
  if (platform() === "win32") return join(env.APPDATA ?? homedir(), "notify", "config.json");
  if (platform() === "darwin")
    return join(homedir(), "Library", "Application Support", "notify", "config.json");
  return join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "notify", "config.json");
}

export async function loadConfig(env = process.env) {
  if (env.NOTIFY_TOKEN) {
    return {
      token: env.NOTIFY_TOKEN,
      apiUrl: env.NOTIFY_API_URL ?? DEFAULT_API_URL,
      source: "environment",
    };
  }
  const path = configPath(env);
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new RequestError(
        `No token configured. Run notify auth login, set NOTIFY_TOKEN, or create ${path}.`,
        401,
      );
    }
    throw error;
  }
  if (platform() !== "win32" && (info.mode & 0o077) !== 0) {
    throw new RequestError(
      `Refusing insecure config permissions for ${path}; expected mode 0600.`,
      401,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new RequestError(`Invalid JSON in ${path}.`, 401);
  }
  if (typeof parsed.token !== "string" || !parsed.token.startsWith("ntf_")) {
    throw new RequestError(`Missing Notify token in ${path}.`, 401);
  }
  return {
    token: parsed.token,
    apiUrl: env.NOTIFY_API_URL ?? parsed.apiUrl ?? DEFAULT_API_URL,
    tokenId: typeof parsed.tokenId === "string" ? parsed.tokenId : undefined,
    source: "file",
    path,
  };
}

export async function writeConfig(path, config) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(
    directory,
    `.config.json.${process.pid}.${randomBytes(8).toString("hex")}.tmp`,
  );
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${JSON.stringify(config, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (platform() !== "win32") await chmod(temporary, 0o600);
    await rename(temporary, path);
    if (platform() !== "win32") await chmod(path, 0o600);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeConnectorSecret(configPath, connectorId, secret) {
  const directory = join(dirname(configPath), "connectors");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${connectorId}.secret`);
  const temporary = `${path}.${process.pid}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(`${secret}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (platform() !== "win32") await chmod(temporary, 0o600);
    await rename(temporary, path);
    if (platform() !== "win32") await chmod(path, 0o600);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
