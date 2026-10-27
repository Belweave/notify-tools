// SPDX-License-Identifier: Apache-2.0
// Node.js October 21, 2026 security fixes; keep engines and CI pins in sync.
export const NODE_ENGINE_RANGE = "^22.23.4 || ^24.22.1 || ^26.12.1";
const floors = new Map([[22, [23, 4]], [24, [22, 1]], [26, [12, 1]]]);

export function isSupportedNodeVersion(version) {
  if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    return false;
  const [major, minor, patch] = version.split(".").map(Number);
  if (![major, minor, patch].every(Number.isSafeInteger)) return false;
  const minimum = floors.get(major);
  return !!minimum && (minor > minimum[0] || (minor === minimum[0] && patch >= minimum[1]));
}

export function assertSupportedNode(version = process.versions.node) {
  if (!isSupportedNodeVersion(version))
    throw new Error(`Node.js ${version} is unsupported. Use Node.js 22.23.4+, 24.22.1+ or 26.12.1+ within those supported major lines.`);
}
