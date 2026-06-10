/**
 * 三层意图识别测试脚本（纯 Node.js 版本）
 * 用于验证第一层、第二层、第三层的识别效果
 */

// ============== 第一层：正则匹配词库 ==============
const FIRST_LAYER = {
  lexiconTable: [
    { type: "寒暄问候", keywords: ["你好", "您好", "在吗", "早上好", "中午好", "下午好", "晚上好", "嗨"] },
    { type: "感谢确认", keywords: ["谢谢", "感谢", "好的", "可以", "行", "明白了", "收到", "嗯嗯"] },
    { type: "告别结束", keywords: ["再见", "拜拜", "晚安", "下次聊", "先这样", "我走了", "退出"] },
    { type: "使用帮助", keywords: ["怎么用", "不会用", "帮帮我", "使用说明", "功能有哪些", "你能做什么", "操作指南"] },
    { type: "用药提醒", keywords: ["设置提醒", "开启提醒", "关提醒", "取消提醒", "提醒我吃药", "闹钟", "定时", "每天提醒"] },
    { type: "健康数据", keywords: ["血压", "血糖", "体重", "空腹", "餐后", "mmHg", "mmol/L", "公斤", "kg"] },
    { type: "子女查看", keywords: ["我爸", "我妈", "父亲", "母亲", "老人", "给我看", "我想看", "家属", "替他", "替她"] },
    { type: "情绪关怀", keywords: ["心烦", "难受", "害怕", "睡不着", "焦虑", "孤单", "想哭", "没人陪"] },
  ],
  rules: [
    { id: "emergency_keywords", intent: "INT_EMERGENCY", pattern: "(呼吸困难|胸痛|意识模糊|昏迷|中风|口角歪斜|说不清|一侧无力|大出血|自杀|想死|救命|急救|120)" },
    { id: "bp_log_strong", intent: "INT_BP_ADD", pattern: "(血压).*(?:高压|收缩压)?\\s*(\\d{2,3})\\s*(?:\\/|\\\\|到|-|\\s)\\s*(?:低压|舒张压)?\\s*(\\d{2,3})" },
    { id: "bp_query", intent: "INT_BP_QUERY", pattern: "(查看|查询|最近|本周|趋势|变化|统计).*(血压)" },
    { id: "med_remind_set", intent: "INT_MED_REMIND_SET", pattern: "(设置|开启|打开|安排).*(用药|吃药|服药).*(提醒|闹钟|定时)" },
    { id: "med_remind_cancel", intent: "INT_MED_REMIND_CANCEL", pattern: "(取消|关闭|停用).*(用药|吃药|服药).*(提醒|闹钟|定时)" },
    { id: "med_log", intent: "INT_MED_ADD", pattern: "(添加|新增|记录|登记|写(一下)?|帮我(记|记录)).*(用药|吃药|药)" },
    { id: "med_query", intent: "INT_MED_QUERY", pattern: "(查看|查询|看(看)?|今天|本周|最近).*(用药|吃药|药)" },
    { id: "greet_polite", intent: "INT_SMALLTALK", pattern: "^(你好|您好|嗨|hi|在吗|早上好|上午好|中午好|下午好|晚上好|晚安)$" },
    { id: "smalltalk_short", intent: "INT_SMALLTALK", pattern: "^(谢谢|辛苦了|再见|拜拜)$" },
    { id: "med_log_by_action", intent: "INT_MED_ADD", pattern: "(吃了|吃过|吃完|服用|服了|吃药|用药|喝了(一)?(片|粒|包)?).*(降压药|布洛芬|阿司匹林|二甲双胍|降糖药|片|胶囊|药)" },
  ],
  matchPolicy: { matchMode: "包含匹配为主 + 少量精确匹配", lengthLimit: 18 }
};

