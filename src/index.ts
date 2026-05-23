import fs from "node:fs";
import { codexClient } from "./codexClient.js";
import { helpText, parseCommand } from "./commands.js";
import { config } from "./config.js";
import { KookClient, type KookEvent } from "./kookClient.js";
import { getProject, getProjects, loadProjects } from "./projects.js";
import { buildHomeCard, buildProjectCards, buildRiskConfirmCard, buildTaskCard, parseCardAction } from "./taskCard.js";
import { taskQueue } from "./taskQueue.js";
import { taskStore } from "./taskStore.js";

type PendingRiskRun = {
  projectKey: string;
  prompt: string;
  createdAt: number;
};

const pendingRiskRuns = new Map<string, PendingRiskRun>();
const RISK_TTL_MS = 5 * 60 * 1000;

async function main() {
  await taskStore.load();
  await loadProjects();
  validateProjectDirectories();

  let kook!: KookClient;
  kook = new KookClient((event) => handleMessage(kook, event));
  await kook.connect();

  process.on("SIGINT", () => {
    kook.close();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    kook.close();
    process.exit(0);
  });
}

async function handleMessage(kook: KookClient, event: KookEvent) {
  if (isCardButtonEvent(event)) {
    await handleCardAction(kook, event);
    return;
  }

  const command = parseCommand(event.content ?? "", {
    prefixes: config.commandPrefixes,
    projectKeys: Object.keys(getProjects()),
    defaultProjectKey: config.defaultProjectKey
  });
  if (!command) return;

  if (command.kind === "help") {
    await kook.sendMessage(helpText);
    return;
  }

  if (command.kind === "home") {
    await sendHomeCard(kook);
    return;
  }

  if (command.kind === "projects") {
    await sendProjectsCard(kook);
    return;
  }

  if (command.kind === "status") {
    const task = command.taskId ? taskStore.get(command.taskId) : taskStore.latest();
    if (!task) {
      await kook.sendMessage(ZH.taskNotFound);
      return;
    }
    await kook.sendMessage(
      [
        `${ZH.taskLabel}${task.taskId}`,
        `${ZH.projectLabel}${task.projectKey}`,
        `${ZH.statusLabel}${task.status}`,
        `${ZH.cwdLabel}${task.cwd}`,
        `Thread: ${task.threadId ?? ZH.none}`,
        `${ZH.latestOutput}\n${task.finalReply ?? task.error ?? ZH.noOutput}`
      ].join("\n")
    );
    return;
  }

  if (command.kind === "run") {
    const prompt = resolvePrompt(command.projectKey, command.prompt);
    if (!prompt) {
      await kook.sendMessage(ZH.templateNotFound);
      return;
    }
    await requestRun(kook, command.projectKey, prompt);
    return;
  }

  if (command.kind === "reply") {
    const task = command.taskId ? taskStore.get(command.taskId) : taskStore.latest();
    if (!task) {
      if (!command.taskId && config.defaultProjectKey) {
        await requestRun(kook, config.defaultProjectKey, command.prompt);
        return;
      }
      await kook.sendMessage(ZH.taskNotFound);
      return;
    }
    if (!task.threadId) {
      await kook.sendMessage(ZH.noThread);
      return;
    }
    if (task.status === "running") {
      await kook.sendMessage(ZH.stillRunning);
      return;
    }
    if (task.status === "queued") {
      await kook.sendMessage(ZH.alreadyQueued);
      return;
    }

    const queuedTask = await taskStore.update(task.taskId, {
      status: "queued",
      prompt: command.prompt,
      error: undefined
    });
    const position = taskQueue.previewPosition();
    await updateTaskCard(kook, queuedTask, position);
    taskQueue.enqueue({
      taskId: task.taskId,
      projectKey: task.projectKey,
      run: () => replyTask(kook, task.taskId, task.threadId as string, command.prompt)
    });
    taskQueue.start();
    logTask("reply-queued", task.taskId, task.projectKey, `position=${position}`);
  }
}

