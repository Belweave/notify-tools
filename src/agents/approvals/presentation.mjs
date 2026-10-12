// SPDX-License-Identifier: Apache-2.0
import { basename } from "node:path";

export const PERMISSION_IMAGE_URLS = {
  "Claude Code": "https://notify.belweave.ai/agents/claude.png",
  Codex: "https://notify.belweave.ai/agents/codex.png",
  OpenCode: "https://notify.belweave.ai/agents/opencode.png",
};

export function safeText(value, fallback, maxLength = 48) {
  const printable = Array.from(String(value ?? fallback), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("");
  const text = printable.replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, maxLength);
}

export function permissionSummary({ agent, cwd, toolName, resourceCount }) {
  const agentName = safeText(agent, "Coding agent", 32);
  const project = safeText(basename(cwd || "") || "project", "project", 48);
  const tool = safeText(toolName, "tool", 48);
  const count = Number.isInteger(resourceCount) && resourceCount > 0 ? resourceCount : 1;
  return {
    title: `${agentName} permission`,
    body: `${agentName} requests ${tool} permission in ${project} for ${count} resource${count === 1 ? "" : "s"}. Allow once?`,
    ...(PERMISSION_IMAGE_URLS[agentName] ? { imageUrl: PERMISSION_IMAGE_URLS[agentName] } : {}),
  };
}
