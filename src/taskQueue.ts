import { config } from "./config.js";

export type QueueJob = {
  taskId: string;
  projectKey: string;
  run: () => Promise<void>;
};

export class TaskQueue {
  private active = 0;
  private pending: QueueJob[] = [];

  enqueue(job: QueueJob) {
    this.pending.push(job);
    return this.position(job.taskId);
  }

  start() {
    this.drain();
  }

  previewPosition() {
    return this.active < config.maxConcurrentTasks && this.pending.length === 0 ? 0 : this.pending.length + 1;
  }

  position(taskId: string) {
    const index = this.pending.findIndex((job) => job.taskId === taskId);
    return index === -1 ? 0 : index + 1;
  }

  stats() {
    return {
      active: this.active,
      pending: this.pending.length,
      limit: config.maxConcurrentTasks
    };
  }

  private drain() {
    while (this.active < config.maxConcurrentTasks && this.pending.length > 0) {
      const job = this.pending.shift();
      if (!job) return;
      this.active += 1;
      void job
        .run()
        .catch((err) => {
          console.error(`[queue] task failed outside handler taskId=${job.taskId} error=${toSafeMessage(err)}`);
        })
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }
}

function toSafeMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export const taskQueue = new TaskQueue();