async function handleCardAction(kook: KookClient, event: KookEvent) {
  const action = parseCardAction(event.extra?.body?.value);
  if (!action) return;

  if (action.action === "projects") {
    await sendProjectsCard(kook);
    return;
  }

  if (action.action === "home") {
    await sendHomeCard(kook);
    return;
  }

  if (action.action === "help") {
    await kook.sendMessage(helpText);
    return;
  }

  if (action.action === "run_template") {
    if (!action.projectKey || !action.templateKey) {
      await kook.sendMessage(ZH.templateNotFound);
      return;
    }
    const prompt = resolvePrompt(action.projectKey, `template:${action.templateKey}`);
    if (!prompt) {
      await kook.sendMessage(ZH.templateNotFound);
      return;
    }
    await requestRun(kook, action.projectKey, prompt);
    return;
  }

  if (action.action === "confirm_run") {
    if (!action.token) return;
    const pending = pendingRiskRuns.get(action.token);
    if (!pending || Date.now() - pending.createdAt > RISK_TTL_MS) {
      pendingRiskRuns.delete(action.token);
      await kook.sendMessage(ZH.confirmExpired);
      return;
    }
    pendingRiskRuns.delete(action.token);
    await enqueueRun(kook, pending.projectKey, pending.prompt);
    return;
  }

  if (action.action === "cancel_risk") {
    if (action.token) pendingRiskRuns.delete(action.token);
    await kook.sendMessage(ZH.cancelled);
    return;
  }

  if (action.action === "project_latest") {
    if (!action.projectKey) return;
    const task = latestTaskForProject(action.projectKey);
    if (!task) {
      await kook.sendMessage(ZH.taskNotFound);
      return;
    }
    await kook.sendCard(buildTaskCard(task, taskQueue.stats()));
    return;
  }

  if (!action.taskId) {
    await kook.sendMessage(ZH.taskNotFound);
    return;
  }

  const task = taskStore.get(action.taskId);
  if (!task) {
    await kook.sendMessage(ZH.taskNotFound);
    return;
  }

  if (action.action === "status") {
    await kook.sendCard(buildTaskCard(task, taskQueue.stats()));
    return;
  }

  if (action.action === "full_output") {
    await kook.sendMessage(task.finalReply ?? task.error ?? ZH.noOutput);
  }
}

async function requestRun(kook: KookClient, projectKey: string, prompt: string) {
  const project = getProject(projectKey);
  if (!project) {
    await kook.sendMessage(ZH.projectNotFound);
    return;
  }

  if (isHighRiskPrompt(prompt)) {
    cleanupRiskRuns();
    const token = makeRiskToken();
    pendingRiskRuns.set(token, { projectKey, prompt, createdAt: Date.now() });
    await kook.sendCard(buildRiskConfirmCard({ token, projectKey, prompt }));
    return;
  }

  await enqueueRun(kook, projectKey, prompt);
}

async function enqueueRun(kook: KookClient, projectKey: string, prompt: string) {
  const project = getProject(projectKey);
  if (!project) {
    await kook.sendMessage(ZH.projectNotFound);
    return;
  }

  const task = await taskStore.create({
    projectKey,
    cwd: project.cwd,
    prompt
  });
  const queuedTask = await taskStore.update(task.taskId, { status: "queued" });
  const position = taskQueue.previewPosition();
  const statusMessageId = await sendTaskCard(kook, queuedTask, position);
  if (statusMessageId) await taskStore.update(task.taskId, { statusMessageId });

  taskQueue.enqueue({
    taskId: task.taskId,
    projectKey,
    run: () => runTask(kook, task.taskId, project.cwd, projectKey, prompt)
  });
  taskQueue.start();
  logTask("queued", task.taskId, projectKey, `position=${position}`);
}

async function runTask(kook: KookClient, taskId: string, cwd: string, projectKey: string, prompt: string) {
  try {
    const project = getProject(projectKey);
    if (!project || project.cwd !== cwd) throw new Error("Project whitelist mismatch");
    const runningTask = await taskStore.update(taskId, { status: "running" });
    await updateTaskCard(kook, runningTask);
    logTask("started", taskId, projectKey);

    const result = await withTimeout(
      codexClient.run({
        prompt,
        cwd,
        sandbox: "workspace-write",
        "approval-policy": config.approvalPolicy
      }),
      config.codexTaskTimeoutMs
    );

    const completedTask = await taskStore.update(taskId, {
      status: "completed",
      threadId: result.threadId,
      finalReply: result.text,
      error: undefined
    });
    await updateTaskCard(kook, completedTask);
    logTask("completed", taskId, projectKey);
  } catch (err) {
    const message = toUserError(err);
    const failedTask = await taskStore.update(taskId, { status: "failed", error: message });
    await updateTaskCard(kook, failedTask);
    logTask("failed", taskId, projectKey, message);
  }
}

