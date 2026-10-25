// src/daemon/hooks/post-tool-use.ts
import { readFileSync as readFileSync2 } from "fs";
import { join as join2 } from "path";
import { homedir as homedir2 } from "os";

// src/daemon/hooks/agent-status-emit.ts
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var AGENT_STATUS_DIR = join(homedir(), ".cascade", "agent-status");
var AGENT_STATUS_LOG = join(AGENT_STATUS_DIR, "events.jsonl");
var AGENT_STATUS_LOG_MAX_BYTES = 10 * 1024 * 1024;
function rotateAgentStatusLogIfNeeded(logPath = AGENT_STATUS_LOG, maxBytes = AGENT_STATUS_LOG_MAX_BYTES) {
  try {
    if (statSync(logPath).size <= maxBytes) return false;
    renameSync(logPath, `${logPath}.1`);
    return true;
  } catch {
    return false;
  }
}
function resolveActiveOrg() {
  const out = {};
  try {
    let orgId = process.env.CASCADE_ORG_ID;
    if (!orgId) {
      const envContent = readFileSync(join(homedir(), ".cascade", ".env"), "utf-8");
      orgId = envContent.match(/^CASCADE_ORG_ID=(.+)$/m)?.[1]?.trim();
    }
    if (orgId) out.orgId = orgId;
  } catch {
  }
  try {
    const config = JSON.parse(
      readFileSync(join(homedir(), ".cascade", "config.json"), "utf-8")
    );
    const name = config.activeOrg ? config.orgs?.[config.activeOrg]?.name : void 0;
    if (name) out.orgName = name;
  } catch {
  }
  return out;
}
function emitAgentStatus(e) {
  try {
    if (!e || !e.sessionId || !e.event) return;
    mkdirSync(AGENT_STATUS_DIR, { recursive: true });
    rotateAgentStatusLogIfNeeded();
    const line = JSON.stringify({
      sessionId: e.sessionId,
      event: e.event,
      ...e.tool ? { tool: e.tool } : {},
      ...e.title ? { title: e.title } : {},
      ...e.cwd ? { cwd: e.cwd } : {},
      ...e.orgId ? { orgId: e.orgId } : {},
      ...e.orgName ? { orgName: e.orgName } : {},
      ...e.message ? { message: e.message } : {},
      ...e.notificationType ? { notificationType: e.notificationType } : {},
      at: Date.now()
    }) + "\n";
    appendFileSync(AGENT_STATUS_LOG, line);
  } catch {
  }
}

// src/daemon/hooks/shared/artifact-event.ts
function asRecord(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function asNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}
function parseArtifactHookInput(input) {
  const rec = asRecord(input);
  if (!rec || rec.tool_name !== "Artifact") return null;
  const toolInput = asRecord(rec.tool_input);
  const toolResponse = asRecord(rec.tool_response);
  const filePath = asNonEmptyString(toolInput?.file_path) ?? asNonEmptyString(toolResponse?.path);
  if (!filePath) return null;
  const claudeUrl = asNonEmptyString(toolResponse?.url);
  const title = asNonEmptyString(toolResponse?.title) ?? void 0;
  const sessionId = asNonEmptyString(rec.session_id) ?? "";
  const cwd = asNonEmptyString(rec.cwd) ?? "";
  return { claudeUrl, filePath, title, sessionId, cwd };
}

// src/daemon/hooks/toolOutput.ts
function normalizeToolOutput(raw) {
  if (typeof raw === "string") return raw;
  if (raw === null || raw === void 0) return "";
  if (typeof raw === "object") {
    const rec = raw;
    const parts = [rec.stdout, rec.stderr].filter(
      (v) => typeof v === "string" && v.length > 0
    );
    if (parts.length > 0) return parts.join("\n");
    if (typeof rec.content === "string") return rec.content;
    if (typeof rec.text === "string") return rec.text;
    try {
      return JSON.stringify(raw) ?? "";
    } catch {
      return "";
    }
  }
  return String(raw);
}

