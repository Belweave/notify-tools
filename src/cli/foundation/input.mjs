// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "./errors.mjs";

export async function readStdinJson() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  try {
    return JSON.parse(input);
  } catch {
    throw new UsageError("stdin must contain valid JSON");
  }
}
