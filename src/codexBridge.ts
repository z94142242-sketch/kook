import fs from "node:fs";
import { codexClient } from "./codexClient.js";
import { helpText, parseCommand } from "./commands.js";
import { config } from "./config.js";
import { KookClient } from "./kook/client.js";
import type { KookButtonEvent, KookMessageEvent } from "./kook/types.js";
import { getProject, getProjects, loadProjects } from "./projects.js";
import { buildHomeCard, buildProjectCards, buildRiskConfirmCard, buildTaskCard, parseCardAction } from "./taskCard.js";
import { taskQueue } from "./taskQueue.js";
import { taskStore } from "./taskStore.js";
import { splitMessage } from "./messageSplit.js";

type PendingRiskRun = {
  projectKey: string;
  prompt: string;
  createdAt: number;
};

const pendingRiskRuns = new Map<string, PendingRiskRun>();
const RISK_TTL_MS = 5 * 60 * 1000;

/** 初始化 Codex bridge：加载任务存储、项目白名单、目录校验。 */
export async function initCodexBridge() {
  await taskStore.load();
  await loadProjects();
  validateProjectDirectories();
}

/** 判断消息事件是否归 Codex bridge 处理（只接收授权用户在授权频道发的命令）。 */
export function isCodexMessage(event: KookMessageEvent) {
  return event.channelId === config.allowedChannelId && event.authorId === config.allowedUserId;
}

/** 判断按钮事件是否归 Codex bridge 处理。 */
export function isCodexButton(event: KookButtonEvent) {
  return event.channelId === config.allowedChannelId && event.userId === config.allowedUserId;
}

export async function handleCodexMessage(kook: KookClient, event: KookMessageEvent) {
  const command = parseCommand(event.content, {
    prefixes: config.commandPrefixes,
    projectKeys: Object.keys(getProjects()),
    defaultProjectKey: config.defaultProjectKey
  });
  if (!command) return;

  if (command.kind === "help") {
    await sendText(kook, helpText);
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
      await sendText(kook, ZH.taskNotFound);
      return;
    }
    await sendText(
      kook,
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
      await sendText(kook, ZH.templateNotFound);
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
      await sendText(kook, ZH.taskNotFound);
      return;
    }
    if (!task.threadId) {
      await sendText(kook, ZH.noThread);
      return;
    }
    if (task.status === "running") {
      await sendText(kook, ZH.stillRunning);
      return;
    }
    if (task.status === "queued") {
      await sendText(kook, ZH.alreadyQueued);
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

export async function handleCodexButton(kook: KookClient, event: KookButtonEvent) {
  const action = parseCardAction(event.value);
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
    await sendText(kook, helpText);
    return;
  }

  if (action.action === "run_template") {
    if (!action.projectKey || !action.templateKey) {
      await sendText(kook, ZH.templateNotFound);
      return;
    }
    const prompt = resolvePrompt(action.projectKey, `template:${action.templateKey}`);
    if (!prompt) {
      await sendText(kook, ZH.templateNotFound);
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
      await sendText(kook, ZH.confirmExpired);
      return;
    }
    pendingRiskRuns.delete(action.token);
    await enqueueRun(kook, pending.projectKey, pending.prompt);
    return;
  }

  if (action.action === "cancel_risk") {
    if (action.token) pendingRiskRuns.delete(action.token);
    await sendText(kook, ZH.cancelled);
    return;
  }

  if (action.action === "project_latest") {
    if (!action.projectKey) return;
    const task = latestTaskForProject(action.projectKey);
    if (!task) {
      await sendText(kook, ZH.taskNotFound);
      return;
    }
    await kook.sendCard(config.allowedChannelId, buildTaskCard(task, taskQueue.stats()));
    return;
  }

  if (!action.taskId) {
    await sendText(kook, ZH.taskNotFound);
    return;
  }

  const task = taskStore.get(action.taskId);
  if (!task) {
    await sendText(kook, ZH.taskNotFound);
    return;
  }

  if (action.action === "status") {
    await kook.sendCard(config.allowedChannelId, buildTaskCard(task, taskQueue.stats()));
    return;
  }

  if (action.action === "full_output") {
    await sendText(kook, task.finalReply ?? task.error ?? ZH.noOutput);
  }
}

async function sendText(kook: KookClient, content: string) {
  for (const chunk of splitMessage(content)) {
    await kook.sendText(config.allowedChannelId, chunk);
  }
}

async function requestRun(kook: KookClient, projectKey: string, prompt: string) {
  const project = getProject(projectKey);
  if (!project) {
    await sendText(kook, ZH.projectNotFound);
    return;
  }

  if (isHighRiskPrompt(prompt)) {
    cleanupRiskRuns();
    const token = makeRiskToken();
    pendingRiskRuns.set(token, { projectKey, prompt, createdAt: Date.now() });
    await kook.sendCard(config.allowedChannelId, buildRiskConfirmCard({ token, projectKey, prompt }));
    return;
  }

  await enqueueRun(kook, projectKey, prompt);
}

async function enqueueRun(kook: KookClient, projectKey: string, prompt: string) {
  const project = getProject(projectKey);
  if (!project) {
    await sendText(kook, ZH.projectNotFound);
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
    return await kook.sendCard(config.allowedChannelId, buildTaskCard(task, { queuePosition, ...taskQueue.stats() }));
  } catch (err) {
    console.warn(`[kook] task card send failed taskId=${task.taskId} error=${toLogMessage(err)}`);
    await sendText(kook, `${ZH.taskQueued}${task.taskId}`);
    return undefined;
  }
}

async function sendHomeCard(kook: KookClient) {
  await kook.sendCard(
    config.allowedChannelId,
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
  await kook.sendCard(config.allowedChannelId, buildProjectCards(getProjects(), latestByProject));
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
    "删除",
    "清空",
    "覆盖",
    "发布",
    "重置",
    "批量",
    "迁移"
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
  availableProjects: "可用项目：",
  taskNotFound: "任务不存在。",
  taskLabel: "任务：",
  projectLabel: "项目：",
  statusLabel: "状态：",
  cwdLabel: "目录：",
  latestOutput: "最近输出：",
  none: "暂无",
  noOutput: "暂无输出",
  projectNotFound: "项目不存在，请使用 /codex projects 查看可用项目。",
  templateNotFound: "任务模板不存在。",
  confirmExpired: "确认已过期，请重新发起任务。",
  cancelled: "已取消。",
  taskStarted: "已启动任务：",
  noThread: "这个任务还没有可继续的 Codex threadId。",
  stillRunning: "任务仍在运行，请稍后再继续。",
  alreadyQueued: "这个任务已在队列中，请等待执行。",
  taskQueued: "已排队任务：",
  queuePosition: "队列位置：",
  queueStats: "当前运行：",
  taskContinued: "已继续任务：",
  taskCompleted: "任务完成：",
  taskFailed: "任务失败：",
  replyCompleted: "任务继续完成：",
  replyFailed: "任务继续失败：",
  notReturned: "未返回",
  configFailed: "调用失败，请检查本地配置。",
  codexFailed:
    "Codex 调用失败，请确认 Codex CLI 已安装、已登录且 mcp-server 可启动。",
  executeFailed: "执行失败。"
};