async function replyTask(kook: KookClient, taskId: string, threadId: string, prompt: string) {
  try {
    const task = taskStore.get(taskId);
    const runningTask = await taskStore.update(taskId, { status: "running" });
    await updateTaskCard(kook, runningTask);
    logTask("continued", taskId, task?.projectKey ?? "unknown");
    const result = await withTimeout(codexClient.reply({ threadId, prompt }), config.codexTaskTimeoutMs);
    const completedTask = await taskStore.update(taskId, {
      status: "completed",
      threadId: result.threadId ?? threadId,
      finalReply: result.text,
      error: undefined
    });
    await updateTaskCard(kook, completedTask);
    logTask("reply-completed", taskId, task?.projectKey ?? "unknown");
  } catch (err) {
    const message = toUserError(err);
    const failedTask = await taskStore.update(taskId, { status: "failed", error: message });
    await updateTaskCard(kook, failedTask);
    const task = taskStore.get(taskId);
    logTask("reply-failed", taskId, task?.projectKey ?? "unknown", message);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Codex task timed out")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function logTask(event: string, taskId: string, projectKey: string, detail?: string) {
  const safeDetail = detail ? ` detail=${detail.slice(0, 200).replace(/\s+/g, " ")}` : "";
  console.log(`[task] event=${event} taskId=${taskId} projectKey=${projectKey}${safeDetail}`);
}

async function updateTaskCard(kook: KookClient, task: NonNullable<ReturnType<typeof taskStore.get>>, queuePosition?: number) {
  if (!task.statusMessageId) return;
  try {
    await kook.updateCard(task.statusMessageId, buildTaskCard(task, { queuePosition, ...taskQueue.stats() }));
  } catch (err) {
    console.warn(`[kook] task card update failed taskId=${task.taskId} error=${toLogMessage(err)}`);
  }
}

async function sendTaskCard(kook: KookClient, task: NonNullable<ReturnType<typeof taskStore.get>>, queuePosition?: number) {
  try {
    return await kook.sendCard(buildTaskCard(task, { queuePosition, ...taskQueue.stats() }));
  } catch (err) {
    console.warn(`[kook] task card send failed taskId=${task.taskId} error=${toLogMessage(err)}`);
    await kook.sendMessage(`${ZH.taskQueued}${task.taskId}`);
    return undefined;
  }
}

async function sendHomeCard(kook: KookClient) {
  await kook.sendCard(
    buildHomeCard({
      gatewayOnline: true,
      codexAvailable: true,
      ...taskQueue.stats(),
      projectCount: Object.keys(getProjects()).length,
      latestTask: taskStore.latest()
    })
  );
}

async function sendProjectsCard(kook: KookClient) {
  const latestByProject: Record<string, ReturnType<typeof taskStore.get> | undefined> = {};
  for (const key of Object.keys(getProjects())) {
    latestByProject[key] = latestTaskForProject(key);
  }
  await kook.sendCard(buildProjectCards(getProjects(), latestByProject));
}

function latestTaskForProject(projectKey: string) {
  return taskStore.list().find((task) => task.projectKey === projectKey);
}

function resolvePrompt(projectKey: string, prompt: string) {
  if (!prompt.startsWith("template:")) return prompt;
  const templateKey = prompt.slice("template:".length);
  return getProject(projectKey)?.templates?.[templateKey];
}

function isHighRiskPrompt(prompt: string) {
  const riskWords = [
    "\u5220\u9664",
    "\u6e05\u7a7a",
    "\u8986\u76d6",
    "\u53d1\u5e03",
    "\u91cd\u7f6e",
    "\u6279\u91cf",
    "\u8fc1\u79fb"
  ];
  if (riskWords.some((word) => prompt.includes(word))) return true;
  return /(remove-item|rm\s|del\s|rmdir|drop\s+table|truncate)/i.test(prompt);
}

function makeRiskToken() {
  return `risk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanupRiskRuns() {
  const now = Date.now();
  for (const [token, run] of pendingRiskRuns.entries()) {
    if (now - run.createdAt > RISK_TTL_MS) pendingRiskRuns.delete(token);
  }
}

function isCardButtonEvent(event: KookEvent) {
  return event.extra?.type === "message_btn_click" || event.extra?.body?.value !== undefined;
}

function validateProjectDirectories() {
  for (const [key, project] of Object.entries(getProjects())) {
    if (project.sandbox !== "workspace-write") {
      throw new Error(`Unsupported sandbox for project ${key}`);
    }
    if (!fs.existsSync(project.cwd)) {
      console.warn(`[config] project ${key} cwd does not exist yet: ${project.cwd}`);
    }
  }
}

function toUserError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  if (/token|authorization|bot\s+/i.test(message)) return ZH.configFailed;
  if (/codex/i.test(message)) return ZH.codexFailed;
  return message || ZH.executeFailed;
}

function toLogMessage(err: unknown) {
  return err instanceof Error ? err.message.slice(0, 200).replace(/\s+/g, " ") : String(err).slice(0, 200);
}

const ZH = {
  availableProjects: "\u53ef\u7528\u9879\u76ee\uff1a",
  taskNotFound: "\u4efb\u52a1\u4e0d\u5b58\u5728\u3002",
  taskLabel: "\u4efb\u52a1\uff1a",
  projectLabel: "\u9879\u76ee\uff1a",
  statusLabel: "\u72b6\u6001\uff1a",
  cwdLabel: "\u76ee\u5f55\uff1a",
  latestOutput: "\u6700\u8fd1\u8f93\u51fa\uff1a",
  none: "\u6682\u65e0",
  noOutput: "\u6682\u65e0\u8f93\u51fa",
  projectNotFound: "\u9879\u76ee\u4e0d\u5b58\u5728\uff0c\u8bf7\u4f7f\u7528 /codex projects \u67e5\u770b\u53ef\u7528\u9879\u76ee\u3002",
  templateNotFound: "\u4efb\u52a1\u6a21\u677f\u4e0d\u5b58\u5728\u3002",
  confirmExpired: "\u786e\u8ba4\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u53d1\u8d77\u4efb\u52a1\u3002",
  cancelled: "\u5df2\u53d6\u6d88\u3002",
  taskStarted: "\u5df2\u542f\u52a8\u4efb\u52a1\uff1a",
  noThread: "\u8fd9\u4e2a\u4efb\u52a1\u8fd8\u6ca1\u6709\u53ef\u7ee7\u7eed\u7684 Codex threadId\u3002",
  stillRunning: "\u4efb\u52a1\u4ecd\u5728\u8fd0\u884c\uff0c\u8bf7\u7a0d\u540e\u518d\u7ee7\u7eed\u3002",
  alreadyQueued: "\u8fd9\u4e2a\u4efb\u52a1\u5df2\u5728\u961f\u5217\u4e2d\uff0c\u8bf7\u7b49\u5f85\u6267\u884c\u3002",
  taskQueued: "\u5df2\u6392\u961f\u4efb\u52a1\uff1a",
  queuePosition: "\u961f\u5217\u4f4d\u7f6e\uff1a",
  queueStats: "\u5f53\u524d\u8fd0\u884c\uff1a",
  taskContinued: "\u5df2\u7ee7\u7eed\u4efb\u52a1\uff1a",
  taskCompleted: "\u4efb\u52a1\u5b8c\u6210\uff1a",
  taskFailed: "\u4efb\u52a1\u5931\u8d25\uff1a",
  replyCompleted: "\u4efb\u52a1\u7ee7\u7eed\u5b8c\u6210\uff1a",
  replyFailed: "\u4efb\u52a1\u7ee7\u7eed\u5931\u8d25\uff1a",
  notReturned: "\u672a\u8fd4\u56de",
  configFailed: "\u8c03\u7528\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u672c\u5730\u914d\u7f6e\u3002",
  codexFailed:
    "Codex \u8c03\u7528\u5931\u8d25\uff0c\u8bf7\u786e\u8ba4 Codex CLI \u5df2\u5b89\u88c5\u3001\u5df2\u767b\u5f55\u4e14 mcp-server \u53ef\u542f\u52a8\u3002",
  executeFailed: "\u6267\u884c\u5931\u8d25\u3002"
};

main().catch((err) => {
  console.error(`[bridge] startup failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
