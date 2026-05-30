import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

type JsonRpcResponse = {
  id?: number;
  result?: unknown;
  error?: { message?: string; code?: number; data?: unknown };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
};

export type CodexRunInput = {
  prompt: string;
  cwd: string;
  sandbox: "workspace-write";
  "approval-policy": "on-request" | "never";
};

export type CodexReplyInput = {
  threadId: string;
  prompt: string;
};

export type CodexResult = {
  threadId?: string;
  text: string;
  raw: unknown;
};

export class CodexMcpClient {
  private process?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, PendingRequest>();
  private initialized?: Promise<void>;

  async run(input: CodexRunInput): Promise<CodexResult> {
    const result = await this.callTool("codex", input);
    return normalizeToolResult(result);
  }

  async reply(input: CodexReplyInput): Promise<CodexResult> {
    const result = await this.callTool("codex-reply", input);
    return normalizeToolResult(result);
  }

  private async callTool(name: string, args: Record<string, unknown>) {
    await this.ensureStarted();
    return this.request("tools/call", { name, arguments: args });
  }

  private async ensureStarted() {
    if (!this.initialized) this.initialized = this.start();
    return this.initialized;
  }

  private async start() {
    this.process = spawn("codex", ["mcp-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    this.process.once("exit", (code, signal) => {
      const error = new Error(`Codex MCP exited: ${signal ?? code ?? "unknown"}`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
      this.process = undefined;
      this.initialized = undefined;
    });

    this.process.once("error", (err) => {
      for (const pending of this.pending.values()) pending.reject(err);
      this.pending.clear();
      this.process = undefined;
      this.initialized = undefined;
    });

    const stdout = readline.createInterface({ input: this.process.stdout });
    stdout.on("line", (line) => this.handleLine(line));

    this.process.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8").trim();
      if (text) console.warn(`[codex-mcp] ${text}`);
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "kook-codex-bridge", version: "0.1.0" }
    });
    this.notify("notifications/initialized", {});
  }

  private handleLine(line: string) {
    if (!line.trim()) return;
    let message: JsonRpcResponse;
    try {
      message = JSON.parse(line) as JsonRpcResponse;
    } catch {
      console.warn("[codex-mcp] ignored non-JSON output");
      return;
    }

    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message || `MCP error ${message.error.code ?? ""}`.trim()));
      return;
    }
    pending.resolve(message.result);
  }

  private request(method: string, params: Record<string, unknown>) {
    const proc = this.process;
    if (!proc || !proc.stdin.writable) throw new Error("Codex MCP is not running");
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      proc.stdin.write(`${JSON.stringify(payload)}\n`, (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  private notify(method: string, params: Record<string, unknown>) {
    const proc = this.process;
    if (!proc || !proc.stdin.writable) return;
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }
}

function normalizeToolResult(raw: unknown): CodexResult {
  const record = raw as {
    content?: Array<{ type?: string; text?: string }>;
    structuredContent?: { threadId?: string; output?: string; finalMessage?: string };
  };

  const textParts = record.content
    ?.filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .filter(Boolean);

  const structuredText = record.structuredContent?.finalMessage ?? record.structuredContent?.output;
  return {
    threadId: record.structuredContent?.threadId,
    text: textParts?.join("\n") || structuredText || JSON.stringify(raw, null, 2),
    raw
  };
}

export const codexClient = new CodexMcpClient();
