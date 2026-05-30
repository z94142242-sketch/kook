import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

export type TaskStatus = "queued" | "running" | "completed" | "failed";

export type TaskRecord = {
  taskId: string;
  projectKey: string;
  cwd: string;
  threadId?: string;
  prompt: string;
  finalReply?: string;
  status: TaskStatus;
  statusMessageId?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

type TaskFile = {
  tasks: TaskRecord[];
};

export class TaskStore {
  private tasks = new Map<string, TaskRecord>();
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  async load() {
    if (this.loaded) return;
    await fs.mkdir(path.dirname(config.taskStorePath), { recursive: true });
    try {
      const raw = await fs.readFile(config.taskStorePath, "utf8");
      const parsed = JSON.parse(raw) as TaskFile;
      for (const task of parsed.tasks ?? []) this.tasks.set(task.taskId, task);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    this.loaded = true;
  }

  list() {
    return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  get(taskId: string) {
    return this.tasks.get(taskId);
  }

  latest() {
    return this.list()[0];
  }

  async create(input: Pick<TaskRecord, "projectKey" | "cwd" | "prompt">) {
    const now = new Date().toISOString();
    const task: TaskRecord = {
      taskId: makeTaskId(),
      projectKey: input.projectKey,
      cwd: input.cwd,
      prompt: input.prompt,
      status: "running",
      createdAt: now,
      updatedAt: now
    };
    this.tasks.set(task.taskId, task);
    await this.save();
    return task;
  }

  async update(taskId: string, patch: Partial<Omit<TaskRecord, "taskId" | "createdAt">>) {
    const existing = this.tasks.get(taskId);
    if (!existing) throw new Error("Task not found");
    const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.tasks.set(taskId, next);
    await this.save();
    return next;
  }

  private async save() {
    const data: TaskFile = { tasks: this.list() };
    this.writeQueue = this.writeQueue.then(() =>
      fs.writeFile(config.taskStorePath, JSON.stringify(data, null, 2), "utf8")
    );
    return this.writeQueue;
  }
}

function makeTaskId() {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `task_${Date.now().toString(36)}_${suffix}`;
}

export const taskStore = new TaskStore();
