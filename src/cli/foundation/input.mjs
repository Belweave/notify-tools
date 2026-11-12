// SPDX-License-Identifier: Apache-2.0
import { UsageError } from "./errors.mjs";

/** Largest stdin the CLI reads; notification bodies are capped well below this. */
const STDIN_MAX_BYTES = 1024 * 1024;

async function readStdin(stream = process.stdin) {
  if (stream.isTTY) {
    throw new UsageError("Expected input on stdin, but stdin is a terminal. Pipe the input in.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > STDIN_MAX_BYTES) throw new UsageError("stdin is larger than 1 MiB");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readStdinJson(stream) {
  const input = await readStdin(stream);
  try {
    return JSON.parse(input);
  } catch {
    throw new UsageError("stdin must contain valid JSON");
  }
}

/** Reads plain text for a `-` body or prompt, trimming one trailing newline. */
export async function readStdinText(stream) {
  const input = (await readStdin(stream)).replace(/\r?\n$/, "");
  if (input.trim().length === 0) throw new UsageError("stdin was empty");
  return input;
}

/** Resolves a positional body: `-` alone reads stdin, anything else is joined text. */
export async function textArgument(parts, runtime) {
  if (parts.length === 1 && parts[0] === "-") return readStdinText(runtime?.stdin);
  return parts.join(" ");
}
