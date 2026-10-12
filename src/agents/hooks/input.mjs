// SPDX-License-Identifier: Apache-2.0

export const MAX_INPUT_BYTES = 1024 * 1024;

export async function readHookInput(stream = process.stdin) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new Error("Hook input is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
