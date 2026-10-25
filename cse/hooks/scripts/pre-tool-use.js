// src/daemon/hooks/pre-tool-use.ts
var DAEMON_URL = process.env.CASCADE_DAEMON_URL || "http://127.0.0.1:7433";
async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  try {
    const hookInput = JSON.parse(input);
    const result = await processHook(hookInput);
    if (result) {
      console.log(JSON.stringify(result));
    }
  } catch (error) {
    console.error("[Cascade Hook] Error:", error);
  }
}
async function processHook(input) {
  const { tool_name, tool_input } = input;
  if ((tool_name === "Write" || tool_name === "Edit") && tool_input.file_path) {
    const filePath = tool_input.file_path;
    if (filePath.includes(".planning/")) {
      await notifyDaemon("file-change", {
        action: "pre-write",
        path: filePath,
        tool: tool_name
      });
    }
  }
  if (tool_name === "Task") {
    const subagentType = tool_input.subagent_type;
    if (subagentType?.startsWith("cse-")) {
      await notifyDaemon("agent-spawn", {
        type: subagentType,
        description: tool_input.description
      });
    }
  }
  if (tool_name === "Bash") {
    const command = tool_input.command;
    if (command.includes("git commit")) {
      await notifyDaemon("git-commit", {
        command
      });
    }
  }
  return null;
}
async function notifyDaemon(event, data) {
  try {
    await fetch(`${DAEMON_URL}/api/hooks/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data, timestamp: (/* @__PURE__ */ new Date()).toISOString() }),
      signal: AbortSignal.timeout(1e3)
      // Don't wait too long
    });
  } catch {
  }
}
main();
