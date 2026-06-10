/**
 * 第一层：正则快速直出（不调用 AI / 不进业务流程）
 * 目标：处理“短、明确、低歧义”的消息，让体验更自然。
 */

export const fastPatterns = [
  // 问候
  {
    type: "greet",
    patterns: [
      /^(你好|您好|嗨|hi)$/i,
      /^(早上好|上午好|中午好|下午好|晚上好|晚安)$/i,
    ],
    response: (m) => {
      const t = String(m[0]);
      if (t.includes("晚安")) return "晚安！祝您休息好。";
      if (t.includes("晚上好")) return "晚上好！记得按时休息哦。";
      if (t.includes("早上") || t.includes("上午")) return "早上好！记得按时吃药、喝点温水哦。";
      return "您好！我是您的银发健康助手，有什么可以帮您？";
    },
  },

  // 在线确认
  {
    type: "online",
    patterns: [/^(在吗|有人吗|在不|在)$/i],
    response: "在的！请问有什么需要帮助？",
  },

  // 否定/拒绝/取消（含“不用了谢谢”）
  {
    type: "deny",
    patterns: [
      /^(不用了|不需要|不要了|先不了|算了|取消|没事了)$/i,
      /(不用了|不需要|不要了|先不了|算了).*(谢谢|感谢)?/i,
    ],
    response: "好的，有需要随时叫我。",
  },

  // 感谢确认
  {
    type: "thanks_confirm",
    patterns: [
      /^(谢谢|感谢|辛苦了)$/i,
      /^(好的|好|嗯|嗯嗯|收到|明白了)$/i,
      /^(我(现在)?(突然)?(好了|好些了|好多了|缓解了|没事了|不难受了)).*(谢谢|感谢)?$/i,
    ],
    response: "不客气！有需要随时叫我。",
  },

  // 告别
  {
    type: "goodbye",
    patterns: [/^(再见|拜拜|下次聊|我走了|退出)$/i],
    response: "好的，祝您平安健康。需要时随时找我。",
  },
];

export function runFastReply(text) {
  const u = (text ?? "").trim();
  for (const rule of fastPatterns) {
    for (const re of rule.patterns) {
      const m = u.match(re);
      if (!m) continue;
      const reply = typeof rule.response === "function" ? rule.response(m) : rule.response;
      return { hit: true, type: rule.type, reply };
    }
  }
  return { hit: false, type: null, reply: "" };
}

