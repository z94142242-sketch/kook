export type CodexCommand =
  | { kind: "home" }
  | { kind: "projects" }
  | { kind: "run"; projectKey: string; prompt: string }
  | { kind: "reply"; taskId?: string; prompt: string }
  | { kind: "status"; taskId?: string }
  | { kind: "help" };

export function parseCommand(content: string): CodexCommand | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("/codex")) return null;

  const rest = trimmed.slice("/codex".length).trim();
  if (!rest || rest === "help") return { kind: "help" };
  if (rest === "home") return { kind: "home" };
  if (rest === "projects") return { kind: "projects" };

  const [verb, ...parts] = rest.split(/\s+/);
  if (verb === "run") {
    const projectKey = parts.shift();
    const prompt = parts.join(" ").trim();
    if (!projectKey) return { kind: "help" };
    if (projectKey.includes(":") && !prompt) {
      const [templateProjectKey, templateKey] = projectKey.split(":", 2);
      if (!templateProjectKey || !templateKey) return { kind: "help" };
      return { kind: "run", projectKey: templateProjectKey, prompt: `template:${templateKey}` };
    }
    if (!prompt) return { kind: "help" };
    return { kind: "run", projectKey, prompt };
  }

  if (verb === "reply") {
    const first = parts.shift();
    if (!first) return { kind: "help" };
    if (isTaskId(first)) {
      const prompt = parts.join(" ").trim();
      if (!prompt) return { kind: "help" };
      return { kind: "reply", taskId: first, prompt };
    }
    return { kind: "reply", prompt: [first, ...parts].join(" ").trim() };
  }

  if (verb === "status") {
    const taskId = parts.shift();
    if (!taskId) return { kind: "status" };
    return { kind: "status", taskId };
  }

  return { kind: "reply", prompt: rest };
}

export const helpText = [
  "\u53ef\u7528\u547d\u4ee4\uff1a",
  "/codex home",
  "/codex projects",
  "/codex run <projectKey> <prompt>",
  "/codex run <projectKey>:<templateKey>",
  "/codex reply <taskId> <prompt>",
  "/codex reply <prompt>",
  "/codex <prompt>",
  "/codex status <taskId>"
].join("\n");

function isTaskId(value: string) {
  return /^task_[a-z0-9]+_[a-z0-9]+$/i.test(value);
}