function runFirstLayer(utterance) {
  for (const r of FIRST_LAYER.rules) {
    const re = new RegExp(r.pattern, "i");
    const m = utterance.match(re);
    if (!m) continue;
    const slots = {};
    if (r.intent === "INT_BP_ADD") {
      slots.bp_systolic = Number(m[2]);
      slots.bp_diastolic = Number(m[3]);
      slots.bp_unit = "mmHg";
    }
    return { hit: true, ruleId: r.id, intent: r.intent, slots, pattern: r.pattern };
  }
  return { hit: false, ruleId: null, intent: null, slots: {}, pattern: null };
}

function firstLayerStats() {
  const totalKeywords = FIRST_LAYER.lexiconTable.reduce((sum, row) => sum + row.keywords.length, 0);
  return { totalKeywords, categories: FIRST_LAYER.lexiconTable.length };
}

// ============== 快速回复 ==============
const fastPatterns = [
  { type: "greet", patterns: [/^(你好|您好|嗨|hi)$/i, /^(早上好|上午好|中午好|下午好|晚上好|晚安)$/i], response: "您好！我是您的银发健康助手，有什么可以帮您？" },
  { type: "online", patterns: [/^(在吗|有人吗|在不|在)$/i], response: "在的！请问有什么需要帮助？" },
  { type: "thanks_confirm", patterns: [/^(谢谢|感谢|辛苦了)$/i, /^(好的|好|嗯|嗯嗯|收到|明白了)$/i], response: "不客气！有需要随时叫我。" },
  { type: "goodbye", patterns: [/^(再见|拜拜|下次聊|我走了|退出)$/i], response: "好的，祝您平安健康。需要时随时找我。" },
];

function runFastReply(text) {
  const u = (text || "").trim();
  for (const rule of fastPatterns) {
    for (const re of rule.patterns) {
      if (u.match(re)) return { hit: true, type: rule.type, reply: rule.response };
    }
  }
  return { hit: false, type: null, reply: "" };
}

// ============== 第三层：安全检查 ==============
const SAFETY = {
  absoluteBlock: [
    { category: "自伤/自杀", keywords: ["自杀", "想死", "不想活了", "结束生命"], reason: "存在自伤风险" },
    { category: "违法/危险用药", keywords: ["代开药", "伪造处方", "买处方药", "开处方"], reason: "涉及违法与医疗合规风险" },
    { category: "诈骗/敏感信息", keywords: ["验证码", "银行卡号", "密码", "转账"], reason: "涉及财产与隐私安全" },
  ],
  conditionalWarn: [
    { category: "擅自调整用药", keywords: ["加量", "减量", "停药", "换药", "掰开吃"], handling: "提示遵医嘱" },
    { category: "高危症状", keywords: ["头晕", "胸闷", "心慌", "黑便", "呕血"], handling: "追问危险信号" },
  ],
  urgentMedicalKeywords: ["胸痛", "呼吸困难", "口齿不清", "说不清话", "一侧无力", "昏迷", "大量出血", "呕血", "黑便"],
};

function runSafetyCheck(utterance, aiResult) {
  const text = utterance || "";
  function includesAny(t, words) { return words.some(w => t.includes(w)); }
  
  for (const row of SAFETY.absoluteBlock) {
    if (includesAny(text, row.keywords)) {
      return { riskLevel: "BLOCK", reasons: [`命中绝对禁止：${row.category}`] };
    }
  }
  
  if (includesAny(text, ["胸痛", "呼吸困难", "昏迷", "意识模糊", "口角歪斜", "说不清", "一侧无力", "120"])) {
    return { riskLevel: "URGENT", reasons: ["检测到疑似紧急风险信号"] };
  }
  
  if (aiResult && aiResult.intent === "INT_BP_ADD") {
    const s = aiResult.slots && aiResult.slots.bp_systolic;
    const d = aiResult.slots && aiResult.slots.bp_diastolic;
    if (Number.isFinite(s) && Number.isFinite(d) && (s >= 180 || d >= 120)) {
      return { riskLevel: "URGENT", reasons: ["血压数值偏高，建议尽快就医评估"] };
    }
    if (Number.isFinite(s) && Number.isFinite(d) && (s >= 140 || d >= 90)) {
      return { riskLevel: "WARN", reasons: ["血压偏高，建议持续监测"] };
    }
  }
  
  for (const row of SAFETY.conditionalWarn) {
    if (includesAny(text, row.keywords)) {
      return { riskLevel: "WARN", reasons: [`命中条件警告：${row.category}`] };
    }
  }
  
  return { riskLevel: "PASS", reasons: [] };
}

