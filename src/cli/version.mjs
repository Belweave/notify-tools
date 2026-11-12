// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from "node:fs";

/* global NOTIFY_TOOLS_VERSION */
/** The release build defines NOTIFY_TOOLS_VERSION; a source checkout reads package.json. */
export const VERSION =
  typeof NOTIFY_TOOLS_VERSION === "string"
    ? NOTIFY_TOOLS_VERSION
    : JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;
