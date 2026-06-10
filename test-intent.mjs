/**
 * 三层意图识别测试脚本
 * 用于验证第一层、第二层、第三层的识别效果
 */

import firstLayerPkg from "./frontend/intent/firstLayer.js";
const { FIRST_LAYER, firstLayerStats, runFirstLayer } = firstLayerPkg;

import safetyPkg from "./frontend/intent/safetyRules.js";
const { SAFETY, runSafetyCheck } = safetyPkg;

import replyLogicPkg from "./frontend/intent/replyLogic.js";
const { generateReply, mapToSubIntent } = replyLogicPkg;

import fastRepliesPkg from "./frontend/intent/fastReplies.js";
const { runFastReply } = fastRepliesPkg;

const INTENTS = {
  MED_ADD: "INT_MED_ADD",
  MED_QUERY: "INT_MED_QUERY",
  MED_REMIND_SET: "INT_MED_REMIND_SET",
  MED_REMIND_CANCEL: "INT_MED_REMIND_CANCEL",
  BP_ADD: "INT_BP_ADD",
  BP_QUERY: "INT_BP_QUERY",
  QA: "INT_QA_HEALTH",
  EMERGENCY: "INT_EMERGENCY",
  SMALLTALK: "INT_SMALLTALK",
  OTHER: "INT_OTHER",
};

// 第二层 mock（与 app.js 中相同）
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
    } else if (/(吃了|服用|服了|吃药|用药|喝了(一)?(片|粒|包)?)/i.test(utterance)) {
      intent = INTENTS.MED_ADD;
    } else if (/(什么时候吃|几点吃|饭前|饭后|怎么吃)/.test(utterance) && /(药|降压药|降糖药|阿司匹林|布洛芬|二甲双胍)/.test(utterance)) {
      intent = INTENTS.QA;
    } else if (/(用药|吃药|药).*(记录|添加|新增)/i.test(utterance)) {
      intent = INTENTS.MED_ADD;
    } else if (/(用药|吃药|药).*(查看|查询|今天|最近)/i.test(utterance)) {
      intent = INTENTS.MED_QUERY;
    } else if (/(怎么(办)?|为什么|能不能|要不要|正常吗|吃什么|注意什么|怎么回事)/i.test(utterance)) {
      intent = INTENTS.QA;
    } else if (/^(你好|您好|嗨|hi|在吗|早上好|上午好|中午好|下午好|晚上好|晚安|谢谢|再见|拜拜)$/i.test(utterance.trim())) {
      intent = INTENTS.SMALLTALK;
    } else if (/(心情不好|难受|害怕|焦虑|孤单|想哭|没人陪|睡不着|很闷|闷得慌|无聊|一个人在家|一个人)/.test(utterance)) {
      intent = INTENTS.SMALLTALK;
    }
  }

  const clarify = [];
  if (intent === INTENTS.BP_ADD) {
    if (!Number.isFinite(slots.bp_systolic) && !Number.isFinite(slots.bp_diastolic)) {
      clarify.push("请问测到的血压是多少？例如 145/92。");
    }
  }
  if (intent === INTENTS.MED_ADD) {
    if (!/(阿司匹林|二甲双胍|硝苯地平|氨氯地平|缬沙坦|片|胶囊|中药|降压药|降糖药)/.test(utterance)) {
      clarify.push("你这次吃的是什么药？可以告诉我药名。");
    }
  }

  return {
    intent,
    slots,
    confidence: ruleResult.hit ? 0.88 : 0.72,
    need_clarify: clarify.length > 0,
    clarify_questions: clarify.slice(0, 2),
  };
}

// 完整的三层识别流程
function processUtterance(utterance) {
  console.log("\n" + "=".repeat(60));
  console.log(`用户输入：「${utterance}」`);
  console.log("=".repeat(60));

  // 第0层：快速回复
  const fast = runFastReply(utterance);
  if (fast.hit) {
    console.log("\n【第0层：快速回复】命中");
    console.log(`  类型: ${fast.type}`);
    console.log(`  回复: ${fast.reply}`);
    return { layer: 0, fast };
  }

  // 第一层：正则匹配
  console.log("\n【第一层：正则匹配】");
  const first = runFirstLayer(utterance);
  console.log(`  命中: ${first.hit}`);
  if (first.hit) {
    console.log(`  规则ID: ${first.ruleId}`);
    console.log(`  意图: ${first.intent}`);
    console.log(`  提取参数: ${JSON.stringify(first.slots)}`);
  }

  // 第二层：AI识别（mock）
  console.log("\n【第二层：AI识别】");
  const ai = secondLayerMock(utterance, first);
  console.log(`  意图: ${ai.intent}`);
  console.log(`  置信度: ${ai.confidence}`);
  console.log(`  参数: ${JSON.stringify(ai.slots)}`);
  console.log(`  需要澄清: ${ai.need_clarify}`);
  if (ai.need_clarify) {
    console.log(`  澄清问题: ${ai.clarify_questions.join("; ")}`);
  }

  const subIntent = mapToSubIntent({ aiIntent: ai.intent, utterance, slots: ai.slots });
  console.log(`  子意图: ${subIntent}`);

  // 第三层：安全检查
  console.log("\n【第三层：安全检查】");
  const safety = runSafetyCheck(utterance, ai);
  console.log(`  风险等级: ${safety.riskLevel}`);
  if (safety.reasons.length > 0) {
    console.log(`  原因: ${safety.reasons.join("; ")}`);
  }

  // 生成回复
  console.log("\n【生成回复】");
  let reply;
  if (safety.riskLevel === "BLOCK") {
    reply = "对不起，这个请求涉及安全/隐私/合规风险，我不能处理。";
  } else if (safety.riskLevel === "URGENT") {
    reply = "我看到你说的情况可能比较紧急。如果出现胸痛、呼吸困难、说话含糊、单侧无力等，请尽快拨打急救电话或就近就医。";
  } else if (ai.need_clarify) {
    reply = ai.clarify_questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  } else {
    reply = generateReply({ utterance, subIntent, slots: ai.slots, safety });
  }
  console.log(`  回复: ${reply.replace(/\n/g, "\\n")}`);

  return { layer: 3, first, ai, safety, subIntent, reply };
}

// 测试用例
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
console.log("*" + "    银发健康助手 - 三层意图识别测试".padEnd(59) + "*");
console.log("*" + " ".repeat(58) + "*");
console.log("*".repeat(60));

// 词库统计
console.log("\n【词库统计】");
const stats = firstLayerStats();
console.log(`  总关键词数: ${stats.totalKeywords}`);
console.log(`  分类数: ${stats.categories}`);
console.log(`  覆盖场景: ${stats.coveredScenes.join(", ")}`);

// 运行测试
for (const utterance of testCases) {
  processUtterance(utterance);
}

console.log("\n");
console.log("*".repeat(60));
console.log("测试完成！");
console.log("*".repeat(60));