// ============== 第二层：AI识别（mock） ==============
const INTENTS = {
  MED_ADD: "INT_MED_ADD", MED_QUERY: "INT_MED_QUERY", MED_REMIND_SET: "INT_MED_REMIND_SET",
  MED_REMIND_CANCEL: "INT_MED_REMIND_CANCEL", BP_ADD: "INT_BP_ADD", BP_QUERY: "INT_BP_QUERY",
  QA: "INT_QA_HEALTH", EMERGENCY: "INT_EMERGENCY", SMALLTALK: "INT_SMALLTALK", OTHER: "INT_OTHER"
};

function secondLayerMock(utterance, ruleResult) {
  let intent = ruleResult.hit ? ruleResult.intent : INTENTS.OTHER;
  const slots = { ...ruleResult.slots };

  if (!ruleResult.hit) {
    if (/(血压).*(\d{2,3})\s*\/\s*(\d{2,3})/i.test(utterance)) {
      const m = utterance.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
      intent = INTENTS.BP_ADD;
      slots.bp_systolic = Number(m[1]);
      slots.bp_diastolic = Number(m[2]);
      slots.bp_unit = "mmHg";
    } else if (/(血压).*(\d{2,3})/i.test(utterance)) {
      const m = utterance.match(/血压[^0-9]*?(\d{2,3})/i) || utterance.match(/(\d{2,3})/);
      intent = INTENTS.BP_ADD;
      slots.bp_systolic = m ? Number(m[1]) : null;
      slots.bp_unit = "mmHg";
    } else if (/(吃了|服用|服了|吃药|用药)/i.test(utterance)) {
      intent = INTENTS.MED_ADD;
    } else if (/(什么时候吃|几点吃|饭前|饭后|怎么吃)/.test(utterance) && /(药|降压药|降糖药)/.test(utterance)) {
      intent = INTENTS.QA;
    } else if (/(用药|吃药|药).*(记录|添加|新增)/i.test(utterance)) {
      intent = INTENTS.MED_ADD;
    } else if (/(用药|吃药|药).*(查看|查询|今天|最近)/i.test(utterance)) {
      intent = INTENTS.MED_QUERY;
    } else if (/(怎么(办)?|为什么|能不能|要不要|正常吗|吃什么|注意什么|怎么回事)/i.test(utterance)) {
      intent = INTENTS.QA;
    } else if (/^(你好|您好|嗨|hi|在吗|早上好|晚上好|晚安|谢谢|再见|拜拜)$/i.test(utterance.trim())) {
      intent = INTENTS.SMALLTALK;
    } else if (/(心情不好|难受|害怕|焦虑|孤单|想哭|没人陪|睡不着|很闷|一个人在家|一个人)/.test(utterance)) {
      intent = INTENTS.SMALLTALK;
    }
  }

  return { intent, slots, confidence: ruleResult.hit ? 0.88 : 0.72 };
}

