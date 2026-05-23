export type CodexCommand =
  | { kind: "home" }
  | { kind: "projects" }
  | { kind: "run"; projectKey: string; prompt: string }
  | { kind: "reply"; taskId?: string; prompt: string }
  | { kind: "status"; taskId?: string }
  | { kind: "help" };

export type CommandParseOptions = {
  prefixes: string[];
  projectKeys: string[];
  defaultProjectKey?: string;
};

export function hasCommandPrefix(content: string, prefixes: string[]) {
  return getCommandRest(content, prefixes) !== null;
}

export function parseCommand(content: string, options: CommandParseOptions): CodexCommand | null {
  const rest = getCommandRest(content, options.prefixes);
  if (rest === null) return null;

  if (!rest || ["home", "menu", "\u4e3b\u9875", "\u83dc\u5355"].includes(rest)) return { kind: "home" };
  if (["help", "h", "\u5e2e\u52a9"].includes(rest)) return { kind: "help" };
  if (["projects", "project", "p", "\u9879\u76ee", "\u5217\u8868"].includes(rest)) return { kind: "projects" };

  const [verb, ...parts] = rest.split(/\s+/);
  if (["run", "r", "start", "new", "\u6267\u884c", "\u65b0", "\u5f00\u59cb"].includes(verb)) {
    const projectKey = parts.shift();
    if (!projectKey) return options.defaultProjectKey ? { kind: "run", projectKey: options.defaultProjectKey, prompt: defaultPrompt() } : { kind: "help" };
    const prompt = parts.join(" ").trim();
    if (projectKey.includes(":") && !prompt) {
      const [templateProjectKey, templateKey] = projectKey.split(":", 2);
      if (!templateProjectKey || !templateKey) return { kind: "help" };
      return { kind: "run", projectKey: templateProjectKey, prompt: `template:${templateKey}` };
    }
    if (!prompt && options.defaultProjectKey && !options.projectKeys.includes(projectKey)) {
      return { kind: "run", projectKey: options.defaultProjectKey, prompt: projectKey };
    }
    if (!prompt) return { kind: "help" };
    return { kind: "run", projectKey, prompt };
  }

  if (verb.includes(":") && parts.length === 0) {
    const [projectKey, templateKey] = verb.split(":", 2);
    if (projectKey && templateKey) return { kind: "run", projectKey, prompt: `template:${templateKey}` };
  }

  if (options.projectKeys.includes(verb)) {
    const prompt = parts.join(" ").trim();
    if (!prompt) return { kind: "projects" };
    return { kind: "run", projectKey: verb, prompt };
  }

  if (["reply", "re", "\u7ee7\u7eed"].includes(verb)) {
    const first = parts.shift();
    if (!first) return { kind: "help" };
    if (isTaskId(first)) {
      const prompt = parts.join(" ").trim();
      if (!prompt) return { kind: "help" };
      return { kind: "reply", taskId: first, prompt };
    }
    return { kind: "reply", prompt: [first, ...parts].join(" ").trim() };
  }

  if (["status", "st", "\u72b6\u6001"].includes(verb)) {
    const taskId = parts.shift();
    if (!taskId) return { kind: "status" };
    return { kind: "status", taskId };
  }

  return { kind: "reply", prompt: rest };
}

export const helpText = [
  "\u624b\u673a\u77ed\u6307\u4ee4\uff1a",
  "/c",
  "/c \u9879\u76ee",
  "/c \u72b6\u6001",
  "/c control \u68c0\u67e5\u4e00\u4e0b",
  "/c bridge:readme",
  "/c \u7ee7\u7eed \u8bf7\u7ee7\u7eed",
  "/c \u68c0\u67e5\u4e00\u4e0b",
  "",
  "\u5b8c\u6574\u5199\u6cd5\u4ecd\u53ef\u7528\uff1a",
  "/codex run <projectKey> <prompt>",
  "/codex reply <taskId> <prompt>",
  "/codex status <taskId>"
].join("\n");

function getCommandRest(content: string, prefixes: string[]) {
  const trimmed = content.trim();
  const sortedPrefixes = [...prefixes].sort((a, b) => b.length - a.length);
  for (const prefix of sortedPrefixes) {
    if (trimmed === prefix) return "";
    if (trimmed.startsWith(`${prefix} `)) return trimmed.slice(prefix.length).trim();
  }
  return null;
}

function isTaskId(value: string) {
  return /^task_[a-z0-9]+_[a-z0-9]+$/i.test(value);
}

function defaultPrompt() {
  return "\u8bf7\u68c0\u67e5\u8fd9\u4e2a\u9879\u76ee\uff0c\u7ed9\u51fa\u7b80\u77ed\u7ed3\u8bba\u548c\u4e0b\u4e00\u6b65\u5efa\u8bae\u3002";
}
