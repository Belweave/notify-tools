#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { run } from "../src/cli/index.mjs";
process.exitCode = await run(process.argv.slice(2));
