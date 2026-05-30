import type { ProjectConfig } from "../config.js";
import type { TaskRecord } from "./taskStore.js";

type KookTextElement = {
  type: "plain-text" | "kmarkdown";
  content: string;
};

type KookButtonElement = {
  type: "button";
  theme: "primary" | "success" | "warning" | "danger" | "info" | "secondary";
  value: string;
  click: "return-val";
  text: KookTextElement;
};

type KookCardModule =
  | { type: "header"; text: KookTextElement }
  | { type: "section"; text: KookTextElement }
  | { type: "context"; elements: KookTextElement[] }
  | { type: "divider" }
  | { type: "action-group"; elements: KookButtonElement[] };

type KookCard = {
  type: "card";
  theme: "primary" | "success" | "warning" | "danger" | "info" | "secondary";
  size: "lg";
  modules: KookCardModule[];
};

export type CardAction = {
  action: string;
  taskId?: string;
  projectKey?: string;
  templateKey?: string;
  token?: string;
};

export function buildTaskCard(task: TaskRecord, options: { queuePosition?: number; active?: number; limit?: number } = {}) {
  const summary = summarize(task.finalReply ?? task.error ?? task.prompt);
  const queueLine =
    task.status === "queued"
      ? `\n${ZH.queuePosition}${options.queuePosition ?? ZH.waiting}  ${ZH.running}${options.active ?? 0}/${options.limit ?? 1}`
      : "";

  return [
    card(themeForStatus(task.status), [
      header(`${ZH.codexTask} ${statusLabel(task.status)}`),
      section(
        [
          `${ZH.task}\`${escapeKmd(task.taskId)}\``,
          `${ZH.project}\`${escapeKmd(task.projectKey)}\``,
          `${ZH.status}${statusLabel(task.status)}${queueLine}`,
          `Thread: ${task.threadId ? `\`${escapeKmd(task.threadId)}\`` : ZH.none}`,
          `${ZH.cwd}\`${escapeKmd(shortPath(task.cwd))}\``
        ].join("\n")
      ),
      divider(),
      section(`${ZH.latestOutput}\n${escapeKmd(summary)}`),
      context(`${ZH.updated}${new Date(task.updatedAt).toLocaleString("zh-CN", { hour12: false })}`),
      actions([
        button(ZH.fullOutput, "primary", { action: "full_output", taskId: task.taskId }),
        button(ZH.statusButton, "info", { action: "status", taskId: task.taskId }),
        button(ZH.projectsButton, "secondary", { action: "projects" })
      ])
    ])
  ];
}

export function buildHomeCard(options: {
  gatewayOnline: boolean;
  codexAvailable: boolean;
  active: number;
  pending: number;
  limit: number;
  projectCount: number;
  latestTask?: TaskRecord;
}) {
  return [
    card("primary", [
      header(ZH.homeTitle),
      section(
        [
          `${ZH.gateway}${options.gatewayOnline ? ZH.online : ZH.unknown}`,
          `${ZH.codexMcp}${options.codexAvailable ? ZH.available : ZH.unknown}`,
          `${ZH.running}${options.active}/${options.limit}`,
          `${ZH.pending}${options.pending}`,
          `${ZH.projectsCount}${options.projectCount}`,
          `${ZH.latestTask}${options.latestTask ? `\`${escapeKmd(options.latestTask.taskId)}\`` : ZH.none}`
        ].join("\n")
      ),
      actions([
        button(ZH.projectsButton, "primary", { action: "projects" }),
        button(ZH.latestStatus, "info", { action: "status", taskId: options.latestTask?.taskId }),
        button(ZH.helpButton, "secondary", { action: "help" })
      ])
    ])
  ];
}

export function buildProjectCards(projects: Record<string, ProjectConfig>, latestByProject: Record<string, TaskRecord | undefined>) {
  const cards: KookCard[] = [];
  for (const [projectKey, project] of Object.entries(projects).slice(0, 5)) {
    const templateButtons = Object.keys(project.templates ?? {})
      .slice(0, 2)
      .map((templateKey) =>
        button(templateKey, "primary", { action: "run_template", projectKey, templateKey })
      );
    cards.push(
      card("info", [
        header(`${ZH.projectCard} ${projectKey}`),
        section(
          [
            `${ZH.cwd}\`${escapeKmd(shortPath(project.cwd))}\``,
            `${ZH.sandbox}\`${project.sandbox}\``,
            `${ZH.latestTask}${latestByProject[projectKey]?.taskId ? `\`${latestByProject[projectKey]?.taskId}\`` : ZH.none}`
          ].join("\n")
        ),
        actions([
          ...templateButtons,
          button(ZH.statusButton, "info", { action: "project_latest", projectKey }),
          button(ZH.homeButton, "secondary", { action: "home" })
        ])
      ])
    );
  }
  return cards;
}

export function buildRiskConfirmCard(input: { token: string; projectKey: string; prompt: string }) {
  return [
    card("warning", [
      header(ZH.riskTitle),
      section([`${ZH.project}\`${escapeKmd(input.projectKey)}\``, `${ZH.prompt}\n${escapeKmd(summarize(input.prompt, 500))}`].join("\n")),
      context(ZH.riskHint),
      actions([
        button(ZH.confirmRun, "danger", { action: "confirm_run", token: input.token }),
        button(ZH.cancel, "secondary", { action: "cancel_risk", token: input.token })
      ])
    ])
  ];
}

