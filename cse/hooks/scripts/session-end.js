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

// src/daemon/hooks/session-end.ts
async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  try {
    const hookInput = JSON.parse(input);
    if (hookInput && hookInput.session_id) {
      emitAgentStatus({ sessionId: hookInput.session_id, event: "close" });
    }
  } catch (error) {
    console.error("[Cascade SessionEnd Hook] Error:", error);
  }
}
main();
