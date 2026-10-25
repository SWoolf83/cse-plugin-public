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

// src/daemon/hooks/subagent-stop.ts
var DAEMON_URL = process.env.CASCADE_DAEMON_URL || "http://127.0.0.1:7433";
async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  try {
    const hookInput = JSON.parse(input);
    await processHook(hookInput);
  } catch (error) {
    console.error("[Cascade Hook] Error:", error);
  }
}
async function processHook(input) {
  const { subagent_type, subagent_result } = input;
  emitAgentStatus({ sessionId: input.session_id, event: "subagent-stop" });
  if (!subagent_type?.startsWith("cse-")) {
    return;
  }
  await notifyDaemon("agent-complete", {
    type: subagent_type,
    resultPreview: subagent_result?.slice(0, 500),
    // First 500 chars
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  });
  const lowerResult = subagent_result?.toLowerCase() || "";
  if (lowerResult.includes("error") || lowerResult.includes("failed") || lowerResult.includes("blocked")) {
    await notifyDaemon("agent-issue", {
      type: subagent_type,
      issue: "potential-error",
      resultPreview: subagent_result?.slice(0, 1e3)
    });
  }
  if (lowerResult.includes("checkpoint") || lowerResult.includes("decision required") || lowerResult.includes("need guidance")) {
    await notifyDaemon("checkpoint-detected", {
      type: subagent_type,
      resultPreview: subagent_result?.slice(0, 1e3)
    });
  }
}
async function notifyDaemon(event, data) {
  try {
    await fetch(`${DAEMON_URL}/api/hooks/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data }),
      signal: AbortSignal.timeout(1e3)
    });
  } catch {
  }
}
main();