export function parseCardAction(value: unknown): CardAction | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (typeof parsed.action !== "string") return null;
    return {
      action: parsed.action,
      taskId: typeof parsed.taskId === "string" ? parsed.taskId : undefined,
      projectKey: typeof parsed.projectKey === "string" ? parsed.projectKey : undefined,
      templateKey: typeof parsed.templateKey === "string" ? parsed.templateKey : undefined,
      token: typeof parsed.token === "string" ? parsed.token : undefined
    };
  } catch {
    return null;
  }
}

function card(theme: KookCard["theme"], modules: KookCardModule[]): KookCard {
  return { type: "card", theme, size: "lg", modules };
}

function header(content: string): KookCardModule {
  return { type: "header", text: plain(content) };
}

function section(content: string): KookCardModule {
  return { type: "section", text: kmd(content) };
}

function context(content: string): KookCardModule {
  return { type: "context", elements: [plain(content)] };
}

function divider(): KookCardModule {
  return { type: "divider" };
}

function actions(elements: KookButtonElement[]): KookCardModule {
  return { type: "action-group", elements: elements.slice(0, 4) };
}

function button(label: string, theme: KookButtonElement["theme"], value: CardAction): KookButtonElement {
  return {
    type: "button",
    theme,
    click: "return-val",
    value: JSON.stringify(value),
    text: plain(label)
  };
}

function plain(content: string): KookTextElement {
  return { type: "plain-text", content };
}

function kmd(content: string): KookTextElement {
  return { type: "kmarkdown", content };
}

function themeForStatus(status: TaskRecord["status"]): KookCard["theme"] {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "running") return "warning";
  return "info";
}

function statusLabel(status: TaskRecord["status"]) {
  if (status === "queued") return ZH.queued;
  if (status === "running") return ZH.runningStatus;
  if (status === "completed") return ZH.completed;
  return ZH.failed;
}

function summarize(text: string, maxLength = 260) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return ZH.noOutput;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
}

function shortPath(value: string) {
  return value.length > 80 ? `...${value.slice(-77)}` : value;
}

function escapeKmd(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

const ZH = {
  codexTask: "\u0043\u006f\u0064\u0065\u0078 \u4efb\u52a1",
  homeTitle: "\u0043\u006f\u0064\u0065\u0078 \u6307\u6325\u8231",
  projectCard: "\u9879\u76ee",
  task: "\u4efb\u52a1\uff1a",
  project: "\u9879\u76ee\uff1a",
  status: "\u72b6\u6001\uff1a",
  cwd: "\u76ee\u5f55\uff1a",
  sandbox: "\u6c99\u7bb1\uff1a",
  latestOutput: "\u6700\u8fd1\u8f93\u51fa\uff1a",
  updated: "\u66f4\u65b0\uff1a",
  fullOutput: "\u67e5\u770b\u5b8c\u6574\u8f93\u51fa",
  statusButton: "\u67e5\u770b\u72b6\u6001",
  projectsButton: "\u9879\u76ee\u5217\u8868",
  homeButton: "\u56de\u5230\u4e3b\u9875",
  helpButton: "\u5e2e\u52a9",
  latestStatus: "\u6700\u8fd1\u4efb\u52a1",
  queuePosition: "\u961f\u5217\u4f4d\u7f6e\uff1a",
  waiting: "\u7b49\u5f85\u8c03\u5ea6",
  running: "\u8fd0\u884c\u4e2d\uff1a",
  pending: "\u6392\u961f\u4e2d\uff1a",
  projectsCount: "\u9879\u76ee\u6570\uff1a",
  latestTask: "\u6700\u8fd1\u4efb\u52a1\uff1a",
  gateway: "\u0047\u0061\u0074\u0065\u0077\u0061\u0079\uff1a",
  codexMcp: "\u0043\u006f\u0064\u0065\u0078 \u004d\u0043\u0050\uff1a",
  online: "\u5728\u7ebf",
  available: "\u53ef\u7528",
  unknown: "\u672a\u77e5",
  none: "\u6682\u65e0",
  queued: "\u6392\u961f\u4e2d",
  runningStatus: "\u8fd0\u884c\u4e2d",
  completed: "\u5df2\u5b8c\u6210",
  failed: "\u5931\u8d25",
  noOutput: "\u6682\u65e0\u8f93\u51fa",
  riskTitle: "\u9ad8\u98ce\u9669\u4efb\u52a1\u786e\u8ba4",
  prompt: "\u6307\u4ee4\uff1a",
  riskHint: "\u68c0\u6d4b\u5230\u5220\u9664\u3001\u8986\u76d6\u3001\u53d1\u5e03\u6216\u6279\u91cf\u7c7b\u64cd\u4f5c\uff0c\u786e\u8ba4\u524d\u4e0d\u4f1a\u6267\u884c\u3002",
  confirmRun: "\u786e\u8ba4\u6267\u884c",
  cancel: "\u53d6\u6d88"
};