// ============== 回复生成 ==============
function mapToSubIntent(aiIntent, utterance) {
  const u = (utterance || "").trim();
  if (/(什么时候吃|几点吃|饭前|饭后|怎么吃)/.test(u) && /(药|降压药|降糖药)/.test(u)) return "medication.med_consult";
  if (aiIntent === "INT_QA_HEALTH") return "health_qa.general";
  if (aiIntent === "INT_MED_QUERY") return "medication.med_query";
  if (aiIntent === "INT_BP_QUERY") return "health_data.bp_query";
  if (aiIntent === "INT_MED_ADD") return "medication.med_log";
  if (aiIntent === "INT_BP_ADD") return "health_data.bp_log";
  if (aiIntent === "INT_MED_REMIND_SET") return "remind.med_set";
  if (aiIntent === "INT_MED_REMIND_CANCEL") return "remind.med_cancel";
  if (aiIntent === "INT_SMALLTALK") {
    if (/^(谢谢|好的|收到|嗯|嗯嗯)$/.test(u)) return "chat.confirm";
    if (/^(再见|拜拜)$/.test(u)) return "chat.goodbye";
    if (/(心情不好|难受|害怕|焦虑|孤单|一个人)/.test(u)) return "chat.care";
    if (/(怎么用|不会用|你能做什么)/.test(u)) return "chat.help";
    return "chat.greet";
  }
  return "other.unknown";
}

function generateReply(utterance, subIntent, slots, safety) {
  const warnTail = safety && safety.riskLevel === "WARN" ? "\n提示：如果你感觉不舒服加重，请及时就医。" : "";
  
  switch (subIntent) {
    case "medication.med_log":
      {
        const u = utterance ?? "";
        const digitMatch = u.match(/(\d+(?:\.\d+)?)\s*(片|粒|包|颗)/);
        const chineseMatch = u.match(/(半)?\s*(一|二|两|三|四|五|六|七|八|九|十)\s*(片|粒|包|颗)/);

        let amount = null;
        let unit = "";
        if (digitMatch) {
          amount = Number(digitMatch[1]);
          unit = digitMatch[2];
        } else if (chineseMatch) {
          const isHalf = Boolean(chineseMatch[1]);
          const map = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
          amount = isHalf ? 0.5 : map[chineseMatch[2]];
          unit = chineseMatch[3];
        }

        if (Number.isFinite(amount) && unit) {
          return `好的，已帮您记录用药：${amount}${unit}。` + warnTail;
        }

        return "好的，已帮您记录用药。请再告诉我：吃了多少（例如 1片/1粒）？" + warnTail;
      }
    case "medication.med_query":
      return "好的。我可以帮您查用药记录。\n你想查\"今天\"、还是\"最近一周/一个月\"的用药？";
    case "medication.med_consult":
      return "好的，我可以做用药相关科普与注意事项提醒（不替代医生）。";
    case "health_data.bp_log": {
      const s = slots && slots.bp_systolic;
      const d = slots && slots.bp_diastolic;
      let status = "暂时无法判断";
      if (Number.isFinite(s) && Number.isFinite(d)) {
        if (s >= 180 || d >= 120) status = "很高";
        else if (s >= 140 || d >= 90) status = "偏高";
        else if (s < 90 || d < 60) status = "偏低";
        else status = "正常范围";
      }
      if (Number.isFinite(s) && !Number.isFinite(d)) {
        return `好的，已记录您的血压（收缩压/高压）${s} mmHg。如果你方便，之后也可以补充低压。` + warnTail;
      }
      return `好的，已记录您的血压${Number.isFinite(s) && Number.isFinite(d) ? `${s}/${d}` : ""}。\n血压状态：${status}。` + warnTail;
    }
    case "health_data.bp_query":
      return "好的，我可以帮您查询血压。\n你想看\"今天\"、还是\"最近一周\"的血压趋势？";
    case "health_qa.general":
    case "health_qa.symptom":
      return "我明白了，我先关心一下安全。\n请问：症状持续多久？有没有胸痛、呼吸困难？";
    case "remind.med_set":
      return "好的，我可以帮您设置吃药提醒。\n请告诉我：每天几点提醒？（例如 早上8点）";
    case "remind.med_cancel":
      return "好的，我可以帮您关闭吃药提醒。\n请告诉我：要关闭哪一个时间的提醒？";
    case "chat.greet":
      return "您好！我是您的银发健康助手，有什么可以帮您？";
    case "chat.confirm":
      return "不客气！有需要随时叫我。";
    case "chat.goodbye":
      return "好的，祝您平安健康。需要时随时找我。";
    case "chat.help":
      return "我可以帮您：记录用药、记录血压/血糖/体重、查询记录、做健康咨询。";
    case "chat.care":
      return "听到您这么说，我很关心您。要不要和我聊聊发生了什么？我一直在这里陪您。";
    default:
      return "我明白了。你是想记录用药、记录血压/血糖/体重，还是查询/咨询健康问题？";
  }
}

