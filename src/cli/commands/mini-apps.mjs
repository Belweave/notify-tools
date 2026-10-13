// SPDX-License-Identifier: Apache-2.0
import { miniAppsCommand } from "./mini-app-package.mjs";
import { scopedRequest } from "../foundation/transport.mjs";
export async function handleMiniApps({ action, id, positionals, options, config }) {
  return { body: await miniAppsCommand(action, id, positionals[3],
    (path, init) => scopedRequest(config, path, init), options), exitCode: 0 };
}
