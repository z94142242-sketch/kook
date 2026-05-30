// 卡片消息构造器。KOOK CardMessage 是 JSON 数组，每张卡是一个对象。
// 文档：https://developer.kookapp.cn/doc/cardmessage

type ButtonValue = string;

export function homeCard(input: {
  displayName: string;
  status: string;
  onlineMs: number;
  openOrders: number;
}) {
  return [
    {
      type: "card",
      theme: "primary",
      size: "lg",
      modules: [
        {
          type: "header",
          text: { type: "plain-text", content: `👋 ${input.displayName}，欢迎使用工作台` }
        },
        {
          type: "section",
          text: {
            type: "kmarkdown",
            content: [
              `**当前状态**：${input.status}`,
              `**本班语音时长**：${formatDuration(input.onlineMs)}`,
              `**待接订单**：${input.openOrders}`
            ].join("\n")
          }
        },
        {
          type: "action-group",
          elements: [
            primaryButton("上班打卡", "shift:clock-in"),
            warningButton("下班打卡", "shift:clock-out"),
            infoButton("查看订单", "order:list")
          ]
        }
      ]
    }
  ];
}

export function clockResultCard(input: {
  title: string;
  message: string;
  ok: boolean;
}) {
  return [
    {
      type: "card",
      theme: input.ok ? "success" : "warning",
      size: "sm",
      modules: [
        { type: "header", text: { type: "plain-text", content: input.title } },
        { type: "section", text: { type: "kmarkdown", content: input.message } }
      ]
    }
  ];
}

export function orderCard(input: {
  orderId: string;
  title: string;
  customerNote?: string | null;
  targetVoiceChannelId: string;
  price: number;
  status: string;
  claimedByName?: string | null;
}) {
  const claimable = input.status === "open";
  const buttons = claimable
    ? [primaryButton("接单并进入房间", `order:claim:${input.orderId}`)]
    : input.status === "claimed"
    ? [
        successButton("完成订单", `order:complete:${input.orderId}`),
        warningButton("放弃订单", `order:release:${input.orderId}`)
      ]
    : [];

  return [
    {
      type: "card",
      theme: claimable ? "info" : input.status === "claimed" ? "warning" : "secondary",
      size: "lg",
      modules: [
        {
          type: "header",
          text: { type: "plain-text", content: `📋 订单 #${input.orderId.slice(0, 8)} · ${input.title}` }
        },
        {
          type: "section",
          text: {
            type: "kmarkdown",
            content: [
              `**金额**：${input.price > 0 ? `¥${input.price.toFixed(2)}` : "未填"}`,
              `**目标语音频道**：(channel)${input.targetVoiceChannelId}(channel)`,
              `**状态**：${statusLabel(input.status)}`,
              input.claimedByName ? `**当前接单**：${input.claimedByName}` : null,
              input.customerNote ? `**备注**：${input.customerNote}` : null
            ]
              .filter(Boolean)
              .join("\n")
          }
        },
        buttons.length > 0 ? { type: "action-group", elements: buttons } : null
      ].filter(Boolean)
    }
  ];
}

export function incomeCard(input: {
  displayName: string;
  todayTotal: number;
  monthTotal: number;
  shiftTotal: number;
  recent: Array<{ amount: number; type: string; note: string | null; createdAt: number }>;
}) {
  const recentLines =
    input.recent.length === 0
      ? "_今日暂无入账_"
      : input.recent
          .map((r) => {
            const time = new Date(r.createdAt).toLocaleString("zh-CN", { hour12: false });
            const label = settlementTypeLabel(r.type);
            const note = r.note ? ` · ${r.note}` : "";
            return `- [${time}] ${label} ¥${r.amount.toFixed(2)}${note}`;
          })
          .join("\n");

  return [
    {
      type: "card",
      theme: "success",
      size: "lg",
      modules: [
        {
          type: "header",
          text: { type: "plain-text", content: `💰 ${input.displayName} 的收益` }
        },
        {
          type: "section",
          text: {
            type: "kmarkdown",
            content: [
              `**本班收益**：¥${input.shiftTotal.toFixed(2)}`,
              `**今日收益**：¥${input.todayTotal.toFixed(2)}`,
              `**本月收益**：¥${input.monthTotal.toFixed(2)}`
            ].join("\n")
          }
        },
        {
          type: "section",
          text: {
            type: "kmarkdown",
            content: `**最近入账（今日）**\n${recentLines}`
          }
        }
      ]
    }
  ];
}

export function notInVoiceCard() {
  return [
    {
      type: "card",
      theme: "warning",
      size: "sm",
      modules: [
        { type: "header", text: { type: "plain-text", content: "⚠️ 请先进入任意语音频道" } },
        {
          type: "section",
          text: {
            type: "kmarkdown",
            content: "KOOK 只允许把已经在语音里的用户搬运到目标频道。请先随便加入一个语音频道再点按钮。"
          }
        }
      ]
    }
  ];
}

// ---- 辅助 -------------------------------------------------------------

function primaryButton(text: string, value: ButtonValue) {
  return button(text, value, "primary");
}
function successButton(text: string, value: ButtonValue) {
  return button(text, value, "success");
}
function warningButton(text: string, value: ButtonValue) {
  return button(text, value, "warning");
}
function infoButton(text: string, value: ButtonValue) {
  return button(text, value, "info");
}

function button(text: string, value: ButtonValue, theme: string) {
  return {
    type: "button",
    theme,
    value,
    click: "return-val",
    text: { type: "plain-text", content: text }
  };
}

function statusLabel(status: string) {
  switch (status) {
    case "open":
      return "待接单";
    case "claimed":
      return "进行中";
    case "completed":
      return "已完成";
    case "cancelled":
      return "已取消";
    default:
      return status;
  }
}

function settlementTypeLabel(type: string) {
  switch (type) {
    case "order_commission":
      return "订单提成";
    case "hourly":
      return "时薪";
    case "bonus":
      return "奖励";
    case "adjustment":
      return "调整";
    default:
      return type;
  }
}

function formatDuration(ms: number) {
  if (ms <= 0) return "0 分钟";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours} 小时 ${minutes} 分钟`;
  return `${minutes} 分钟`;
}