// ============== 完整的三层识别流程 ==============
function processUtterance(utterance) {
  console.log("\n" + "=".repeat(60));
  console.log("用户输入：「" + utterance + "」");
  console.log("=".repeat(60));

  // 第0层：快速回复
  const fast = runFastReply(utterance);
  if (fast.hit) {
    console.log("\n【第0层：快速回复】命中");
    console.log("  类型: " + fast.type);
    console.log("  回复: " + fast.reply);
    return { layer: 0, fast };
  }

  // 第一层：正则匹配
  console.log("\n【第一层：正则匹配】");
  const first = runFirstLayer(utterance);
  console.log("  命中: " + first.hit);
  if (first.hit) {
    console.log("  规则ID: " + first.ruleId);
    console.log("  意图: " + first.intent);
    console.log("  提取参数: " + JSON.stringify(first.slots));
  }

  // 第二层：AI识别（mock）
  console.log("\n【第二层：AI识别】");
  const ai = secondLayerMock(utterance, first);
  console.log("  意图: " + ai.intent);
  console.log("  置信度: " + ai.confidence);
  console.log("  参数: " + JSON.stringify(ai.slots));

  const subIntent = mapToSubIntent(ai.intent, utterance);
  console.log("  子意图: " + subIntent);

  // 第三层：安全检查
  console.log("\n【第三层：安全检查】");
  const safety = runSafetyCheck(utterance, ai);
  console.log("  风险等级: " + safety.riskLevel);
  if (safety.reasons.length > 0) {
    console.log("  原因: " + safety.reasons.join("; "));
  }

  // 生成回复
  console.log("\n【生成回复】");
  let reply;
  if (safety.riskLevel === "BLOCK") {
    reply = "对不起，这个请求涉及安全/隐私/合规风险，我不能处理。";
  } else if (safety.riskLevel === "URGENT") {
    reply = "我看到你说的情况可能比较紧急。如果出现胸痛、呼吸困难、说话含糊、单侧无力等，请尽快拨打急救电话或就近就医。";
  } else {
    reply = generateReply(utterance, subIntent, ai.slots, safety);
  }
  console.log("  回复: " + reply.replace(/\n/g, "\\n"));

  return { layer: 3, first, ai, safety, subIntent, reply };
}

// ============== 测试用例 ==============
const testCases = [
  // 第一层测试
  "你好",
  "谢谢",
  "你能做什么",
  "我刚测了血压145/92",
  "今天吃药了吗",
  "开启吃药提醒",
  
  // 第二层测试
  "血压150",
  "我晚上吃了布洛芬",
  "我今天晚上吃了布洛芬一片",
  "降压药什么时候吃",
  "我最近头晕正常吗",
  "一个人在家很闷",
  
  // 第三层测试
  "胸痛喘不过气",
  "我想自杀",
  "验证码是多少",
  "我要停药",
  
  // 边界测试
  "血压180/120",
  "血压90/60",
];

console.log("\n");
console.log("*".repeat(60));
console.log("*" + " ".repeat(58) + "*");
console.log("*    银发健康助手 - 三层意图识别测试" + " ".repeat(22) + "*");
console.log("*" + " ".repeat(58) + "*");
console.log("*".repeat(60));

// 词库统计
console.log("\n【词库统计】");
const stats = firstLayerStats();
console.log("  总关键词数: " + stats.totalKeywords);
console.log("  分类数: " + stats.categories);

// 运行测试
for (const utterance of testCases) {
  processUtterance(utterance);
}

console.log("\n");
console.log("*".repeat(60));
console.log("测试完成！");
console.log("*".repeat(60));