// src/daemon/hooks/post-tool-use.ts
var DAEMON_URL = process.env.CASCADE_DAEMON_URL || "http://127.0.0.1:7433";
function isGitTrackingDisabled() {
  if (process.env.CASCADE_DISABLE_GIT_TRACKING === "1" || process.env.CASCADE_DISABLE_GIT_TRACKING === "true") {
    return true;
  }
  try {
    const configPath = join2(homedir2(), ".cascade", "config.json");
    const config = JSON.parse(readFileSync2(configPath, "utf-8"));
    const activeOrg = config.activeOrg;
    if (activeOrg && config.orgs?.[activeOrg]?.git_tracking_enabled === false) {
      return true;
    }
  } catch {
  }
  return false;
}
var OBSERVED_TOOLS = ["Write", "Edit", "Bash", "Task"];
async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  try {
    const hookInput = JSON.parse(input);
    await processHook(hookInput);
  } catch (error) {
    console.error("[Cascade PostToolUse Hook] Error:", error);
  }
}
function formatToolEvent(toolName, toolInput, output) {
  switch (toolName) {
    case "Bash": {
      const command = toolInput.command || "";
      const truncatedOutput = output.slice(0, 2e3);
      return `[Bash] $ ${command}
${truncatedOutput}`;
    }
    case "Write": {
      const filePath = toolInput.file_path || "";
      const content = toolInput.content || "";
      return `[Write] ${filePath}
${content.slice(0, 500)}`;
    }
    case "Edit": {
      const filePath = toolInput.file_path || "";
      const oldString = toolInput.old_string || "";
      const newString = toolInput.new_string || "";
      return `[Edit] ${filePath}: "${oldString.slice(0, 200)}" -> "${newString.slice(0, 200)}"`;
    }
    case "Task": {
      const description = toolInput.description || toolInput.prompt || "";
      return `[Task] ${description}`;
    }
    default:
      return `[${toolName}] ${JSON.stringify(toolInput).slice(0, 500)}`;
  }
}
async function processHook(input) {
  const { tool_name, tool_input, session_id } = input;
  emitAgentStatus({ sessionId: session_id, event: "tool", tool: tool_name, ...resolveActiveOrg() });
  const fromOutput = normalizeToolOutput(input.tool_output);
  const output = fromOutput !== "" ? fromOutput : normalizeToolOutput(input.tool_response);
  if (tool_name === "Bash" && !isGitTrackingDisabled()) {
    await checkForGitCommit(tool_input, output, session_id);
  }
  if (tool_name === "Artifact") {
    const payload = parseArtifactHookInput(input);
    if (payload) {
      await notifyDaemon("artifact-published", payload);
    } else {
      console.error("[Cascade PostToolUse Hook] Artifact publish payload not parseable (no file_path) \u2014 skipping capture");
    }
    return;
  }
  if (!OBSERVED_TOOLS.includes(tool_name)) {
    return;
  }
  const message = formatToolEvent(tool_name, tool_input, output);
  await notifyDaemon("observation-event", {
    sessionId: session_id,
    toolName: tool_name,
    message
  });
}
async function checkForGitCommit(toolInput, output, sessionId) {
  const command = toolInput.command || "";
  if (!/\bgit\s+commit\b/.test(command) || /--amend/.test(command)) {
    return;
  }
  const commitMatch = output.match(/\[([\w/.-]+)\s+([0-9a-f]{7,})\]/);
  if (!commitMatch) {
    return;
  }
  const branch = commitMatch[1];
  const sha = commitMatch[2];
  const msgMatch = command.match(/-m\s+(?:"([^"]+)"|'([^']+)'|(\S+))/);
  let message = msgMatch ? msgMatch[1] || msgMatch[2] || msgMatch[3] || "" : "";
  if (!message) {
    const outputMsgMatch = output.match(/\[[\w/.-]+\s+[0-9a-f]{7,}\]\s+(.+)/);
    if (outputMsgMatch) {
      message = outputMsgMatch[1].trim();
    }
  }
  await notifyDaemon("git-commit", {
    sessionId,
    sha,
    branch,
    message: message.slice(0, 200),
    command: command.slice(0, 500)
  });
}
async function notifyDaemon(event, data) {
  try {
    await fetch(`${DAEMON_URL}/api/hooks/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data, timestamp: (/* @__PURE__ */ new Date()).toISOString() }),
      signal: AbortSignal.timeout(1e3)
    });
  } catch {
  }
}
main();
