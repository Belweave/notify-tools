import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseMiniAppJson } from "./mini-app-json.mjs";

// Mirrors the shared MINI_APP_MEDIA_TYPES contract; parity is tested.
export const MINI_APP_MEDIA_TYPES = {
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  woff: "font/woff",
  woff2: "font/woff2",
  txt: "text/plain",
  ico: "image/x-icon",
};
const ARCHIVE_LIMIT = 12 * 1024 * 1024;
const TOTAL_LIMIT = 8 * 1024 * 1024;
const FILE_LIMIT = 4 * 1024 * 1024;
const pathPattern =
  /^[a-zA-Z0-9_-]+(?:[.][a-zA-Z0-9_-]+)*(?:\/[a-zA-Z0-9_-]+(?:[.][a-zA-Z0-9_-]+)*)*$/;
const hash = (data) => createHash("sha256").update(data).digest("hex");
const fail = (message) => {
  throw new Error(message);
};
function exact(value, required, optional = []) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    required.some((key) => !Object.hasOwn(value, key)) ||
    Object.keys(value).some((key) => ![...required, ...optional].includes(key))
  )
    fail("Invalid or unknown package fields");
}
function string(value, max) {
  if (typeof value !== "string" || !value.length || value.length > max)
    fail("Invalid package string");
}
function path(value) {
  string(value, 240);
  if (!pathPattern.test(value)) fail("Unsafe package path");
}
export function validateManifest(m) {
  exact(
    m,
    [
      "schemaVersion",
      "appId",
      "name",
      "version",
      "publisher",
      "format",
      "runtime",
      "entryPoint",
      "files",
      "capabilities",
      "ageRating",
      "commerce",
    ],
    ["aliases", "privacyUrl", "supportUrl"],
  );
  if (
    m.schemaVersion !== 1 ||
    m.format !== "web" ||
    m.runtime !== "notify-web-v1" ||
    m.commerce !== "none" ||
    ![4, 9, 13, 16, 18].includes(m.ageRating)
  )
    fail("Only free notify-web-v1 packages with valid age metadata are supported");
  string(m.appId, 64);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.appId)) fail("Invalid appId");
  string(m.name, 100);
  string(m.version, 64);
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      m.version,
    )
  )
    fail("Invalid semver");
  exact(m.publisher, ["id", "name"]);
  string(m.publisher.id, 128);
  string(m.publisher.name, 100);
  path(m.entryPoint);
  if (
    !Array.isArray(m.capabilities) ||
    m.capabilities.length > 1 ||
    m.capabilities.some((c) => c !== "local-storage")
  )
    fail("Unsupported capability");
  if (m.aliases !== undefined) {
    if (!Array.isArray(m.aliases) || m.aliases.length > 8) fail("Invalid aliases");
    m.aliases.forEach((v) => {
      string(v, 100);
    });
  }
  for (const key of ["privacyUrl", "supportUrl"])
    if (m[key] !== undefined) {
      string(m[key], 2048);
      if (new URL(m[key]).protocol !== "https:") fail("Metadata URL must use HTTPS");
    }
  if (!Array.isArray(m.files) || !m.files.length || m.files.length > 256)
    fail("File count limit exceeded");
  const seen = new Set();
  let total = 0;
  for (const f of m.files) {
    exact(f, ["path", "size", "sha256", "mediaType"]);
    path(f.path);
    if (seen.has(f.path.toLowerCase())) fail("Duplicate or case-colliding path");
    seen.add(f.path.toLowerCase());
    if (!Number.isInteger(f.size) || f.size < 0 || f.size > FILE_LIMIT)
      fail("File size limit exceeded");
    total += f.size;
    if (typeof f.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(f.sha256))
      fail("Invalid file digest");
    if (MINI_APP_MEDIA_TYPES[f.path.split(".").pop()?.toLowerCase()] !== f.mediaType)
      fail("Unsupported file type");
    string(f.mediaType, 100);
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(f.mediaType)) fail("Invalid media type");
  }
  if (total > TOTAL_LIMIT) fail("Decoded package size limit exceeded");
  for (const file of m.files) {
    const parts = file.path.toLowerCase().split("/");
    for (let i = 1; i < parts.length; i++) {
      if (seen.has(parts.slice(0, i).join("/"))) fail("File/directory-colliding path");
    }
  }
  if (!m.files.some((f) => f.path === m.entryPoint && f.mediaType === "text/html"))
    fail("Entry point must be listed HTML");
  return m;
}
export function validateArchive(bytes, ownerId) {
  if (!bytes.length || bytes.length > ARCHIVE_LIMIT) fail("Archive size limit exceeded");
  const archive = parseMiniAppJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  exact(archive, ["manifest", "files"]);
  const manifest = validateManifest(archive.manifest);
  if (ownerId !== undefined && manifest.publisher.id !== ownerId)
    fail("Publisher must equal authenticated account");
  if (!Array.isArray(archive.files) || archive.files.length !== manifest.files.length)
    fail("Unlisted archive content");
  const seen = new Set();
  for (const file of archive.files) {
    exact(file, ["path", "data"]);
    const expected = manifest.files.find((f) => f.path === file.path);
    if (
      !expected ||
      seen.has(file.path) ||
      typeof file.data !== "string" ||
      file.data.length > 4 * Math.ceil(expected.size / 3) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.data)
    )
      fail("Invalid archive content");
    seen.add(file.path);
    const decoded = Buffer.from(file.data, "base64");
    if (
      decoded.toString("base64") !== file.data ||
      decoded.length !== expected.size ||
      hash(decoded) !== expected.sha256
    )
      fail("File digest or size mismatch");
  }
  return { manifest, packageId: hash(bytes), archiveBytes: bytes.length };
}
async function boundedRead(filename, limit) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink()) fail("Symlinks and nonregular files are forbidden");
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limit) fail("Not a bounded regular file");
    const buffer = Buffer.alloc(limit + 1);
    let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await handle.read(buffer, count, buffer.length - count, null);
      if (!bytesRead) break;
      count += bytesRead;
    }
    if (count > limit) fail("File size limit exceeded");
    return buffer.subarray(0, count);
  } finally {
    await handle.close();
  }
}
export async function buildPackage(directory, output) {
  const root = resolve(directory);
  if (!(await lstat(root)).isDirectory()) fail("Package root must be a directory, not a symlink");
  const manifest = validateManifest(
    parseMiniAppJson(
      new TextDecoder("utf-8", { fatal: true }).decode(
        await boundedRead(join(root, "manifest.json"), 256 * 1024),
      ),
    ),
  );
  const listed = new Set(manifest.files.map((f) => f.path));
  const found = new Set();
  async function walk(dir, prefix = "") {
    for (const name of await readdir(dir)) {
      const relative = prefix + name;
      const filename = join(dir, name);
      const info = await lstat(filename);
      if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
        fail("Symlinks and nonregular content are forbidden");
      if (info.isDirectory()) {
        path(relative);
        if (![...listed].some((p) => p.startsWith(relative + "/"))) fail("Unlisted directory");
        await walk(filename, relative + "/");
      } else if (relative !== "manifest.json") {
        if (!listed.has(relative)) fail(`Unlisted content: ${relative}`);
        found.add(relative);
      }
    }
  }
  await walk(root);
  if (found.size !== listed.size) fail("Missing listed files");
  const files = [];
  for (const file of manifest.files)
    files.push({
      path: file.path,
      data: (await boundedRead(join(root, file.path), file.size)).toString("base64"),
    });
  const bytes = Buffer.from(JSON.stringify({ manifest, files }));
  const result = validateArchive(bytes);
  if (output) await writeFile(output, bytes, { flag: "wx" });
  return { ...result, bytes };
}
export async function miniAppsCommand(action, id, extra, request, options = {}) {
  if (action === "build") {
    if (!id || !extra) fail("mini-apps build requires DIRECTORY OUTPUT");
    const { bytes, ...result } = await buildPackage(id, extra);
    return result;
  }
  if (action === "validate") {
    if (!id) fail("mini-apps validate requires ARCHIVE");
    return validateArchive(await boundedRead(id, ARCHIVE_LIMIT));
  }
  if (action === "publish") {
    if (!id) fail("mini-apps publish requires ARCHIVE");
    const status = await request("/api/agent/auth/status");
    if (status.authenticated !== true || typeof status.userId !== "string" || !status.userId)
      fail("Server did not identify authenticated publisher");
    const bytes = await boundedRead(id, ARCHIVE_LIMIT);
    validateArchive(bytes, status.userId);
    return request("/api/agent/mini-apps/publish", { method: "POST", body: bytes });
  }
  if (action === "list" || action === "review" || action === "export" || action === "keys")
    return request(`/api/agent/mini-apps/${action === "list" ? "" : action}`);
  if (["get", "archive", "report", "block", "disable", "remove", "offer"].includes(action)) {
    if (!/^[a-f0-9]{64}$/.test(id ?? "")) fail(`${action} requires package SHA-256`);
    const base = `/api/agent/mini-apps/${id}`;
    if (action === "get" || action === "archive")
      return request(base + (action === "archive" ? "/archive" : ""));
    if (action !== "offer") {
      const reason = typeof options.reason === "string" ? options.reason.trim() : "";
      if (!reason || reason.length > 500) fail(`${action} requires --reason (1–500 characters)`);
      return request(base + (action === "remove" ? "" : `/${action}`), {
        method: action === "remove" ? "DELETE" : "POST", body: JSON.stringify({ reason }),
      });
    }
    return request(`/api/agent/mini-apps/${id}/offer`, { method: "POST", body: "{}" });
  }
  fail("Unknown mini-apps command");
}
