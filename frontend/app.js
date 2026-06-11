/**
 * 银发健康助手 - 主应用逻辑
 * 
 * 功能：
 * - 银发友好对话 UI
 * - 三级意图识别：第一层正则 → 第二层大模型 → 第三层安全检查
 * - 长期记忆系统：用户画像、数据记录、里程碑检测
 * - 页面下方支持展示"三级识别结果 JSON"
 */

import { FIRST_LAYER, firstLayerStats, runFirstLayer } from "./intent/firstLayer.js";
import { SAFETY, runSafetyCheck } from "./intent/safetyRules.js";
import { generateReply, mapToSubIntent } from "./intent/replyLogic.js";
import { runFastReply } from "./intent/fastReplies.js";
import { MemoryService } from "./intent/memoryService.js";
import { generateFoodAdvice, extractFoodsFromText, getExerciseAdviceFromRecords, getDietAdviceFromRecords } from "./intent/healthAdvisor.js";
import {
  extractMedicationData,
  extractBloodPressureData,
  extractBloodSugarData,
  extractWeightData,
  extractExerciseData,
  extractDietData,
  mergeDietSupplement,
  extractEmotionData,
  extractReminderData,
} from "./intent/dataExtractor.js";
import { extractProfileData, shouldUpdateProfile, mergeProfileData, isGenderLabel } from "./intent/profileExtractor.js";
import { alertService } from "./intent/alertService.js";
import { ReminderService } from "./intent/reminderService.js";
import { voiceService } from "./intent/voiceService.js";
import { ttsService } from "./intent/ttsService.js";
import { applyFontSize } from "./utils.js";
import { API_BASE } from "./config.js";

// ==================== 会话记忆（短期） ====================
const MEMORY = {
  history: [], // { role: "user"|"assistant", text: string, at: number }
  pending: {
    bp: null, // { systolic: number }
    diet: null, // { data: object, at: number } - 饮食记录待补充餐次/饱感
    query: null, // { metric: "bp"|"medication"|"exercise"|"diet"|"stats", subIntent: string, at: number }
    qa: null, // { originalQuestion, subIntent, clarifyQuestions?, at } - 健康咨询追问上下文
    reminder: null, // { type: string, at: number } - 用于继承提醒意图
    waitingForConfirm: null, // 当前待确认的提醒 { reminderId, drugName, type, triggeredAt }
  },
};

// ==================== 对话历史持久化 ====================
let _saveHistoryTimer = null;
function persistChatHistory() {
  if (_saveHistoryTimer) clearTimeout(_saveHistoryTimer);
  _saveHistoryTimer = setTimeout(() => {
    if (memoryService && MEMORY.history.length > 0) {
      memoryService.saveChatHistory(MEMORY.history.slice(-100));
    }
  }, 2000);
}

// ==================== 长期记忆服务 ====================
let memoryService = null;
let reminderService = null;
const CURRENT_USER_ID = "default";

// 大模型通过后端代理，API Key 仅存服务端环境变量
const LLM_ENDPOINT = `${API_BASE}/llm/chat`;

const INTENTS = {
  MED_ADD: "INT_MED_ADD",
  MED_QUERY: "INT_MED_QUERY",
  MED_MISSED: "INT_MED_MISSED",
  MED_REMIND_SET: "INT_MED_REMIND_SET",
  MED_REMIND_CANCEL: "INT_MED_REMIND_CANCEL",
  REMIND_QUERY: "INT_REMIND_QUERY",
  BP_ADD: "INT_BP_ADD",
  BP_QUERY: "INT_BP_QUERY",
  BS_ADD: "INT_BS_ADD",
  BS_QUERY: "INT_BS_QUERY",
  WEIGHT_ADD: "INT_WEIGHT_ADD",
  EXERCISE_LOG: "INT_EXERCISE_LOG",
  EXERCISE_QUERY: "INT_EXERCISE_QUERY",
  EXERCISE_RECOMMEND: "INT_EXERCISE_RECOMMEND",
  DIET_LOG: "INT_DIET_LOG",
  DIET_QUERY: "INT_DIET_QUERY",
  DIET_NUTRITION: "INT_DIET_NUTRITION",
  DIET_SUGGEST: "INT_DIET_SUGGEST",
  TEMP_REMIND_SET: "INT_TEMP_REMIND_SET",
  STATS_QUERY: "INT_STATS_QUERY",
  QA: "INT_QA_HEALTH",
  EMERGENCY: "INT_EMERGENCY",
  SMALLTALK: "INT_SMALLTALK",
  OTHER: "INT_OTHER",
};

/**
 * 将子意图映射到AI意图常量
 */
function mapIntentToAiIntent(subIntent) {
  const intentMap = {
    "remind.med_set": INTENTS.MED_REMIND_SET,
    "remind.med_cancel": INTENTS.MED_REMIND_CANCEL,
    "remind.temp_set": INTENTS.TEMP_REMIND_SET,
    "remind.bp_set": INTENTS.BP_QUERY,
    "remind.bs_set": INTENTS.BS_QUERY,
    "remind.checkup_set": INTENTS.STATS_QUERY,
  };
  return intentMap[subIntent] || INTENTS.OTHER;
}

// ==================== 工具函数 ====================

function nowTime() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ==================== 语音播报控制 ====================

/**
 * 切换语音播报开关
 */
function toggleTTS() {
  const enabled = ttsService.toggleAutoplay();
  const toggle = document.getElementById('ttsToggle');
  
  if (toggle) {
    if (enabled) {
      toggle.classList.add('tts-toggle--active');
      toggle.querySelector('.tts-toggle__icon').textContent = '🔊';
    } else {
      toggle.classList.remove('tts-toggle--active');
      toggle.querySelector('.tts-toggle__icon').textContent = '🔇';
    }
  }
  
  // 如果关闭播报，立即停止当前播报
  if (!enabled) {
    ttsService.stop();
  }
}

// 暴露到全局作用域，供 HTML onclick 使用
window.toggleTTS = toggleTTS;

/**
 * 初始化语音播报开关状态
 */
function initTTSToggle() {
  const toggle = document.getElementById('ttsToggle');
  if (toggle) {
    const enabled = ttsService.isAutoplayEnabled();
    if (enabled) {
      toggle.classList.add('tts-toggle--active');
      toggle.querySelector('.tts-toggle__icon').textContent = '🔊';
    } else {
      toggle.classList.remove('tts-toggle--active');
      toggle.querySelector('.tts-toggle__icon').textContent = '🔇';
    }
  }
}

function detectRangeDays(text, fallback = 7) {
  const u = (text ?? "").trim();
  if (/今天|今日/.test(u)) return 1;
  if (/昨天/.test(u)) return 2;
  if (/最近一周|近一周|这周|本周|一周|7天|七天/.test(u)) return 7;
  if (/最近一个月|近一个月|本月|这个月|一个月|30天|三十天/.test(u)) return 30;
  return fallback;
}

function detectPendingQueryReply(text) {
  const u = (text ?? "").trim();
  if (!MEMORY.pending.query) return null;
  const expired = Date.now() - MEMORY.pending.query.at > 5 * 60 * 1000;
  if (expired) {
    MEMORY.pending.query = null;
    return null;
  }
  if (!/^(今天|今日|最近一周|近一周|这周|本周|一周|7天|七天|最近一个月|近一个月|本月|这个月|一个月|30天|三十天|最近一周的|今天的|本周的|这个月的|最近一个月的)$/.test(u)) {
    return null;
  }
  return {
    ...MEMORY.pending.query,
    days: detectRangeDays(u),
  };
}

function rememberPendingQuery(subIntent) {
  const queryMap = {
    "health_data.bp_query": "bp",
    "health_data.bs_query": "bs",
    "medication.med_query": "medication",
    "exercise.query": "exercise",
    "diet.query": "diet",
    "stats.query": "stats",
  };
  const metric = queryMap[subIntent];
  if (!metric) return;
  MEMORY.pending.query = { metric, subIntent, at: Date.now() };
}

function clearPendingQueryIfResolved(subIntent, utterance) {
  if (!MEMORY.pending.query) return;
  const hasRange = /今天|今日|最近一周|近一周|这周|本周|一周|7天|七天|最近一个月|近一个月|本月|这个月|一个月|30天|三十天/.test(utterance ?? "");
  if (MEMORY.pending.query.subIntent === subIntent && hasRange) {
    MEMORY.pending.query = null;
  }
}

function detectPendingDietReply(utterance) {
  if (!MEMORY.pending.diet) return null;
  const expired = Date.now() - MEMORY.pending.diet.at > 5 * 60 * 1000;
  if (expired) {
    MEMORY.pending.diet = null;
    return null;
  }
  const u = (utterance ?? "").trim();
  if (
    /^(早餐|午餐|晚餐|早饭|中饭|晚饭)/.test(u) ||
    /分饱|七分饱|八分饱|全饱|吃饱了/.test(u) ||
    /^(早上|中午|晚上)\s/.test(u)
  ) {
    return MEMORY.pending.diet;
  }
  return null;
}

function rememberPendingQa(originalQuestion, subIntent, clarifyQuestions = []) {
  MEMORY.pending.qa = {
    originalQuestion,
    subIntent,
    clarifyQuestions,
    at: Date.now(),
  };
}

function detectPendingQaReply(utterance) {
  if (!MEMORY.pending.qa) return null;
  const expired = Date.now() - MEMORY.pending.qa.at > 5 * 60 * 1000;
  if (expired) {
    MEMORY.pending.qa = null;
    return null;
  }
  return { ...MEMORY.pending.qa, supplement: utterance };
}

function extractQaSupplement(utterance) {
  const info = { raw: utterance };
  const bpMatch = (utterance ?? "").match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (bpMatch) {
    info.bpSystolic = Number(bpMatch[1]);
    info.bpDiastolic = Number(bpMatch[2]);
  }
  if (/^(没有|无|不会|不疼|不晕|不涨|还好|正常|没事)$/.test((utterance ?? "").trim()) || /没有|不会|无.*(头晕|胸闷|气喘|不舒服)/.test(utterance ?? "")) {
    info.hasSymptoms = false;
  } else if (/(头晕|胸闷|气喘|心慌|不舒服|有点|偶尔有)/.test(utterance ?? "") && !/没有|不会|无/.test(utterance ?? "")) {
    info.hasSymptoms = true;
  }
  return info;
}

function shouldRememberPendingQa(text) {
  if (!text) return false;
  return /(\d+\.\s*.+[？?])|((请问|想了解|告诉我|方便说|先了解|补充).+[？?])/.test(text);
}

function shouldUseHealthQaForExercise(subIntent, utterance) {
  return subIntent === "exercise.recommend" && /(吗|么|能不能|可以吗|行不行|好不好)/.test(utterance ?? "");
}

function isSimpleGreeting(utterance) {
  return /^(你好|您好|嗨|hi|在吗|早上好|上午好|中午好|下午好|晚上好|晚安|谢谢|感谢|再见|拜拜|好的|好|嗯|嗯嗯|收到|明白了)$/i.test((utterance ?? "").trim());
}

function isProfileViewRequest(utterance) {
  return /(查看个人画像|我的画像|个人画像|查看画像|我要看我的个人画像|我就要看我的个人画像|给我看个人画像|显示个人画像)/.test(utterance ?? "");
}

function isProfileUpdateRequest(utterance) {
  const u = (utterance ?? "").trim();
  if (!u || isProfileViewRequest(u)) return false;
  return /^(我是男的|我是女的|我是男|我是女|我的性别是|性别是)|^(我叫|我的身高是|我的体重是|我今年\d{1,3}岁)/.test(u);
}

function shouldForceLLM(utterance) {
  const u = (utterance ?? "").trim();
  if (!u || isSimpleGreeting(u)) return false;
  if (/(忘记|漏服|忘吃|没吃药|没服药|未服药).*(药|服药|用药)/.test(u)) return false;
  if (/(血压|血糖|体重).*\d|^\d{2,3}\s*\/\s*\d{2,3}/.test(u)) return false;
  if (/(记录|添加|登记|查询|查看).*(血压|血糖|用药|提醒|运动|饮食)/.test(u)) return false;
  if (/(设置|取消|关闭|开启).*(提醒|闹钟)/.test(u)) return false;

  if (/(怎么办|能不能|可以吗|为什么|怎么样|如何|该怎么|是否正常|有没有问题|有什么建议|该怎么做)/.test(u)) return true;
  if (/(老了|不中用|没用|年纪大|走不动|不被需要|没价值|拖累)/.test(u)) return true;
  if (/(你能帮|你会什么|能做什么|有什么功能|帮我做什么|可以帮我)/.test(u)) return true;
  if (/(孤独|孤单|难受|害怕|焦虑|伤心|难过|郁闷|心烦|低落).*[吗么？?]/.test(u)) return true;
  if (/[吗么？?]$/.test(u) && u.length > 4) return true;
  return false;
}

function shouldUseLLMReply(subIntent, utterance) {
  if (subIntent === "medication.med_log" || subIntent === "medication.missed_dose") return false;
  if (subIntent === "health_data.weight_log" || subIntent === "health_data.bp_log" || subIntent === "health_data.bs_log") return false;
  if (subIntent === "chat.profile_view" || isProfileViewRequest(utterance)) return false;
  if (subIntent === "chat.profile" || isProfileUpdateRequest(utterance)) return false;
  if (subIntent === "emergency.sos") return false;
  return (
    isHealthQaSubIntent(subIntent) ||
    shouldUseHealthQaForExercise(subIntent, utterance) ||
    shouldForceLLM(utterance)
  );
}

function detectImplicitQaFollowUp(utterance) {
  let lastAssistant = null;
  let originalQuestion = "";

  for (let i = MEMORY.history.length - 1; i >= 0; i--) {
    if (MEMORY.history[i].role !== "assistant") continue;
    lastAssistant = MEMORY.history[i];
    for (let j = i - 1; j >= 0; j--) {
      if (MEMORY.history[j].role === "user") {
        originalQuestion = MEMORY.history[j].text;
        break;
      }
    }
    break;
  }

  if (!lastAssistant) return null;

  const askedFollowUp = /血压控制|高压\/低压|头晕|胸闷|走路气喘|想了解|请问|先了解|补充/.test(lastAssistant.text);
  const looksLikeAnswer =
    /(\d{2,3}\s*\/\s*\d{2,3})/.test(utterance ?? "") ||
    /^(没有|无|不会|还好|正常|没事)([\s，,。.!！?？]*)?$/.test((utterance ?? "").trim());

  if (!askedFollowUp || !looksLikeAnswer) return null;

  return {
    originalQuestion,
    subIntent: "health_qa.general",
    clarifyQuestions: [],
    at: Date.now(),
    supplement: utterance,
  };
}

// ==================== UI 渲染 ====================

// 消息ID计数器
let messageIdCounter = 0;

function appendMessage({ role, text, meta, tags }) {
  const chat = document.getElementById("chat");
  
  // 生成唯一消息ID
  const messageId = `msg_${++messageIdCounter}`;

  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "user" ? "msg--user" : "msg--assistant"}`;
  wrap.dataset.messageId = messageId;

  const avatar = document.createElement("div");
  avatar.className = "msg__avatar";
  avatar.textContent = role === "user" ? "👤" : "🤖";

  const bubble = document.createElement("div");
  bubble.className = "msg__bubble";
  bubble.innerHTML = escapeHtml(text);

  if (role === "user") {
    // 用户消息：不显示喇叭图标
    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
  } else {
    // 助手消息：显示喇叭图标
    
    // 气泡容器
    const bubbleWrapper = document.createElement("div");
    bubbleWrapper.className = "msg__bubble-wrapper";
    bubbleWrapper.appendChild(bubble);
    
    // 喇叭播放按钮
    const speaker = document.createElement("button");
    speaker.className = "tts-speaker";
    speaker.textContent = "🔈";
    speaker.title = "点击播放";
    speaker.onclick = () => {
      ttsService.speak(text, messageId);
    };
    
    wrap.appendChild(avatar);
    wrap.appendChild(bubbleWrapper);
    wrap.appendChild(speaker);
    
    // 智能自动播报判断
    if (ttsService.isAutoplayEnabled()) {
      const shouldAutoPlay = ttsService.shouldAutoPlay(text);
      if (shouldAutoPlay.shouldPlay) {
        // 延迟一小段时间后再播报，让消息先显示出来
        setTimeout(() => {
          ttsService.speak(text, messageId);
        }, 500);
      }
    }
  }
  
  chat.appendChild(wrap);

  // 自动滚动到底部
  const scrollToBottom = () => {
    chat.offsetHeight;
    chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  };
  chat.scrollTop = chat.scrollHeight;
  requestAnimationFrame(scrollToBottom);
  setTimeout(scrollToBottom, 150);
}

function renderDebugJson(obj) {
  const pre = document.getElementById("debugPre");
  if (!pre) return;
  pre.textContent = JSON.stringify(obj, null, 2);
}

function isHealthQaSubIntent(subIntent) {
  return ["health_qa.diet", "health_qa.med", "health_qa.symptom", "health_qa.general", "diet.suggest"].includes(subIntent);
}

// ==================== 大模型健康咨询回复 ====================

async function callHealthQaContinuation(pendingQa, supplement, { profile, memory } = {}) {
  try {
    let profileContext = "";
    if (profile) {
      profileContext = `
用户画像：
- 姓名：${profile.name || "未知"}
- 年龄：${profile.age ? profile.age + "岁" : "未知"}
- 性别：${profile.gender || "未知"}
- 慢性病史：${profile.chronicDiseases?.join("、") || "未知"}
- 过敏史：${profile.allergies?.join("、") || "未知"}
- 当前用药：${profile.currentMedications?.map((m) => m.name || m).join("、") || "未知"}`;
    }

    const bpInfo =
      Number.isFinite(supplement.bpSystolic) && Number.isFinite(supplement.bpDiastolic)
        ? `血压约 ${supplement.bpSystolic}/${supplement.bpDiastolic} mmHg`
        : "";
    const symptomInfo =
      supplement.hasSymptoms === false
        ? "用户否认头晕、胸闷、走路气喘等不适"
        : supplement.hasSymptoms === true
          ? "用户表示有相关不适症状"
          : "";

    const clarifyBlock = pendingQa.clarifyQuestions?.length
      ? pendingQa.clarifyQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "助手此前询问了血压控制情况和症状情况";

    const systemPrompt = `你是银发健康助手，专为中老年人提供贴心的健康服务，不替代医生诊断。

用户正在回答你上一轮健康咨询的追问，请结合完整上下文给出明确建议。
要求：
1. 直接回答用户最初的问题，不要只说“已记录血压”。
2. 若用户补充了血压数值，结合数值判断运动/饮食等建议是否合适。
3. 回答简洁，用短句，避免专业术语。
4. 输出纯文本，不要 JSON。

${profileContext}`;

    const userPrompt = `咨询类型：${pendingQa.subIntent || "health_qa.general"}
用户最初问题：${pendingQa.originalQuestion}
助手曾追问：
${clarifyBlock}
用户补充回答：${supplement.raw}
${bpInfo ? `已提取：${bpInfo}` : ""}
${symptomInfo ? `已提取：${symptomInfo}` : ""}

请给出完整、实用的健康建议。`;

    const response = await fetch(LLM_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`健康咨询续答失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let content = (data.choices?.[0]?.message?.content || "").trim();
    content = content.replace(/\*\*/g, "");

    if (!content && Number.isFinite(supplement.bpSystolic) && Number.isFinite(supplement.bpDiastolic)) {
      const high = supplement.bpSystolic >= 140 || supplement.bpDiastolic >= 90;
      content = high
        ? `您最近血压 ${supplement.bpSystolic}/${supplement.bpDiastolic} mmHg，偏高，不建议快跑。\n建议先从散步、太极拳等温和运动开始，每次20到30分钟，感觉微微出汗即可。\n如果运动时头晕、胸闷，请马上停下来休息，并按时监测血压。`
        : `您最近血压 ${supplement.bpSystolic}/${supplement.bpDiastolic} mmHg，控制尚可，仍不建议突然快跑。\n可以先从快走开始，每周3到5次，每次20到30分钟，循序渐进更安全。`;
    }

    return content;
  } catch (error) {
    console.error("健康咨询续答错误:", error);
    return "";
  }
}

async function callHealthQaLLM(utterance, subIntent, { profile, memory } = {}) {
  try {
    let profileContext = "";
    if (profile) {
      profileContext = `
用户画像：
- 姓名：${profile.name || '未知'}
- 年龄：${profile.age ? profile.age + '岁' : '未知'}
- 性别：${profile.gender || '未知'}
- 慢性病史：${profile.chronicDiseases?.join('、') || '未知'}
- 过敏史：${profile.allergies?.join('、') || '未知'}
- 当前用药：${profile.currentMedications?.map(m => m.name || m).join('、') || '未知'}`;
    }

    let memoryContext = "";
    if (memory?.deepMotivation?.healthGoal) {
      memoryContext = `\n健康目标：${memory.deepMotivation.healthGoal}`;
    }

    const history = MEMORY.history.slice(-6).map(item => `${item.role === 'user' ? '用户' : '助手'}: ${item.text}`).join('\n');
    const systemPrompt = `你是银发健康助手，专为中老年人提供贴心的健康服务，不替代医生诊断。

核心原则：
1. 优先使用已有的用户信息（如过敏史、慢性病史、用药情况），不要重复询问已知信息。
2. 回答要简洁明了，用短句，避免专业术语。
3. 保持对话连贯性，理解上下文并进行自然对话，不要机械问答。

回答要求：
1. 饮食推荐：根据用户的健康状况和过敏史给出具体建议，说明推荐理由。
2. 用药咨询：不能给处方级调整，提醒遵医嘱。
3. 症状咨询：先做安全分流，出现危险信号建议及时就医。
4. 信息不足时：只补充1个最必要的问题，不要一次问多个。
5. 输出纯文本，不要 JSON。

${profileContext}
${memoryContext}`;

    const userPrompt = `咨询类型：${subIntent}
最近对话：
${history}

用户问题：${utterance}`;

    const response = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`健康咨询API调用失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    let content = (data.choices?.[0]?.message?.content || "").trim();
    // 移除Markdown格式符号（如**加粗符号）
    content = content.replace(/\*\*/g, '');
    return content;
  } catch (error) {
    console.error('健康咨询LLM调用错误:', error);
    return "";
  }
}

// ==================== 大模型调用（第二层） ====================

async function callLLM(utterance, ruleResult, { profile, memory } = {}) {
  try {
    console.log('开始调用LLM API...');
    console.log('用户输入:', utterance);
    console.log('第一层识别结果:', ruleResult);

    // 构建系统提示词（加入用户画像和核心记忆增强）
    let profileContext = "";
    if (profile && profile.name) {
      profileContext = `
用户画像：
- 姓名：${profile.name}
- 年龄：${profile.age ? profile.age + '岁' : '未知'}
- 慢性病史：${profile.chronicDiseases?.join('、') || '未知'}
- 当前用药：${profile.currentMedications?.map(m => m.name || m).join('、') || '未知'}
- 行为阶段：${profile.behaviorStage || '新手期'}`;
    }

    let memoryContext = "";
    if (memory) {
      const recentMilestones = memory.milestones?.slice(-3) || [];
      if (recentMilestones.length) {
        memoryContext = `
核心记忆（最近里程碑）：
${recentMilestones.map(m => `- ${m.name}（${m.date}）`).join('\n')}`;
      }
      if (memory.deepMotivation?.healthGoal) {
        memoryContext += `\n健康目标：${memory.deepMotivation.healthGoal}`;
      }
    }

    const systemPrompt = `你是"银发健康助手"的意图识别与参数抽取模块，不直接给医学诊断结论，不给处方级用药调整方案。
你的任务：结合【用户一句话 + 会话历史 + 用户画像】，输出【单一最可能意图】与【结构化参数】与【下一步动作】。
面向老年人/子女时，语言要清晰、短句、可操作。
${profileContext}
${memoryContext}

必须从以下意图中选择（不可新增）：
用药管理：med_log、med_query、med_remind_set、med_remind_cancel
健康数据：health_log_bp、health_log_sugar、health_log_weight、health_query
运动饮食：exercise_log、exercise_query、exercise_recommend、diet_log、diet_query、diet_suggest
健康咨询：consult_med、consult_diet、consult_symptom
数据看板：dashboard_self、dashboard_family
智能对话：chat_greet、chat_emotion、chat_help
个人画像：profile_update（当用户提供姓名、年龄、性别、慢性病、体重、手机号、家庭成员等信息时）

输出必须是严格 JSON（不要多余文字），字段包括：
- intent: string
- confidence: 0~1
- reasoning: 简短原因（<=30字）
- extractedData: object（按意图提供字段）
- needClarify: boolean
- clarifyQuestions: string[]（最多2条）

extractedData 字段说明：
1. 个人画像信息（profile_update意图或任何包含画像信息的输入）：
   - name: 姓名（如"王大爷"）
   - age: 年龄（数字，如70）
   - gender: 性别（"男"或"女"）
   - chronicDisease: 慢性病（字符串或数组，如"高血压"或["高血压", "糖尿病"]）
   - weight: 体重（数字，如65）
   - phone: 手机号（如"13812345678"）
   - familyMembers: 家庭成员（数组，如[{"relation":"son","label":"儿子"}]）

2. 健康数据记录：
   - health_log_bp: { systolic: 数字, diastolic: 数字 }
   - health_log_sugar: { value: 数字, type: "fasting"|"post" }
   - health_log_weight: { value: 数字 }
   - exercise_log: { action: 运动类型, duration: 数字, durationUnit: "分钟"|"小时", feeling: 感受 }
   - diet_log: { foods: [食物名称], meal: "早餐"|"午餐"|"晚餐", amount: 分量 }

3. 健康数据查询：
   - exercise_query: 查询运动记录（如"这周运动了多少"）
   - diet_query: 查询饮食记录（如"今天我吃了什么"）
   - diet_suggest: 饮食建议（如"午餐吃什么"）

会话记忆规则（必须执行）：
1) 如果上一轮你问了一个补充问题（如"低压是多少？"、"药名是什么？"），本轮用户只回答了数字/药名，则要结合上一轮语境补全参数，不要当作新意图。
2) 对"血压+单个数字"（如「今天血压150」「血压150」）必须识别为 health_log_bp，并把 systolic=150 直接写入；不要求用户必须提供 150/90 才能记录。
3) 对情绪表达（如「一个人在家很闷」「有点孤单」「睡不着」「我好孤独」）必须识别为 chat_emotion，并优先给温暖安慰，再用一句简短问题引导继续表达。
4) 当用户提供个人信息（如"我叫王大爷"、"我今年70岁"、"我有高血压"），识别为 profile_update，并在 extractedData 中提取相应字段。

紧急优先：出现胸痛/呼吸困难/意识障碍/中风表现/大出血/自伤等，优先判为 consult_symptom，并在 extractedData 里标记 riskHint="urgent"。
如果用户是子女并询问父母数据：判为 dashboard_family 或 health_query，并在 extractedData 标记 needAuthorization=true。`;

    // 构建用户提示词 - 优化：减少历史记录数量，加快API调用速度
    const history = MEMORY.history.slice(-3).map(item => `${item.role === 'user' ? '用户' : '助手'}: ${item.text}`).join('\n');
    const userPrompt = `用户类型：elder
第一层命中：${ruleResult.hit}
第一层结果：${JSON.stringify(ruleResult)}
会话历史（最近3条，从旧到新）：
${history}
用户原话：${utterance}

请输出严格 JSON。`;

    console.log('LLM Endpoint:', LLM_ENDPOINT);

    const response = await fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 300
      })
    });
    console.log('API响应状态:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API错误详情:', errorText);
      throw new Error(`API调用失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('API响应数据:', JSON.stringify(data, null, 2));

    let llmResponse = data.choices[0].message.content;
    console.log('LLM响应:', llmResponse);

    // 去除markdown代码块标记
    llmResponse = llmResponse.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // 解析JSON响应
    const parsedResponse = JSON.parse(llmResponse);
    console.log('解析后的响应:', parsedResponse);

    // 映射到当前系统的意图格式
    const intentMap = {
      'med_log': INTENTS.MED_ADD,
      'med_query': INTENTS.MED_QUERY,
      'med_remind_set': INTENTS.MED_REMIND_SET,
      'med_remind_cancel': INTENTS.MED_REMIND_CANCEL,
      'health_log_bp': INTENTS.BP_ADD,
      'health_log_sugar': INTENTS.BS_ADD,
      'health_log_weight': INTENTS.WEIGHT_ADD,
      'health_query_bp': INTENTS.BP_QUERY,
      'health_query_sugar': INTENTS.BS_QUERY,
      'exercise_log': INTENTS.EXERCISE_LOG,
      'exercise_query': INTENTS.EXERCISE_QUERY,
      'exercise_recommend': INTENTS.EXERCISE_RECOMMEND,
      'diet_log': INTENTS.DIET_LOG,
      'diet_query': INTENTS.DIET_QUERY,
      'diet_suggest': INTENTS.DIET_SUGGEST,
      'stats_daily': INTENTS.STATS_QUERY,
      'stats_weekly': INTENTS.STATS_QUERY,
      'stats_monthly': INTENTS.STATS_QUERY,
      'stats_trend': INTENTS.STATS_QUERY,
      'stats_goal': INTENTS.STATS_QUERY,
      'consult_med': INTENTS.QA,
      'consult_diet': INTENTS.QA,
      'consult_symptom': INTENTS.QA,
      'chat_greet': INTENTS.SMALLTALK,
      'chat_emotion': INTENTS.SMALLTALK,
      'chat_help': INTENTS.SMALLTALK,
      'profile_update': INTENTS.SMALLTALK
    };

    const mappedIntent = intentMap[parsedResponse.intent] || INTENTS.OTHER;
    console.log('映射后的意图:', mappedIntent);

    // 构建slots
    const slots = {
      ...ruleResult.slots,
      ...parsedResponse.extractedData
    };

    const result = {
      intent: mappedIntent,
      slots,
      confidence: parsedResponse.confidence || 0.85,
      need_clarify: parsedResponse.needClarify || false,
      clarify_questions: parsedResponse.clarifyQuestions || [],
      llm_raw: parsedResponse
    };

    console.log('最终LLM结果:', result);
    return result;
  } catch (error) {
    console.error('LLM调用错误:', error);
    console.log('回退到mock实现');
    try {
      const mockResult = secondLayerMock(utterance, ruleResult);
      console.log('Mock结果:', mockResult);
      return mockResult;
    } catch (mockError) {
      console.error('Mock实现也出错了:', mockError);
      // 返回一个默认的结果
      return {
        intent: INTENTS.SMALLTALK,
        slots: {},
        confidence: 0.5,
        need_clarify: false,
        clarify_questions: [],
      };
    }
  }
}

// ==================== Mock降级实现 ====================

function secondLayerMock(utterance, ruleResult) {
  let intent = ruleResult.hit ? ruleResult.intent : INTENTS.OTHER;
  const slots = { ...ruleResult.slots };

  if (!ruleResult.hit) {
    if (MEMORY.pending.bp && /^\s*\d{2,3}\s*$/.test(utterance)) {
      intent = INTENTS.BP_ADD;
      slots.bp_systolic = MEMORY.pending.bp.systolic;
      slots.bp_diastolic = Number(utterance.trim());
      slots.bp_unit = "mmHg";
    } else
    if (MEMORY.pending.bp && /^\s*\d{2,3}\s*[\/\\到-]\s*\d{2,3}\s*$/.test(utterance)) {
      const m = utterance.match(/(\d{2,3})\s*[\/\\到-]\s*(\d{2,3})/);
      intent = INTENTS.BP_ADD;
      slots.bp_systolic = Number(m[1]);
      slots.bp_diastolic = Number(m[2]);
      slots.bp_unit = "mmHg";
    } else
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
    } else if (/(体重|重量|重)[^0-9]*(\d+(?:\.\d+)?)\s*(公斤|kg|千克|斤)/i.test(utterance)) {
      intent = INTENTS.WEIGHT_ADD;
    } else if (/(我想|我要|想要|打算|准备).*(锻炼|运动|快走|慢跑|跑步|散步|慢走|游泳|太极|瑜伽|广场舞|骑车)/.test(utterance)) {
      intent = INTENTS.EXERCISE_RECOMMEND;
    } else if (/(今天|刚刚|刚才).*(散步|跑步|快走|慢走|游泳|太极|瑜伽|广场舞|骑车).*(了|过|\d+\s*(分钟|分|小时))/.test(utterance)) {
      intent = INTENTS.EXERCISE_LOG;
    } else if (/(推荐|建议|适合.*运动|做什么运动|怎么运动|适合我的运动)/.test(utterance)) {
      intent = INTENTS.EXERCISE_RECOMMEND;
    } else if (/(这周|本周|今天|最近).*(运动|锻炼).*(几次|多少|怎么样|情况)|运动.*(统计|趋势|记录)/.test(utterance)) {
      intent = INTENTS.EXERCISE_QUERY;
    } else if (/(今天|早餐|午餐|晚餐|早上|中午|晚上).*(吃了|喝了|摄入)/.test(utterance)) {
      intent = INTENTS.DIET_LOG;
    } else if (/(热量|卡路里|脂肪|蛋白质|维生素|营养|摄入了多少)/.test(utterance)) {
      intent = INTENTS.DIET_QUERY;
    } else if (/(吃什么|怎么吃|饮食建议|能吃吗|适合吃|忌口)/.test(utterance)) {
      intent = INTENTS.DIET_SUGGEST;
    } else if (/(今天统计|本周统计|这周怎么样|本月统计|趋势|目标|进度|看统计|查看统计)/.test(utterance)) {
      intent = INTENTS.STATS_QUERY;
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
    } else if (/(好了|好些了|好多了|缓解了|没事了|不难受了).*(谢谢|感谢)?|(谢谢|感谢).*(好了|好些了|好多了|缓解了|没事了|不难受了)/.test(utterance)) {
      intent = INTENTS.SMALLTALK;
    } else if (/(身高|年龄|几岁|我今年\d{1,3}岁|我的身高是\d{2,3})/.test(utterance)) {
      intent = INTENTS.SMALLTALK;
    } else if (/(心情不好|难受|害怕|焦虑|孤单|孤独|想哭|没人陪|睡不着|很闷|闷得慌|无聊|一个人在家|一个人|伤心|难过)/.test(utterance)) {
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

// ==================== 记忆系统：数据保存 ====================

async function saveToMemory(intent, ai, utterance) {
  if (!memoryService) return null;

  try {
    let savedRecord = null;

    switch (intent) {
      case "medication.med_log": {
        const data = extractMedicationData(ai.llm_raw, utterance);
        savedRecord = await memoryService.saveMedication(data);
        console.log("[记忆] 用药记录已保存:", savedRecord);

        // 用药依从性检测
        try {
          const medHistory = await memoryService.queryMedications(7);
          const medAlerts = alertService.detectMedicationAlert(medHistory, Date.now());
          if (medAlerts.length > 0) {
            console.log("[告警] 检测到用药依从性异常:", medAlerts);
            medAlerts.forEach(alert => alertService.saveAlert(alert));
            showAlertNotification(medAlerts);
          }
        } catch (e) {
          console.warn("[告警] 用药依从性检测失败:", e);
        }
        break;
      }
      case "health_data.bp_log": {
        const data = extractBloodPressureData(ai.llm_raw, utterance);
        savedRecord = await memoryService.saveBloodPressure(data);
        console.log("[记忆] 血压记录已保存:", savedRecord);
        
        // 检测血压异常
        const bpAlerts = alertService.detectBloodPressureAlert(
          data.systolic, 
          data.diastolic, 
          data.time
        );
        if (bpAlerts.length > 0) {
          console.log("[告警] 检测到血压异常:", bpAlerts);
          bpAlerts.forEach(alert => alertService.saveAlert(alert));
          showAlertNotification(bpAlerts);
        }

        // 血压趋势异常检测
        try {
          const bpHistory = await memoryService.queryBloodPressure(7);
          const trendAlerts = alertService.detectBpTrendAlert(bpHistory);
          if (trendAlerts.length > 0) {
            console.log("[告警] 检测到血压趋势异常:", trendAlerts);
            trendAlerts.forEach(alert => alertService.saveAlert(alert));
            showAlertNotification(trendAlerts);
          }
        } catch (e) {
          console.warn("[告警] 血压趋势检测失败:", e);
        }
        break;
      }
      case "health_data.bs_log":
      case "health_data.bs_log_fasting":
      case "health_data.bs_log_post": {
        const data = extractBloodSugarData(ai.llm_raw, utterance);
        savedRecord = await memoryService.saveBloodSugar(data);
        console.log("[记忆] 血糖记录已保存:", savedRecord);
        
        // 检测血糖异常
        const bsAlerts = alertService.detectBloodSugarAlert(
          data.value, 
          data.type, 
          data.time
        );
        if (bsAlerts.length > 0) {
          console.log("[告警] 检测到血糖异常:", bsAlerts);
          // 保存告警到存储
          bsAlerts.forEach(alert => alertService.saveAlert(alert));
          showAlertNotification(bsAlerts);
        }
        break;
      }
      case "health_data.weight_log": {
        const data = extractWeightData(ai.llm_raw, utterance);
        savedRecord = await memoryService.saveWeight(data);
        console.log("[记忆] 体重记录已保存:", savedRecord);
        
        // 同时更新个人画像中的体重
        if (data.value) {
          const existingProfile = await memoryService.loadProfile();
          if (existingProfile.weight !== data.value) {
            existingProfile.weight = data.value;
            await memoryService.updateProfile(existingProfile);
            console.log("[记忆] 个人画像体重已更新:", data.value);
          }
        }
        break;
      }
      case "exercise.log": {
        const data = extractExerciseData(ai.llm_raw, utterance);
        savedRecord = await memoryService.saveExercise(data);
        console.log("[记忆] 运动记录已保存:", savedRecord);
        break;
      }
      case "diet.log": {
        let data;
        if (ai.llm_raw?.pendingDiet && ai.llm_raw?.supplement) {
          data = mergeDietSupplement(ai.llm_raw.pendingDiet.data, ai.llm_raw.supplement);
          MEMORY.pending.diet = null;
        } else {
          data = extractDietData(ai.llm_raw, utterance);
        }
        if (data.foods?.length > 0 || data.meal) {
          savedRecord = await memoryService.saveDiet(data);
          console.log("[记忆] 饮食记录已保存:", savedRecord);
          if (data.foods?.length > 0 && !data.meal && !data.note) {
            MEMORY.pending.diet = { data, at: Date.now() };
          } else {
            MEMORY.pending.diet = null;
          }
        }
        break;
      }
      case "remind.med_set":
      case "remind.temp_set": {
        // 如果仍在追问阶段（用户还没提供完整信息），不执行保存
        if (MEMORY.pending.reminder && MEMORY.pending.reminder.type === intent) {
          console.log("[记忆] 提醒信息不完整，等待用户补充，跳过保存");
          break;
        }
        const data = extractReminderData(ai.llm_raw, utterance, ai.slots);
        if (!data.time || (data.type === "medication" && !data.drugName)) {
          console.log("[记忆] 提醒关键信息缺失，跳过保存:", data);
          break;
        }
        savedRecord = await memoryService.addReminder(data);
        console.log("[记忆] 提醒已设置:", savedRecord);
        
        // 根据类型获取提醒名称
        let rType;
        switch (data.type) {
          case "blood_pressure": rType = "测血压"; break;
          case "blood_sugar": rType = "测血糖"; break;
          case "temperature": rType = "量体温"; break;
          case "checkup": rType = "体检"; break;
          default: rType = "吃药";
        }
        
        const rTime = data.time || "08:00";
        const rDrug = data.drugName ? `（${data.drugName}）` : "";
        
        // 根据是否有延迟时间显示不同的消息
        let confirmMsg;
        if (data.delayMinutes) {
          confirmMsg = `✅ 已设置${rType}提醒${rDrug}：${data.delayMinutes}分钟后（${rTime}）会提醒您。\n到时间我会在对话中主动通知您。`;
        } else if (data.frequency === "daily") {
          confirmMsg = `✅ 已设置${rType}提醒${rDrug}：每天 ${rTime} 会提醒您。\n到时间我会在对话中主动通知您，也会发浏览器通知。`;
        } else {
          confirmMsg = `✅ 已设置${rType}提醒${rDrug}：${rTime}会提醒您。\n到时间我会在对话中主动通知您。`;
        }
        
        appendMessage({
          role: "assistant",
          text: confirmMsg,
          meta: `助手 · ${nowTime()}`,
          tags: [{ text: "提醒已设置" }],
        });
        break;
      }
      case "remind.med_cancel": {
        const reminders = await memoryService.loadReminders();
        const allReminders = reminders.reminders || [];
        const uText = (utterance ?? "").trim();
        const isDelete = /删除|删/.test(uText);
        const isEnable = /开启|打开|启用/.test(uText);
        const isDisable = /关闭|停用/.test(uText);
        const enabledList = allReminders.filter(r => r.enabled);
        const disabledList = allReminders.filter(r => !r.enabled);

        // 提取序号（支持中文数字、多序号、范围"第3到第5条"）
        const chineseNumMap = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
        const parseNum = (s) => {
          if (/^\d+$/.test(s)) return Number(s);
          let result = 0, temp = 0;
          for (const ch of s) {
            if (ch === '十') { temp = temp === 0 ? 10 : temp * 10; result += temp; temp = 0; }
            else if (chineseNumMap[ch] !== undefined) { temp = chineseNumMap[ch]; }
          }
          return result + temp || 0;
        };
        let indices = [];
        const rangeMatch = uText.match(/第\s*([零一二两三四五六七八九十\d]+)\s*(?:到|至|-|—|~)\s*第?\s*([零一二两三四五六七八九十\d]+)\s*条/);
        if (rangeMatch) {
          const from = parseNum(rangeMatch[1]);
          const to = parseNum(rangeMatch[2]);
          if (from > 0 && to > 0) {
            const lo = Math.min(from, to);
            const hi = Math.max(from, to);
            for (let i = lo; i <= hi; i++) indices.push(i);
          }
        }
        if (indices.length === 0) {
          const idxMatches = [...uText.matchAll(/第\s*([零一二两三四五六七八九十\d]+)\s*条/g)];
          if (idxMatches.length > 0) {
            indices = idxMatches.map(m => parseNum(m[1])).filter(n => n > 0);
          }
        }
        if (indices.length === 0 && ai.slots?.reminderIndices) {
          indices = ai.slots.reminderIndices;
        }

        const typeLabel = (r) => r.type === "medication" ? "吃药" : r.type === "blood_pressure" ? "测血压" : r.type === "blood_sugar" ? "测血糖" : "其他";
        const drugLabel = (r) => r.drugName ? `（${r.drugName}）` : "";
        const actionWord = isDelete ? "删除" : isEnable ? "开启" : "关闭";

        // 判断用户指定了哪个分区
        const section = ai.slots?.reminderSection || (/关闭.*中|已关闭/.test(uText) ? "disabled" : /开启.*中|已开启/.test(uText) ? "enabled" : null);

        if (/全部|所有/.test(uText)) {
          // 全部操作
          let targetList;
          if (isDelete) {
            targetList = section === "disabled" ? disabledList : section === "enabled" ? enabledList : allReminders;
          } else if (isEnable) {
            targetList = section === "enabled" ? enabledList : disabledList;
          } else {
            targetList = enabledList;
          }
          let count = 0;
          for (const r of targetList) {
            if (isDelete) { await memoryService.removeReminder(r.id); }
            else if (isEnable) { await memoryService.toggleReminder(r.id, true); }
            else { await memoryService.toggleReminder(r.id, false); }
            count++;
          }
          appendMessage({
            role: "assistant",
            text: `✅ 已${actionWord}全部 ${count} 个提醒。如需重新设置，跟我说'设置吃药提醒'即可。`,
            meta: `助手 · ${nowTime()}`,
          });
        } else if (indices.length > 0) {
          // 按序号操作：开启和已关闭各自独立编号
          const uniqueIndices = [...new Set(indices)].sort((a, b) => b - a);
          let results = [];

          if (section === "enabled") {
            // 只操作开启列表
            for (const idx of uniqueIndices) {
              if (idx > 0 && idx <= enabledList.length) {
                const target = enabledList[idx - 1];
                if (isDelete) { await memoryService.removeReminder(target.id); }
                else if (isEnable) { /* 已开启无需操作 */ }
                else { await memoryService.toggleReminder(target.id, false); }
                const act = isDelete ? "删除" : isEnable ? "已开启，无需操作" : "关闭";
                results.push(`【开启】第 ${idx} 条：${typeLabel(target)}${drugLabel(target)} 每天 ${target.time}（${act}）`);
              }
            }
          } else if (section === "disabled") {
            // 只操作已关闭列表
            for (const idx of uniqueIndices) {
              if (idx > 0 && idx <= disabledList.length) {
                const target = disabledList[idx - 1];
                if (isDelete) { await memoryService.removeReminder(target.id); }
                else if (isEnable) { await memoryService.toggleReminder(target.id, true); }
                else { /* 已关闭无需操作 */ }
                const act = isDelete ? "删除" : isEnable ? "开启" : "已关闭，无需操作";
                results.push(`【已关闭】第 ${idx} 条：${typeLabel(target)}${drugLabel(target)} 每天 ${target.time}（${act}）`);
              }
            }
          } else {
            // 未指定分区：根据操作类型决定操作哪个列表
            // "关闭"→ 只操作开启列表；"开启"→ 只操作已关闭列表；"删除"→ 两个分区都删
            for (const idx of uniqueIndices) {
              if (isDelete) {
                // 删除：两个分区同序号都删
                if (idx > 0 && idx <= enabledList.length) {
                  const target = enabledList[idx - 1];
                  await memoryService.removeReminder(target.id);
                  results.push(`【开启】第 ${idx} 条：${typeLabel(target)}${drugLabel(target)} 每天 ${target.time}（删除）`);
                }
                if (idx > 0 && idx <= disabledList.length) {
                  const target = disabledList[idx - 1];
                  await memoryService.removeReminder(target.id);
                  results.push(`【已关闭】第 ${idx} 条：${typeLabel(target)}${drugLabel(target)} 每天 ${target.time}（删除）`);
                }
              } else if (isEnable) {
                // 开启：只操作已关闭列表
                if (idx > 0 && idx <= disabledList.length) {
                  const target = disabledList[idx - 1];
                  await memoryService.toggleReminder(target.id, true);
                  results.push(`【已关闭】第 ${idx} 条：${typeLabel(target)}${drugLabel(target)} 每天 ${target.time}（已开启）`);
                }
              } else {
                // 关闭：只操作开启列表
                if (idx > 0 && idx <= enabledList.length) {
                  const target = enabledList[idx - 1];
                  await memoryService.toggleReminder(target.id, false);
                  results.push(`【开启】第 ${idx} 条：${typeLabel(target)}${drugLabel(target)} 每天 ${target.time}（已关闭）`);
                }
              }
            }
          }

          if (results.length > 0) {
            appendMessage({
              role: "assistant",
              text: `✅ 操作结果：\n${results.join("\n")}`,
              meta: `助手 · ${nowTime()}`,
            });
          } else {
            const info = `【开启】${enabledList.length} 条，【已关闭】${disabledList.length} 条`;
            appendMessage({
              role: "assistant",
              text: `指定的提醒序号不存在或无需操作。当前${info}。`,
              meta: `助手 · ${nowTime()}`,
            });
          }
        } else {
          appendMessage({
            role: "assistant",
            text: `请告诉我具体操作哪一条？（例如：关闭第2条 / 开启第1条 / 删除第3条 / 删除开启中第1条 / 删除关闭中第3条）`,
            meta: `助手 · ${nowTime()}`,
          });
        }
        break;
      }
      case "remind.bp_set": {
        if (MEMORY.pending.reminder && MEMORY.pending.reminder.type === intent) {
          console.log("[记忆] 测血压提醒信息不完整，等待用户补充，跳过保存");
          break;
        }
        const data = extractReminderData(ai.llm_raw, utterance);
        if (!data.time) {
          console.log("[记忆] 测血压提醒缺少时间，跳过保存");
          break;
        }
        data.type = "blood_pressure";
        savedRecord = await memoryService.addReminder(data);
        appendMessage({
          role: "assistant",
          text: `✅ 已设置测血压提醒：每天 ${data.time || "08:00"} 会提醒您。`,
          meta: `助手 · ${nowTime()}`,
          tags: [{ text: "提醒已设置" }],
        });
        break;
      }
      case "remind.bs_set": {
        if (MEMORY.pending.reminder && MEMORY.pending.reminder.type === intent) {
          console.log("[记忆] 测血糖提醒信息不完整，等待用户补充，跳过保存");
          break;
        }
        const data = extractReminderData(ai.llm_raw, utterance);
        if (!data.time) {
          console.log("[记忆] 测血糖提醒缺少时间，跳过保存");
          break;
        }
        data.type = "blood_sugar";
        savedRecord = await memoryService.addReminder(data);
        appendMessage({
          role: "assistant",
          text: `✅ 已设置测血糖提醒：每天 ${data.time || "08:00"} 会提醒您。`,
          meta: `助手 · ${nowTime()}`,
          tags: [{ text: "提醒已设置" }],
        });
        break;
      }
    }

    // 个人画像提取与更新（体重记录已在上方单独处理，避免重复写入）
    const extractedProfile = extractProfileData(ai?.llm_raw, utterance);
    if (intent === "health_data.weight_log") {
      extractedProfile.weight = null;
    }
    if (shouldUpdateProfile(extractedProfile)) {
      const existingProfile = await memoryService.loadProfile();
      const mergedProfile = mergeProfileData(existingProfile, extractedProfile);
      
      // 检查是否有实际更新
      const hasChanges = JSON.stringify(existingProfile) !== JSON.stringify(mergedProfile);
      if (hasChanges) {
        await memoryService.updateProfile(mergedProfile);
        console.log("[记忆] 个人画像已更新:", mergedProfile);
        
        // 生成更新确认消息
        const updateMessages = [];
        if (extractedProfile.name) updateMessages.push(`姓名：${extractedProfile.name}`);
        if (extractedProfile.age) updateMessages.push(`年龄：${extractedProfile.age}岁`);
        if (extractedProfile.gender) updateMessages.push(`性别：${extractedProfile.gender}`);
        if (extractedProfile.height) updateMessages.push(`身高：${extractedProfile.height}厘米`);
        if (extractedProfile.weight) updateMessages.push(`体重：${extractedProfile.weight}公斤`);
        if (extractedProfile.phone) updateMessages.push(`手机号：${extractedProfile.phone}`);
        if (extractedProfile.allergies.length > 0) {
          updateMessages.push(`过敏史：${extractedProfile.allergies.join('、')}`);
        }
        if (extractedProfile.chronicDiseases.length > 0) {
          updateMessages.push(`慢性病：${extractedProfile.chronicDiseases.join('、')}`);
        }
        if (extractedProfile.familyMembers.length > 0) {
          const familyLabels = extractedProfile.familyMembers.map(m => m.label).join('、');
          updateMessages.push(`家庭成员：${familyLabels}`);
        }
        
        if (updateMessages.length > 0) {
          appendMessage({
            role: "assistant",
            text: `好的，我已记下您的信息：\n${updateMessages.join('\n')}`,
            meta: `助手 · ${nowTime()}`,
            tags: [{ text: "画像已更新" }],
          });
        }
      }
    }

    // 情绪记录
    const emotionData = extractEmotionData(utterance);
    if (emotionData) {
      await memoryService.saveEmotion(emotionData);
      console.log("[记忆] 情绪记录已保存:", emotionData);
    }

    // 健康事件（WARN/URGENT级别）
    if (intent === "health_qa.symptom") {
      await memoryService.saveEvent({
        type: "symptom",
        description: utterance,
        riskLevel: "WARN",
      });
    }

    // 数据抢救：即使意图不是记录，如果utterance中包含血压/血糖数据也自动保存+告警
    if (!savedRecord) {
      const bpMatch = utterance.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
      if (bpMatch && (/血压|量了|测了|高压|低压/.test(utterance) || MEMORY.pending.bp)) {
        const data = { systolic: Number(bpMatch[1]), diastolic: Number(bpMatch[2]), time: new Date().toISOString() };
        savedRecord = await memoryService.saveBloodPressure(data);
        console.log("[记忆] 抢救保存血压记录:", savedRecord);
        MEMORY.pending.bp = null;
        const bpAlerts = alertService.detectBloodPressureAlert(data.systolic, data.diastolic, data.time);
        if (bpAlerts.length > 0) {
          bpAlerts.forEach(alert => alertService.saveAlert(alert));
          showAlertNotification(bpAlerts);
        }
      }
      const bsMatch = utterance.match(/(?:血糖|空腹|餐后).*(\d+\.?\d*)/);
      if (bsMatch && /血糖/.test(utterance)) {
        const data = { value: Number(bsMatch[1]), type: /空腹/.test(utterance) ? 'fasting' : 'post', time: new Date().toISOString() };
        savedRecord = await memoryService.saveBloodSugar(data);
        console.log("[记忆] 抢救保存血糖记录:", savedRecord);
        const bsAlerts = alertService.detectBloodSugarAlert(data.value, data.type, data.time);
        if (bsAlerts.length > 0) {
          bsAlerts.forEach(alert => alertService.saveAlert(alert));
          showAlertNotification(bsAlerts);
        }
      }
    }

    return savedRecord;
  } catch (error) {
    console.error("[记忆] 保存数据失败:", error);
    return null;
  }
}

// ==================== 健康数据评估函数 ====================

// 评估血压（65-79岁普通健康老人标准）
// 理想正常：收缩压 120～130，舒张压 70～80 mmHg
// 正常偏高（临界）：130～139 / 80～89 mmHg
// 高血压标准：≥140 / 90 mmHg
// 低血压：＜90 / 60 mmHg
function assessBloodPressure(systolic, diastolic) {
  if (!Number.isFinite(systolic) && !Number.isFinite(diastolic)) return "数据不完整";
  if (!Number.isFinite(systolic)) return `低压 ${diastolic} mmHg`;
  if (!Number.isFinite(diastolic)) return `高压 ${systolic} mmHg`;
  
  if (systolic >= 180 || diastolic >= 110) return "明显升高";
  if (systolic >= 140 || diastolic >= 90) return "偏高";
  if ((systolic >= 130 && systolic < 140) || (diastolic >= 80 && diastolic < 90)) return "正常偏高";
  if (systolic < 90 || diastolic < 60) return "偏低";
  return "正常范围";
}

function getBloodPressureAdvice(systolic, diastolic) {
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) {
    return "";
  }
  
  if (systolic >= 180 || diastolic >= 120) {
    return "【建议】血压明显升高，需立即坐下休息，5-10分钟后复测。如仍高或伴有胸痛、头痛、说话不清等症状，请立即就医。";
  }
  if (systolic >= 140 || diastolic >= 90) {
    return "【建议】血压偏高，今天饮食尽量清淡少盐，避免饮酒和剧烈运动，保持情绪平稳。连续几天偏高建议咨询医生。";
  }
  if (systolic < 90 || diastolic < 60) {
    return "【建议】血压偏低，起身动作放慢，适量喝温水。反复偏低或正在服降压药建议咨询医生。";
  }
  if (systolic >= 130 || diastolic >= 80) {
    return "【建议】血压正常偏高，继续保持清淡饮食和规律运动，每周测几次观察趋势。";
  }
  return "【建议】血压正常，继续保持规律作息、清淡饮食和适量运动。";
}

// 评估血糖（65岁以上老年人标准）
// 空腹血糖：正常 3.9～6.1，糖耐量异常（偏高）6.1～7.0，糖尿病参考 ≥7.0
// 餐后2小时血糖：正常 ＜7.8，偏高 7.8～11.1，糖尿病参考 ≥11.1
function assessBloodSugar(value, type) {
  if (!Number.isFinite(value)) return "数据不完整";
  
  if (type === 'fasting') {
    if (value < 3.9) return "偏低";
    if (value >= 7.0) return "偏高";
    if (value >= 6.1 && value < 7.0) return "正常偏高";
    return "正常范围";
  }
  if (type === 'postprandial') {
    if (value < 3.9) return "偏低";
    if (value >= 11.1) return "偏高";
    if (value >= 7.8 && value < 11.1) return "正常偏高";
    return "正常范围";
  }
  // 未指定类型
  if (value < 3.9) return "偏低";
  if (value >= 11.1) return "偏高";
  if (value >= 7.0) return "偏高（需结合测量时间）";
  if (value >= 6.1) return "正常偏高";
  return "正常范围";
}

function getBloodSugarAdvice(value, type) {
  if (!Number.isFinite(value)) {
    return "";
  }
  
  const isFasting = type === 'fasting';
  const isPostMeal = type === 'postprandial';
  
  if (isFasting) {
    if (value < 3.9) {
      return "【建议】空腹血糖偏低，建议及时补充含糖食物，观察是否有心慌、出汗等症状。反复低血糖请咨询医生。";
    }
    if (value >= 7.0) {
      return "【建议】空腹血糖偏高，建议控制主食和甜食，避免含糖饮料，规律运动。多次≥7.0建议就医评估。";
    }
    if (value >= 6.1) {
      return "【建议】空腹血糖正常偏高，建议少吃精制主食和甜食，晚餐别太晚，保持规律运动。";
    }
    return "【建议】空腹血糖正常，继续保持规律饮食和运动。";
  }
  
  if (isPostMeal) {
    if (value < 3.9) {
      return "【建议】餐后血糖偏低，需警惕低血糖，建议补充糖分并观察症状。";
    }
    if (value >= 11.1) {
      return "【建议】餐后血糖偏高，建议减少甜食和精制主食，餐后适当散步。反复偏高请咨询医生。";
    }
    if (value >= 7.8) {
      return "【建议】餐后血糖正常偏高，建议控制每餐主食量，多搭配蔬菜和优质蛋白。";
    }
    return "【建议】餐后血糖正常，继续保持。";
  }
  
  // 未指定类型
  if (value < 3.9) {
    return "【建议】血糖偏低，建议及时补充含糖食物。如反复出现，建议就医检查。";
  }
  if (value >= 11.1) {
    return "【建议】血糖明显偏高，请注意饮食控制，减少甜食和含糖饮料，餐后适当运动。建议就医评估。";
  }
  if (value >= 7.0) {
    return "【建议】血糖偏高，建议区分空腹或餐后测量。下次可说\"空腹血糖X\"或\"餐后血糖X\"，方便准确评估。";
  }
  return "【建议】血糖正常，继续保持规律饮食和运动。建议明确测量时间（空腹/餐后）以便更准确评估。";
}

// ==================== 个性化健康建议 ====================

async function getPersonalizedHealthAdvice(subIntent, utterance, profile) {
  if (!profile) return "";
  
  // 只在饮食记录时提供建议
  if (subIntent !== "diet.log") return "";
  
  const chronicDiseases = profile.chronicDiseases || [];
  if (chronicDiseases.length === 0) return "";
  
  // 从用户输入中提取食物名称
  const foods = extractFoodsFromText(utterance);
  if (foods.length === 0) return "";
  
  // 生成健康建议
  const advice = generateFoodAdvice(foods, chronicDiseases);
  return advice;
}

// ==================== 记忆系统：查询增强 ====================

async function enhanceReplyWithMemory(subIntent, utterance, ai) {
  if (!memoryService) return "";

  try {
    let extraText = "";
    const days = Number.isFinite(ai?.slots?.rangeDays) ? ai.slots.rangeDays : detectRangeDays(utterance, 7);
    const rangeLabel = days === 1 ? "今天" : days === 7 ? "最近一周" : days === 30 ? "最近一个月" : `最近${days}天`;
    const hasRange = Number.isFinite(ai?.slots?.rangeDays) || /今天|今日|最近一周|近一周|这周|本周|一周|7天|七天|最近一个月|近一个月|本月|这个月|一个月|30天|三十天/.test(utterance ?? "");
    if (["medication.med_query", "health_data.bp_query", "health_data.bs_query", "exercise.query", "diet.query", "stats.query"].includes(subIntent) && !hasRange) {
      return "";
    }

    // 格式化时间显示（精确到时分）
    const formatTime = (timeStr) => {
      const date = new Date(timeStr);
      return date.toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    };

    // 个人画像查询：附加近期健康记录摘要
    if (subIntent === "chat.profile_view") {
      const summary = await memoryService.getHealthSummary(7);
      extraText =
        `\n\n近期健康记录（最近7天）：` +
        `\n- 用药 ${summary.medicationCount} 次，血压 ${summary.bpCount} 次，血糖 ${summary.sugarCount || summary.bsCount || 0} 次` +
        `\n- 运动 ${summary.exerciseCount} 次，饮食 ${summary.dietCount} 条`;
      if (summary.avgSystolic && summary.avgDiastolic) {
        extraText += `\n- 平均血压 ${summary.avgSystolic}/${summary.avgDiastolic} mmHg`;
      }
      if (summary.avgSugar) {
        extraText += `\n- 平均血糖 ${summary.avgSugar} mmol/L`;
      }
    }

    // 用药记录：返回今日用药情况
    if (subIntent === "medication.med_log") {
      const records = await memoryService.queryMedications(1);
      if (records.length > 0) {
        const recent = records.slice(-5);
        extraText =
          `\n\n今日用药情况：\n` +
          recent.map((r) => `- ${formatTime(r.time)} ${r.drugName} ${r.dose?.amount || ""}${r.dose?.unit || ""}`).join("\n");
      } else {
        extraText = `\n\n今日用药情况：暂无记录。`;
      }
    }

    // 用药查询：返回最近记录
    if (subIntent === "medication.med_query") {
      const records = await memoryService.queryMedications(days);
      if (records.length > 0) {
        const recent = records.slice(-5);
        extraText = `\n\n${rangeLabel}用药记录：\n` + recent.map(r =>
          `- ${formatTime(r.time)} ${r.drugName} ${r.dose?.amount || ''}${r.dose?.unit || ''}`
        ).join('\n');
      } else {
        extraText = `\n\n${rangeLabel}暂无用药记录。`;
      }
    }

    // 血压查询：返回最近记录和统计
    if (subIntent === "health_data.bp_query") {
      const records = await memoryService.queryBloodPressure(days);
      if (records.length > 0) {
        const recent = records.slice(-5);
        const summary = await memoryService.getHealthSummary(days);
        extraText = `\n\n${rangeLabel}血压记录：\n` + recent.map(r => {
          const status = assessBloodPressure(r.systolic, r.diastolic);
          return `- ${formatTime(r.time)} ${r.systolic}/${r.diastolic} mmHg (${status})`;
        }).join('\n');
        if (summary.avgSystolic) {
          const avgStatus = assessBloodPressure(summary.avgSystolic, summary.avgDiastolic);
          extraText += `\n\n${rangeLabel}平均：${summary.avgSystolic}/${summary.avgDiastolic} mmHg (${avgStatus})`;
        }
        // 添加建议
        if (summary.avgSystolic) {
          extraText += `\n\n${getBloodPressureAdvice(summary.avgSystolic, summary.avgDiastolic)}`;
        }
      } else {
        extraText = `\n\n${rangeLabel}暂无血压记录。`;
      }
    }

    // 血糖查询：返回最近记录和统计
    if (subIntent === "health_data.bs_query") {
      const records = await memoryService.queryBloodSugar(days);
      if (records.length > 0) {
        const recent = records.slice(-5);
        const summary = await memoryService.getHealthSummary(days);
        extraText = `\n\n${rangeLabel}血糖记录：\n` + recent.map(r => {
          const status = assessBloodSugar(r.value, r.type);
          return `- ${formatTime(r.time)} ${r.value} ${r.unit || 'mmol/L'}${r.type === 'fasting' ? ' (空腹)' : r.type === 'postprandial' ? ' (餐后)' : ''} (${status})`;
        }).join('\n');
        if (summary.avgSugar) {
          const avgStatus = assessBloodSugar(summary.avgSugar, '');
          extraText += `\n\n${rangeLabel}平均：${summary.avgSugar} mmol/L (${avgStatus})`;
        }
        // 添加建议
        if (summary.avgSugar) {
          extraText += `\n\n${getBloodSugarAdvice(summary.avgSugar, summary.sugarType || '')}`;
        }
      } else {
        extraText = `\n\n${rangeLabel}暂无血糖记录。`;
      }
    }

    // 运动查询：返回最近记录和统计
    if (subIntent === "exercise.query") {
      const records = await memoryService.queryExercises(days);
      const profile = await memoryService.loadProfile().catch(() => null);
      if (records.length > 0) {
        const recent = records.slice(-5);
        let totalMinutes = 0;
        records.forEach(r => {
          if (r.duration) {
            totalMinutes += r.durationUnit === "小时" ? r.duration * 60 : r.duration;
          }
        });
        extraText = `\n\n${rangeLabel}运动记录（共${records.length}次${totalMinutes ? `，累计约${totalMinutes}分钟` : ""}）：\n` + recent.map(r =>
          `- ${formatTime(r.time)} ${r.action || "运动"}${r.duration ? ` ${r.duration}${r.durationUnit || "分钟"}` : ""}${r.feeling ? `（${r.feeling}）` : ""}`
        ).join('\n');
        extraText += getExerciseAdviceFromRecords(records, { days, profile });
      } else {
        extraText = `\n\n${rangeLabel}暂无运动记录。\n您可以说「今天散步了30分钟」来记录运动。`;
        extraText += getExerciseAdviceFromRecords([], { days, profile });
      }
    }

    // 饮食查询：返回最近记录
    if (subIntent === "diet.query") {
      const records = await memoryService.queryDiet(days);
      const profile = await memoryService.loadProfile().catch(() => null);
      if (records.length > 0) {
        const recent = records.slice(-8);
        extraText = `\n\n${rangeLabel}饮食记录（共${records.length}条）：\n` + recent.map(r => {
          const foods = Array.isArray(r.foods) && r.foods.length > 0 ? r.foods.join("、") : (r.note || "（未记录具体食物）");
          const meal = r.meal ? `${r.meal}：` : "";
          const amount = r.amount ? `（${r.amount}）` : "";
          return `- ${formatTime(r.time)} ${meal}${foods}${amount}`;
        }).join('\n');
        extraText += getDietAdviceFromRecords(records, { days, profile });
      } else {
        extraText = `\n\n${rangeLabel}暂无饮食记录。\n您可以说「中午吃了米饭和青菜」来记录饮食。`;
        extraText += getDietAdviceFromRecords([], { days, profile });
      }
    }

    // 统计查询：返回指定时间范围摘要
    if (subIntent === "stats.query") {
      const summary = await memoryService.getHealthSummary(days);
      extraText =
        `\n\n${rangeLabel}统计摘要：` +
        `\n- 运动${summary.exerciseCount}次，饮食${summary.dietCount}条，血压${summary.bpCount}次，用药${summary.medicationCount}次`;
    }

    // 提醒查询：列出当前所有提醒
    if (subIntent === "remind.query") {
      const reminders = await memoryService.loadReminders();
      const list = reminders.reminders || [];
      if (list.length === 0) {
        extraText = "\n\n您目前没有任何提醒。要设置的话，跟我说'设置吃药提醒'或'设置测血压提醒'。";
      } else {
        const enabledList = list.filter(r => r.enabled);
        const disabledList = list.filter(r => !r.enabled);
        let lines = [];
        lines.push("\n\n好的，这是您当前所有的提醒：");
        if (enabledList.length > 0) {
          lines.push("");
          lines.push("📄 【开启中的提醒】");
          enabledList.forEach((r, i) => {
            const icon = r.type === "medication" ? "💊" : r.type === "blood_pressure" ? "🩺" : r.type === "blood_sugar" ? "🩸" : "📄";
            const name = r.drugName || (r.type === "medication" ? "（未命名）" : r.type === "blood_pressure" ? "测血压" : r.type === "blood_sugar" ? "测血糖" : "其他");
            lines.push(`${i + 1}. ${icon} ${name} - 每天 ${r.time}`);
          });
        }
        if (disabledList.length > 0) {
          lines.push("");
          lines.push("📄 【已关闭的提醒】");
          disabledList.forEach((r, i) => {
            const icon = r.type === "medication" ? "💊" : r.type === "blood_pressure" ? "🩺" : r.type === "blood_sugar" ? "🩸" : "📄";
            const name = r.drugName || (r.type === "medication" ? "（未命名）" : r.type === "blood_pressure" ? "测血压" : r.type === "blood_sugar" ? "测血糖" : "其他");
            lines.push(`${i + 1}. ${icon} ${name} - 每天 ${r.time}`);
          });
        }
        lines.push("");
        lines.push("---");
        lines.push(`共 ${list.length} 条提醒（开启 ${enabledList.length} 条，关闭 ${disabledList.length} 条）`);
        lines.push("您可以直接告诉我'关闭第5条'、'删除第3条'、'删除第1到第5条'、'删除开启中第2条'、'删除关闭中第1条'，我会帮您调整。");
        extraText = lines.join("\n");
      }
    }

    return extraText;
  } catch (error) {
    console.error("[记忆] 查询增强失败:", error);
    return "";
  }
}

// ==================== 主回复逻辑 ====================

async function assistantReply(utterance) {
  // 0) 第一层：正则快速直出
  const fast = runFastReply(utterance);
  if (fast.hit) {
    renderDebugJson({ layer1_fastReply: fast });
    return {
      text: fast.reply,
      debug: { fast },
      tags: [{ text: `直回：${fast.type}` }],
    };
  }

  // 加载用户画像和核心记忆（长期记忆）
  let profile = null;
  let memory = null;
  if (memoryService) {
    try {
      profile = await memoryService.loadProfile();
      memory = await memoryService.loadMemory();
    } catch (e) {
      console.error("[记忆] 加载用户画像/核心记忆失败:", e);
    }
  }

  // 健康咨询追问续答：用户补充血压/症状时，继续原咨询而非记录血压
  let pendingQaReply = detectPendingQaReply(utterance);
  if (!pendingQaReply) {
    pendingQaReply = detectImplicitQaFollowUp(utterance);
  }
  if (pendingQaReply) {
    const supplement = extractQaSupplement(utterance);
    const subIntent = pendingQaReply.subIntent || "health_qa.general";
    const text = await callHealthQaContinuation(pendingQaReply, supplement, { profile, memory });
    MEMORY.pending.qa = null;

    renderDebugJson({
      contextContinuation: {
        pendingQa: pendingQaReply,
        supplement,
        subIntent,
      },
    });

    return {
      text: text || "好的，我已了解您的情况。如果还有不舒服，建议及时就医并遵医嘱。",
      debug: { pendingQa: pendingQaReply, supplement, subIntent },
      tags: [{ text: `意图：${subIntent}（咨询续答）` }],
    };
  }

  // 第一层
  const first = runFirstLayer(utterance);

  // 紧急关键词：立即响应，跳过 LLM
  if (first.hit && first.intent === INTENTS.EMERGENCY) {
    const subIntent = "emergency.sos";
    const safety = { riskLevel: "URGENT", reasons: ["检测到紧急求助关键词"] };
    if (memoryService) {
      try {
        await memoryService.saveEvent({
          type: "emergency",
          description: utterance,
          riskLevel: "URGENT",
        });
      } catch (e) {
        console.warn("[记忆] 紧急事件记录失败:", e);
      }
    }
    return {
      text: generateReply({ utterance, subIntent, slots: {}, safety, profile }),
      triggerEmergency: true,
      debug: { first, ai: { intent: INTENTS.EMERGENCY, subIntent }, safety },
      tags: [{ text: "紧急求助", level: "danger" }, { text: `意图：${subIntent}` }],
      intent: INTENTS.EMERGENCY,
    };
  }

  const pendingQueryReply = detectPendingQueryReply(utterance);
  const pendingDietReply = detectPendingDietReply(utterance);

  // 记录类意图：当用户已经给了关键参数时，直接使用模板化“意图识别”（跳过LLM）
  // 只有明确的结构化数据记录和查询才跳过LLM，其他需要理解的请求都调用大模型
  const u = utterance ?? "";
  const bypassWithoutForceCheck = first.intent === "INT_MED_ADD" || first.intent === "INT_MED_MISSED";
  const isExerciseConsultQuestion =
    first.intent === "INT_EXERCISE_RECOMMEND" && /(吗|么|能不能|可以吗|行不行|好不好)/.test(u);
  const isSimpleSmalltalkBypass =
    first.intent === "INT_SMALLTALK" && isSimpleGreeting(u);
  const isProfileSmalltalkBypass = first.hit && (isProfileViewRequest(u) || isProfileUpdateRequest(u));
  const shouldBypassLLM =
    first.hit &&
    !isExerciseConsultQuestion &&
    (!shouldForceLLM(u) || bypassWithoutForceCheck || isProfileSmalltalkBypass) &&
    (first.intent === "INT_BP_ADD" ||
      first.intent === "INT_BP_QUERY" ||
      first.intent === "INT_BS_QUERY" ||
      first.intent === "INT_BS_ADD" ||
      first.intent === "INT_WEIGHT_ADD" ||
      first.intent === "INT_EXERCISE_LOG" ||
      first.intent === "INT_EXERCISE_QUERY" ||
      first.intent === "INT_EXERCISE_RECOMMEND" ||
      first.intent === "INT_DIET_LOG" ||
      first.intent === "INT_DIET_QUERY" ||
      first.intent === "INT_DIET_NUTRITION" ||
      first.intent === "INT_MED_QUERY" ||
      first.intent === "INT_MED_MISSED" ||
      first.intent === "INT_REMIND_QUERY" ||
      first.intent === "INT_STATS_QUERY" ||
      first.intent === "INT_EMERGENCY" ||
      isSimpleSmalltalkBypass ||
      isProfileSmalltalkBypass ||
      first.intent === "INT_MED_ADD");

  let ai = null;
  if (pendingDietReply) {
    const merged = mergeDietSupplement(pendingDietReply.data, utterance);
    ai = {
      intent: INTENTS.DIET_LOG,
      slots: { dietSupplement: true, mergedDiet: merged },
      confidence: 0.95,
      need_clarify: false,
      clarify_questions: [],
      llm_raw: { pendingDiet: pendingDietReply, supplement: utterance, bypassed: true },
    };
  } else if (pendingQueryReply) {
    const intentMap = {
      "health_data.bp_query": INTENTS.BP_QUERY,
      "health_data.bs_query": INTENTS.BS_QUERY,
      "medication.med_query": INTENTS.MED_QUERY,
      "exercise.query": INTENTS.EXERCISE_QUERY,
      "diet.query": INTENTS.DIET_QUERY,
      "stats.query": INTENTS.STATS_QUERY,
    };
    ai = {
      intent: intentMap[pendingQueryReply.subIntent] || INTENTS.OTHER,
      slots: { ...first.slots, rangeDays: pendingQueryReply.days, inheritedFromContext: true },
      confidence: 0.95,
      need_clarify: false,
      clarify_questions: [],
      llm_raw: { contextResolved: true, pendingQuery: pendingQueryReply },
    };
  } else if (MEMORY.pending.reminder) {
    // 有待处理的提醒上下文，直接继承意图，跳过LLM调用
    const expired = Date.now() - MEMORY.pending.reminder.at > 5 * 60 * 1000;
    
    // 如果当前请求是明确的独立意图（如查看提醒），则不继承之前的上下文
    const isIndependentIntent = first.intent === INTENTS.REMIND_QUERY ||
                               first.intent === INTENTS.BP_QUERY ||
                               first.intent === INTENTS.BS_QUERY ||
                               first.intent === INTENTS.WEIGHT_QUERY ||
                               first.intent === INTENTS.TEMP_QUERY;
    
    if (!expired && !isIndependentIntent) {
      const reminderContext = MEMORY.pending.reminder;
      ai = {
        intent: mapIntentToAiIntent(reminderContext.type),
        slots: { ...first.slots, inheritedReminderType: reminderContext.reminderType },
        confidence: 0.9,
        need_clarify: false,
        clarify_questions: [],
        llm_raw: { inheritedFromReminder: true },
      };
    } else {
      ai = await callLLM(utterance, first, { profile, memory });
    }
    MEMORY.pending.reminder = null;
  } else if (shouldBypassLLM) {
    ai = {
      intent: first.intent,
      slots: first.slots,
      confidence: 0.9,
      need_clarify: false,
      clarify_questions: [],
      llm_raw: { bypassed: true },
    };
  } else {
    // 第二层（使用真实大模型API，传入用户画像增强）
    ai = await callLLM(utterance, first, { profile, memory });
  }

  // 第三层
  const safety = runSafetyCheck(utterance, ai);

  if (shouldForceLLM(utterance) && (ai.intent === INTENTS.SMALLTALK || ai.intent === INTENTS.OTHER)) {
    ai.intent = INTENTS.QA;
  }

  let subIntent = mapToSubIntent({ aiIntent: ai.intent, utterance, slots: ai.slots });

  if (
    shouldForceLLM(utterance) &&
    ["chat.greet", "chat.smalltalk", "chat.confirm", "chat.help", "chat.care", "other.unknown"].includes(subIntent)
  ) {
    subIntent = "health_qa.general";
  }

  // 用户明确表示“已经好了/没事了”时，忽略补充追问，直接收束对话
  const recoveredRegex = /(好了|好些了|好多了|缓解了|没事了|不难受了)/;
  const isRecoveredAck = recoveredRegex.test(utterance) && /(谢谢|感谢)?/.test(utterance);

  // 输出到"识别结果面板"
  renderDebugJson({
    layer0: { fast },
    memory: {
      shortTerm: {
        pending: MEMORY.pending,
        history: MEMORY.history.slice(-10),
      },
      longTerm: {
        profile: profile ? { name: profile.name, age: profile.age, behaviorStage: profile.behaviorStage } : null,
        milestones: memory?.milestones?.slice(-3) || [],
      },
    },
    layer1: {
      policy: FIRST_LAYER.matchPolicy,
      stats: firstLayerStats(),
      result: first,
      lexiconTable: FIRST_LAYER.lexiconTable,
    },
    layer2: {
      note: "已接入真实大模型API + 长期记忆增强",
      result: { ...ai, subIntent },
    },
    layer3: {
      rules: {
        absoluteBlock: SAFETY.absoluteBlock,
        conditionalWarn: SAFETY.conditionalWarn,
        urgentMedicalKeywords: SAFETY.urgentMedicalKeywords,
        riskLevels: SAFETY.riskLevels,
      },
      result: safety,
    },
  });

  // 安全检查：BLOCK
  if (safety.riskLevel === "BLOCK") {
    const selfHarmKeywords = ["自杀", "想死", "不想活了", "结束生命", "我想死"];
    const isSelfHarm = selfHarmKeywords.some(keyword => utterance.includes(keyword));

    // 记录健康事件
    if (memoryService) {
      await memoryService.saveEvent({
        type: isSelfHarm ? "self_harm" : "block",
        description: utterance,
        riskLevel: "BLOCK",
      });
    }

    if (isSelfHarm) {
      return {
        text:
          "我很担心你现在的状态，生命是非常宝贵的。\n" +
          "如果你正在经历痛苦，请记住你不是一个人。\n" +
          "建议你立即联系专业心理辅导或拨打心理援助热线：\n" +
          "- 北京心理危机干预热线：010-82951332\n" +
          "- 全国24小时心理援助热线：400-161-9995\n" +
          "如果你愿意，也可以和我聊聊你现在的感受。",
        debug: { first, ai, safety },
        tags: [{ text: "安全：BLOCK", level: "danger" }, { text: `意图：${ai.intent}` }],
      };
    } else {
      return {
        text:
          "对不起，这个请求涉及安全/隐私/合规风险，我不能处理。\n" +
          "如果你是在求助健康问题，我可以继续帮你梳理症状并建议就医；但请不要发送验证码、银行卡号等敏感信息。",
        debug: { first, ai, safety },
        tags: [{ text: "安全：BLOCK", level: "danger" }, { text: `意图：${ai.intent}` }],
      };
    }
  }

  // 安全检查：URGENT
  if (safety.riskLevel === "URGENT") {
    // 记录紧急事件
    if (memoryService) {
      await memoryService.saveEvent({
        type: "urgent",
        description: utterance,
        riskLevel: "URGENT",
      });
    }

    return {
      text:
        "我看到你说的情况可能比较紧急。\n" +
        "如果出现胸痛、呼吸困难、说话含糊、单侧无力等，请尽快拨打急救电话或就近就医，并联系家属陪同。\n" +
        "如果你愿意，也可以把你现在最主要的不舒服再告诉我一句。",
      debug: { first, ai, safety },
      tags: [
        { text: "安全：URGENT", level: "danger" },
        { text: `意图：${ai.intent}` },
      ],
    };
  }

  if (ai.need_clarify && !isRecoveredAck) {
    rememberPendingQa(utterance, subIntent, ai.clarify_questions);
    return {
      text: ai.clarify_questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
      debug: { first, ai, safety },
      tags: [{ text: "需要补充信息" }, { text: `意图：${ai.intent}` }],
      intent: ai.intent,
      slots: ai.slots,
      llm_raw: ai.llm_raw,
    };
  }

  // 维护 pending：血压单值先记住，下一轮可补低压
  if (subIntent === "health_data.bp_log" && Number.isFinite(ai.slots?.bp_systolic) && !Number.isFinite(ai.slots?.bp_diastolic)) {
    MEMORY.pending.bp = { systolic: ai.slots.bp_systolic };
  } else if (subIntent === "health_data.bp_log" && Number.isFinite(ai.slots?.bp_systolic) && Number.isFinite(ai.slots?.bp_diastolic)) {
    MEMORY.pending.bp = null;
  }

  // 生成基础回复
  let text = "";
  const isReminderSet = ["remind.med_set", "remind.temp_set", "remind.bp_set", "remind.bs_set", "remind.checkup_set"].includes(subIntent);
  
  // 根据用户性别过滤不适用的健康问题
  const gender = profile?.gender;
  if (gender === "男" && /月经|例假|生理期/.test(utterance)) {
    text = "根据您的个人信息，您是男性，男性不会有月经哦。请问您还有其他健康问题需要咨询吗？";
  } else if (shouldUseLLMReply(subIntent, utterance)) {
    const qaSubIntent = isHealthQaSubIntent(subIntent) ? subIntent : "health_qa.general";
    text = await callHealthQaLLM(utterance, qaSubIntent, { profile, memory });
    if (!text) {
      text = generateReply({ utterance, subIntent: qaSubIntent, slots: ai.slots, safety, profile });
    }
    if (shouldRememberPendingQa(text)) {
      rememberPendingQa(utterance, qaSubIntent, []);
    }
  } else if (!text) {
    text = generateReply({ utterance, subIntent, slots: ai.slots, safety, profile });
  }

  // 用药记录：先同步保存，再展示今日用药情况
  let medLogSaved = false;
  if (subIntent === "medication.med_log") {
    const medData = extractMedicationData(ai.llm_raw, utterance);
    if (medData.drugName) {
      await saveToMemory(subIntent, ai, utterance);
      medLogSaved = true;
    }
  }
  // 提醒意图且generateReply返回null（用户已提供完整信息），不生成主回复文本
  // 实际确认消息由saveToMemory异步生成
  // 根据用户画像提供个性化健康建议
  const healthAdvice = await getPersonalizedHealthAdvice(subIntent, utterance, profile);
  if (healthAdvice) text += healthAdvice;

  const memoryExtra = await enhanceReplyWithMemory(subIntent, utterance, ai);
  if (memoryExtra) text += memoryExtra;

  if (["medication.med_query", "health_data.bp_query", "health_data.bs_query", "exercise.query", "diet.query", "stats.query", "remind.query"].includes(subIntent)) {
    const hasRange = Number.isFinite(ai?.slots?.rangeDays) || /今天|今日|最近一周|近一周|这周|本周|一周|7天|七天|最近一个月|近一个月|本月|这个月|一个月|30天|三十天/.test(utterance ?? "");
    if (hasRange) clearPendingQueryIfResolved(subIntent, utterance);
    else rememberPendingQuery(subIntent);
  } else {
    clearPendingQueryIfResolved(subIntent, utterance);
  }
  
  // 保存提醒上下文（当需要用户补充信息时）
  if (["remind.med_set", "remind.temp_set", "remind.bp_set", "remind.bs_set", "remind.checkup_set"].includes(subIntent)) {
    // 检查是否需要追问
    const replyText = generateReply({ utterance, subIntent, slots: ai.slots, safety, profile });
    if (replyText) {
      // 需要追问，保存上下文（包含提醒类型）
      let reminderType = "medication";
      if (subIntent === "remind.temp_set") reminderType = "temperature";
      else if (subIntent === "remind.bp_set") reminderType = "blood_pressure";
      else if (subIntent === "remind.bs_set") reminderType = "blood_sugar";
      else if (subIntent === "remind.checkup_set") reminderType = "checkup";
      MEMORY.pending.reminder = { type: subIntent, reminderType, at: Date.now() };
    } else {
      // 不需要追问，直接执行，清除上下文
      MEMORY.pending.reminder = null;
    }
  } else {
    // 不是提醒意图，检查是否是对提醒追问的回复
    if (MEMORY.pending.reminder) {
      const expired = Date.now() - MEMORY.pending.reminder.at > 5 * 60 * 1000;
      if (!expired) {
        // 继承上一轮的提醒意图
        subIntent = MEMORY.pending.reminder.type;
        ai.intent = mapIntentToAiIntent(subIntent);
        // 将继承的提醒类型传递给提取器
        ai.slots = ai.slots || {};
        ai.slots.inheritedReminderType = MEMORY.pending.reminder.reminderType;
      }
      MEMORY.pending.reminder = null;
    }
  }
  
  // 异步处理记忆相关操作，不阻塞响应
  setTimeout(async () => {
    try {
      if (medLogSaved) return;
      if (subIntent === "medication.med_log") {
        const medData = extractMedicationData(ai.llm_raw, utterance);
        if (!medData.drugName) return;
      }
      // ====== 长期记忆：保存数据 ======
      const savedRecord = await saveToMemory(subIntent, ai, utterance);
      
      // ====== 长期记忆：里程碑检测 ======
      if (memoryService && savedRecord) {
        try {
          const milestone = await memoryService.detectMilestone();
          if (milestone) {
            console.log("[记忆] 检测到里程碑:", milestone);
          }
        } catch (e) {
          console.error("[记忆] 里程碑检测失败:", e);
        }
      }
    } catch (error) {
      console.error("[记忆] 异步处理失败:", error);
    }
  }, 100);

  // 立即返回基础回复，不等待记忆操作
  return {
    text: text,
    debug: { first, ai: { ...ai, subIntent }, safety },
    tags: [
      { text: `意图：${subIntent}` },
      ...(safety.riskLevel === "WARN" ? [{ text: "安全：WARN" }] : []),
    ],
    intent: ai.intent,
    slots: ai.slots,
    llm_raw: ai.llm_raw,
  };
}

// ==================== 快捷按钮 ====================

function wireQuickButtons() {
  for (const btn of document.querySelectorAll("[data-quick]")) {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-quick");
      
      // 跳转到记录页面的按钮
      if (key === "health_record") {
        window.location.href = 'records.html';
        return;
      }
      
      // 跳转到子女端页面
      if (key === "child_view") {
        window.location.href = 'child.html';
        return;
      }
    });
  }
}

// ==================== 提醒确认处理 ====================

/**
 * 检测用户是否在回复用药提醒确认
 * @param {string} utterance - 用户输入
 * @returns {boolean} - 是否已处理确认
 */
async function handleReminderConfirmation(utterance) {
  const waiting = MEMORY.pending.waitingForConfirm;
  
  // 检查是否有待确认的提醒
  if (!waiting) return false;
  
  // 检查时间是否过期（超过5分钟认为过期）
  if (Date.now() - waiting.triggeredAt > 5 * 60 * 1000) {
    MEMORY.pending.waitingForConfirm = null;
    return false;
  }
  
  // 检测用户回复
  const lowerUtterance = utterance.toLowerCase().trim();
  
  // 确认已吃药
  if (/^(吃了|吃过了|已吃|吃了药|吃过药)$/.test(lowerUtterance)) {
    const { reminderId, drugName } = waiting;
    
    if (reminderService) {
      await reminderService.confirmReminder(reminderId, "done");
    }
    
    // 清除待确认状态
    MEMORY.pending.waitingForConfirm = null;
    
    appendMessage({
      role: "user",
      text: utterance,
      meta: `我 · ${nowTime()}`,
    });
    appendMessage({
      role: "assistant",
      text: `太好了！已记录您按时服用${drugName || "药物"}，继续保持 💪`,
      meta: `助手 · ${nowTime()}`,
    });
    
    return true;
  }
  
  // 确认没吃药
  if (/^(没吃|还没吃|没吃药|不吃了)$/.test(lowerUtterance)) {
    const { reminderId, drugName } = waiting;
    
    if (reminderService) {
      await reminderService.skipReminder(reminderId, "用户回复没吃");
    }
    
    // 清除待确认状态
    MEMORY.pending.waitingForConfirm = null;
    
    appendMessage({
      role: "user",
      text: utterance,
      meta: `我 · ${nowTime()}`,
    });
    appendMessage({
      role: "assistant",
      text: `理解您可能现在不方便。不过${drugName || "药物"}还是要按时服用哦，如果经常忘记，我可以帮您通知家人。`,
      meta: `助手 · ${nowTime()}`,
    });
    
    return true;
  }
  
  return false;
}

// ==================== 提醒触发处理 ====================

function onReminderTriggered(reminder) {
  const msg = reminder.message || "该做健康记录了！";
  const reminderId = reminder.reminderId;
  const isMedication = reminder.type === "medication";
  const isReschedule = reminder.isReschedule;
  const missedCount = reminder.missedCount || 0;

  // 构建提醒消息
  let displayMsg = msg;
  if (isReschedule) {
    displayMsg = `⚠️ ${msg}（这是第${missedCount + 1}次提醒）`;
  }

  appendMessage({
    role: "assistant",
    text: `⏰ ${displayMsg}`,
    meta: `提醒 · ${nowTime()}`,
    tags: [{ text: isReschedule ? "再次提醒" : "主动提醒", level: isReschedule ? "urgent" : "warn" }],
  });

  // 只有用药提醒才显示确认按钮并设置等待确认状态
  if (!isMedication) return;

  // 设置待确认状态
  MEMORY.pending.waitingForConfirm = {
    reminderId,
    drugName: reminder.drugName,
    type: reminder.type,
    triggeredAt: Date.now()
  };

  const container = document.getElementById("chat");
  if (!container) return;

  const btnRow = document.createElement("div");
  btnRow.className = "reminder-actions";
  btnRow.style.cssText = "display:flex;gap:16px;margin:16px 0 24px;padding:0 12px;justify-content:center;";

  const btnDone = document.createElement("button");
  btnDone.textContent = "✅ 吃了";
  btnDone.className = "reminder-btn-done";
  btnDone.style.cssText = "padding:24px 56px;border-radius:16px;border:none;cursor:pointer;font-size:28px;font-weight:bold;background:#2d6a4f;color:#fff;min-width:180px;min-height:80px;box-shadow:0 6px 20px rgba(45,106,79,0.4);transition:all 0.2s ease;";
  btnDone.onmouseover = () => { btnDone.style.transform = "scale(1.05)"; btnDone.style.boxShadow = "0 8px 24px rgba(45,106,79,0.5);"; };
  btnDone.onmouseout = () => { btnDone.style.transform = "scale(1)"; btnDone.style.boxShadow = "0 6px 20px rgba(45,106,79,0.4);"; };
  btnDone.onclick = async () => {
    if (reminderService) {
      await reminderService.confirmReminder(reminderId, "done");
    }
    // 清除待确认状态
    MEMORY.pending.waitingForConfirm = null;
    appendMessage({
      role: "user",
      text: "吃了",
      meta: `我 · ${nowTime()}`,
    });
    appendMessage({
      role: "assistant",
      text: `太好了！已记录您按时服用${reminder.drugName || "药物"}，继续保持 💪`,
      meta: `助手 · ${nowTime()}`,
    });
    btnRow.remove();
  };

  const btnSkip = document.createElement("button");
  btnSkip.textContent = "❌ 没吃";
  btnSkip.className = "reminder-btn-skip";
  btnSkip.style.cssText = "padding:24px 56px;border-radius:16px;border:none;cursor:pointer;font-size:28px;font-weight:bold;background:#d62828;color:#fff;min-width:180px;min-height:80px;box-shadow:0 6px 20px rgba(214,40,40,0.4);transition:all 0.2s ease;";
  btnSkip.onmouseover = () => { btnSkip.style.transform = "scale(1.05)"; btnSkip.style.boxShadow = "0 8px 24px rgba(214,40,40,0.5);"; };
  btnSkip.onmouseout = () => { btnSkip.style.transform = "scale(1)"; btnSkip.style.boxShadow = "0 6px 20px rgba(214,40,40,0.4);"; };
  btnSkip.onclick = async () => {
    console.log("[DEBUG] 没吃按钮被点击", reminderId);
    try {
      if (reminderService) {
        await reminderService.skipReminder(reminderId, "暂时不想吃");
        // 安排10分钟后再次提醒
        await reminderService.scheduleReschedule(reminderId);
      } else {
        console.log("[DEBUG] reminderService 为 null");
      }
      // 清除待确认状态
      MEMORY.pending.waitingForConfirm = null;
      appendMessage({
        role: "user",
        text: "没吃",
        meta: `我 · ${nowTime()}`,
      });
      appendMessage({
        role: "assistant",
        text: "理解您可能现在不方便。不过药物还是要按时服用哦，我会在10分钟后再次提醒您。",
        meta: `助手 · ${nowTime()}`,
      });
      btnRow.remove();
    } catch (e) {
      console.error("[ERROR] 没吃按钮点击处理失败:", e);
    }
  };

  btnRow.appendChild(btnDone);
  btnRow.appendChild(btnSkip);
  container.appendChild(btnRow);
  container.scrollTop = container.scrollHeight;
}

// ==================== 发送消息 ====================

async function sendUserMessage(text) {
  console.log("[DEBUG] sendUserMessage 被调用，输入:", text);
  const utterance = (text ?? "").trim();
  console.log("[DEBUG] 处理后的 utterance:", utterance);
  
  if (!utterance) {
    console.log("[DEBUG] 空输入，直接返回");
    return;
  }
  
  MEMORY.history.push({ role: "user", text: utterance, at: Date.now() });
  persistChatHistory();

  // 检测是否在回复用药提醒确认（优先处理）
  console.log("[DEBUG] 开始检测提醒确认...");
  const isReminderConfirm = await handleReminderConfirmation(utterance);
  console.log("[DEBUG] 提醒确认检测结果:", isReminderConfirm);
  
  if (isReminderConfirm) {
    console.log("[DEBUG] 已处理提醒确认，返回");
    return;
  }

  // 检测用户是否回复天气建议相关的肯定词（是/好的/设置）
  const affirmativeWords = ['是', '好的', '好', '设置', '行', '可以', '要', '帮我', '帮我设置'];
  const isAffirmative = affirmativeWords.some(word => utterance === word || utterance.startsWith(word + ' ') || utterance.includes(word));
  
  if (isAffirmative && reminderService) {
    // 检查最近的助手消息是否包含"散步提醒"
    const lastAssistantMsg = MEMORY.history.slice(-2).find(m => m.role === 'assistant');
    if (lastAssistantMsg && lastAssistantMsg.text.includes('散步') && lastAssistantMsg.text.includes('提醒')) {
      // 询问用户是否要创建提醒
      const wantsReminder = utterance === '是' || utterance === '好的' || utterance === '好' || 
                           utterance === '设置' || utterance === '行' || utterance === '可以' ||
                           utterance.startsWith('帮我设置') || utterance.startsWith('要');
      
      if (wantsReminder) {
        console.log("[天气] 用户确认设置散步提醒，正在创建...");
        
        // 判断天气是否适宜户外活动
        const isOutdoorSuitable = lastAssistantMsg.text.includes('户外活动') || 
                                  !lastAssistantMsg.text.includes('不建议') ||
                                  lastAssistantMsg.text.includes('适合散步');
        
        // 获取当前日期，设置17:00提醒
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const timeStr = '17:00';
        
        const reminderMessage = isOutdoorSuitable ? '傍晚散步时间到了！' : '傍晚活动时间到了，在家做些轻度运动吧！';
        
        try {
          await reminderService.addReminder({
            message: reminderMessage,
            time: timeStr,
            type: 'activity',
            date: dateStr
          });
          
          // 添加助手确认消息
          appendMessage({
            role: "assistant",
            text: `✅ 已为您设置${timeStr}的散步提醒，届时我会提醒您！`,
            meta: `助手 · ${nowTime()}`,
            tags: [{ text: "提醒已设置" }],
          });
          
          MEMORY.history.push({ role: "assistant", text: `✅ 已为您设置${timeStr}的散步提醒，届时我会提醒您！`, at: Date.now() });
          return;
        } catch (e) {
          console.error("[天气] 设置提醒失败:", e);
        }
      }
    }
  }

  appendMessage({ role: "user", text: utterance, meta: `我 · ${nowTime()}` });

  // 综合检测所有异常类型
  console.log("[DEBUG] 开始检测异常...");
  console.log("[DEBUG] alertService:", alertService);
  console.log("[DEBUG] detectAllAlerts方法:", typeof alertService.detectAllAlerts);
  
  const allAlerts = alertService.detectAllAlerts(utterance, Date.now());
  
  if (allAlerts.length > 0) {
    console.log("[告警] 检测到异常:", allAlerts);
    
    // 保存告警到存储
    allAlerts.forEach(alert => {
      try {
        alertService.saveAlert(alert);
        console.log("[告警] 告警已保存:", alert.title);
      } catch (e) {
        console.error("[告警] 保存告警失败:", e);
      }
    });
    
    // 在父母端显示告警通知
    try {
      showAlertNotification(allAlerts);
      console.log("[告警] 通知已显示");
    } catch (e) {
      console.error("[告警] 显示通知失败:", e);
    }
    
    // 同步通知子女端（通过localStorage自动同步）
    console.log("[告警] 异常已保存，子女端将自动收到通知");
  } else {
    console.log("[告警] 未检测到异常");
  }

  // 动态创建"正在思考中"消息并追加到聊天区末尾
  const chat = document.getElementById("chat");
  const thinkingEl = document.createElement("div");
  thinkingEl.className = "msg msg--assistant msg--thinking";
  thinkingEl.id = "thinkingMessage";
  thinkingEl.innerHTML = `
    <div class="msg__avatar">🤖</div>
    <div class="msg__bubble">
      <span class="thinking-dots">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </span>
      <span class="thinking-text">正在思考中...</span>
    </div>
  `;
  chat.appendChild(thinkingEl);
  chat.scrollTop = chat.scrollHeight;

  // 记录开始时间，确保思考中消息至少显示500毫秒
  const startTime = Date.now();
  
  setTimeout(async () => {
    try {
      const res = await assistantReply(utterance);

      // 增强情绪关怀回应
      let replyText = res.text;
      const emotionPrefixMap = {
        "伤心|难过|想哭|流泪": ["我理解你的感受，你不是一个人。", "听到你这么说，我心里也难受。", "你的感受我懂，想哭就哭出来吧。"],
        "害怕|恐惧|吓|慌": ["别怕，我陪着你呢。", "害怕的时候别一个人扛着。", "别担心，有我在。"],
        "焦虑|着急|心烦|烦躁": ["先别急，慢慢来。", "深呼吸，我们一起面对。", "别焦虑，一步一步来就好。"],
        "孤独|孤单|一个人|没人陪": ["你不是一个人，我一直都在。", "孤单的时候，可以跟我聊聊。", "有我陪你呢，别怕寂寞。"],
        "难受|心情不好|郁闷|低落": ["我理解你现在的心情。", "心情不好的时候，先对自己好一点。", "你不用一个人扛着，跟我说说。"]
      };
      let emotionPrefix = "";
      for (const [pattern, prefixes] of Object.entries(emotionPrefixMap)) {
        if (new RegExp(pattern).test(utterance)) {
          emotionPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];
          break;
        }
      }
      if (!emotionPrefix && (["孤独", "孤单", "心情不好", "难受", "害怕", "焦虑", "想哭", "没人陪", "睡不着", "伤心", "难过"].some(k => utterance.includes(k)))) {
        emotionPrefix = "我理解你的感受。";
      }
      if (emotionPrefix) {
        replyText = `${emotionPrefix}${replyText}`;
      }
      
      // 处理用户自我介绍，更新用户画像
      const resolvedIntent = res.intent || res.debug?.ai?.intent || null;
      const resolvedSlots = res.slots || res.debug?.ai?.slots || {};
      const resolvedLlmRaw = res.llm_raw || res.debug?.ai?.llm_raw || null;
      if (resolvedIntent === INTENTS.SMALLTALK && !isProfileViewRequest(utterance)) {
        const updates = {};
        
        // 优先从LLM响应中提取信息
        if (resolvedSlots?.name && !isGenderLabel(resolvedSlots.name)) {
          updates.name = resolvedSlots.name;
        } else if (resolvedLlmRaw?.extractedData?.name && !isGenderLabel(resolvedLlmRaw.extractedData.name)) {
          updates.name = resolvedLlmRaw.extractedData.name;
        } else {
          // 降级：从用户输入中提取（不含「我是女的」这类性别声明）
          const nameMatch = utterance.match(/(我叫|我的名字是)(\s*)([\u4e00-\u9fa5a-zA-Z]{2,})/);
          if (nameMatch && !isGenderLabel(nameMatch[3])) updates.name = nameMatch[3];
        }
        
        if (resolvedSlots && resolvedSlots.age) {
          updates.age = Number(resolvedSlots.age);
        } else if (resolvedLlmRaw && resolvedLlmRaw.extractedData && resolvedLlmRaw.extractedData.age) {
          updates.age = Number(resolvedLlmRaw.extractedData.age);
        } else {
          // 降级：从用户输入中提取（支持多种格式）
          const agePatterns = [
            /(?:我今年|今年|年龄(?:是)?|我)(\s*)(\d{1,3})(\s*)岁/,
            /(\d{1,3})(\s*)岁(?:了)?/,
            /年龄(\s*)(\d{1,3})/,
            /我(\s*)(\d{1,3})(\s*)岁/
          ];
          
          for (const pattern of agePatterns) {
            const ageMatch = utterance.match(pattern);
            if (ageMatch) {
              const ageValue = parseInt(ageMatch[ageMatch.length - 2] || ageMatch[1]);
              if (ageValue && ageValue > 0 && ageValue < 150) {
                updates.age = ageValue;
                break;
              }
            }
          }
        }
        
        // 提取性别（仅性别相关语句）
        if (/(我的性别是|性别是|我是男的|我是女的|我是男|我是女)/.test(utterance)) {
          updates.gender = /女/.test(utterance) ? "女" : "男";
        } else if (resolvedSlots?.gender) {
          updates.gender = /女/.test(resolvedSlots.gender) ? "女" : "男";
        } else if (resolvedLlmRaw?.extractedData?.gender) {
          updates.gender = /女/.test(resolvedLlmRaw.extractedData.gender) ? "女" : "男";
        }

        // 提取身高（cm）
        const heightMatch = utterance.match(/(?:身高(?:是)?)(\s*)(\d{2,3})(\s*)(?:cm|厘米)?/i);
        if (heightMatch) updates.heightCm = Number(heightMatch[2]);
        
        if (Object.keys(updates).length > 0 && memoryService) {
          if (updates.gender && isGenderLabel(updates.name)) {
            delete updates.name;
          }
          await memoryService.updateProfile(updates);
          console.log('[记忆] 用户画像已更新:', updates);
          
          // 仅在用户主动报名字时替换为欢迎语
          if (updates.name && /(我叫|我的名字是)/.test(utterance)) {
            replyText = `${updates.name}，你好！我是银发健康助手。我可以帮你记录用药、血压、血糖和体重，也可以回答你的健康问题。`;
          }
        }
      }

      // 慢性病提取（不受意图限制，任何对话都可能提到慢性病）
      if (memoryService) {
        const chronicKeywords = ['高血压', '糖尿病', '冠心病', '高血脂', '高脂血症', '心脏病', '痛风', '哮喘', '关节炎', '骨质疏松', '脑梗', '脑卒中', '帕金森', '肾病', '肝病', '胃病', '颈椎病', '腰椎病'];
        const mentionedChronics = chronicKeywords.filter(k => utterance.includes(k));
        if (mentionedChronics.length > 0) {
          try {
            const currentProfile = await memoryService.loadProfile();
            const existing = currentProfile.chronicDiseases || [];
            const merged = [...new Set([...existing, ...mentionedChronics])];
            if (merged.length > existing.length) {
              await memoryService.updateProfile({ chronicDiseases: merged });
              console.log('[记忆] 慢性病已更新:', merged);
            }
          } catch (e) {
            console.warn('[记忆] 慢性病更新失败:', e);
          }
        }
      }

      // 移除"正在思考中"消息
      const thinkingMsg = document.getElementById('thinkingMessage');
      if (thinkingMsg) {
        thinkingMsg.remove();
      }
      
      if (replyText) {
        MEMORY.history.push({ role: "assistant", text: replyText, at: Date.now() });
        persistChatHistory();
        appendMessage({
          role: "assistant",
          text: replyText,
          meta: `助手 · ${nowTime()}`,
          tags: res.tags,
        });
      }

      if (res.triggerEmergency && typeof window.showEmergencyModal === "function") {
        setTimeout(() => window.showEmergencyModal(), 300);
      }
    } catch (error) {
      console.error('处理消息时出错:', error);
      // 移除"正在思考中"消息
      const thinkingMsg = document.getElementById('thinkingMessage');
      if (thinkingMsg) {
        thinkingMsg.remove();
      }
      
      // 具体错误信息
      let errorText = "抱歉，处理你的请求时出现了错误，请稍后再试。";
      if (error.message && error.message.includes('404')) {
        errorText = "抱歉，当前服务暂时不可用，请稍后再试。";
      } else if (error.message && error.message.includes('401')) {
        errorText = "抱歉，系统认证失败，请检查API配置。";
      }
      MEMORY.history.push({ role: "assistant", text: errorText, at: Date.now() });
      persistChatHistory();
      appendMessage({
        role: "assistant",
        text: errorText,
        meta: `助手 · ${nowTime()}`,
        tags: [{ text: "错误" }],
      });
    }
  }, 220);
}

// ==================== 告警通知 ====================

function showAlertNotification(alerts) {
  const container = document.getElementById('alertContainer');
  if (!container) return;

  alerts.forEach(alert => {
    const alertElement = document.createElement('div');
    alertElement.className = `alert-item alert-${alert.severity.toLowerCase()}`;
    alertElement.innerHTML = `
      <div class="alert-item__icon">${getAlertIcon(alert.severity)}</div>
      <div class="alert-item__content">
        <div class="alert-item__header">
          <span class="alert-item__title">${alert.title}</span>
          <span class="alert-item__severity">${alertService.getSeverityText(alert.severity)}</span>
        </div>
        <div class="alert-item__message">${alert.message}</div>
      </div>
      <button class="alert-item__close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(alertElement);

    // 自动关闭（除了URGENT级别）
    if (alert.severity !== 'URGENT') {
      setTimeout(() => {
        if (alertElement.parentElement) {
          alertElement.classList.add('alert-item--fade');
          setTimeout(() => alertElement.remove(), 500);
        }
      }, 8000);
    }
  });
}

function getAlertIcon(severity) {
  switch (severity) {
    case 'URGENT': return '🚨';
    case 'BLOCK': return '⛔';
    case 'WARN': return '⚠️';
    default: return 'ℹ️';
  }
}

// ==================== 天气服务 ====================

const WEATHER_LOCATION_KEY = "weather_location";

function getStoredWeatherLocation() {
  return localStorage.getItem(WEATHER_LOCATION_KEY) || "";
}

function buildWeatherQuery() {
  const location = getStoredWeatherLocation();
  return location ? `?location=${encodeURIComponent(location)}` : "";
}

function resolveWeatherLocationByGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lon = pos.coords.longitude.toFixed(2);
        const lat = pos.coords.latitude.toFixed(2);
        resolve(`${lon},${lat}`);
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });
}

async function ensureWeatherLocation() {
  if (getStoredWeatherLocation()) return getStoredWeatherLocation();
  const coords = await resolveWeatherLocationByGeolocation();
  if (coords) {
    localStorage.setItem(WEATHER_LOCATION_KEY, coords);
    console.log("[天气] 已使用当前定位:", coords);
  }
  return coords;
}

async function fetchWeather() {
  try {
    await ensureWeatherLocation();
    const response = await fetch(`${API_BASE}/weather/current${buildWeatherQuery()}`);
    const result = await response.json();
    if (result.ok && result.data) {
      updateWeatherCard(result.data);
      checkWeatherAlerts();
      return result.data;
    }
  } catch (e) {
    console.error("[天气] 获取天气失败:", e);
  }
  return null;
}

async function checkWeatherAlerts() {
  try {
    const response = await fetch(`${API_BASE}/weather/alerts${buildWeatherQuery()}`);
    const result = await response.json();
    if (result.ok && result.data && result.data.length > 0) {
      result.data.forEach(alert => {
        alertService.showAlert({
          type: alert.type,
          title: alert.message,
          severity: alert.level === 'danger' ? 'URGENT' : 'WARN',
          data: alert
        });
      });
    }
  } catch (e) {
    console.error("[天气] 检查天气告警失败:", e);
  }
}

function updateWeatherCard(weather) {
  const card = document.getElementById('weatherCard');
  if (!card) return;

  // 设置天气图标
  const icon = document.getElementById('weatherIcon');
  const desc = weather.weather || '';
  if (desc.includes('晴')) icon.textContent = '☀️';
  else if (desc.includes('云')) icon.textContent = '☁️';
  else if (desc.includes('雨')) icon.textContent = '🌧️';
  else if (desc.includes('雪')) icon.textContent = '❄️';
  else if (desc.includes('雷')) icon.textContent = '⛈️';
  else icon.textContent = '🌤️';

  // 更新温度
  document.getElementById('weatherTemp').textContent = `${weather.temp}°C`;
  document.getElementById('weatherDesc').textContent = desc;
  document.getElementById('weatherHumidity').textContent = `${weather.humidity}%`;
  document.getElementById('weatherWind').textContent = `${weather.windDir}${weather.windScale}级`;
  const cityEl = document.getElementById('weatherCity');
  cityEl.textContent = weather.city || '当前位置';
  if (weather.source === 'simulated') {
    cityEl.title = '当前为演示天气数据，请配置和风天气 API';
  } else {
    cityEl.title = '数据来源：和风天气';
  }

  card.style.display = 'flex';
}

// 当前天气数据缓存（全局变量）
window.currentWeatherData = null;

function updateWeatherModal(weather) {
  // 更新图标
  const desc = weather.weather || '';
  let icon = '🌤️';
  if (desc.includes('晴')) icon = '☀️';
  else if (desc.includes('云')) icon = '☁️';
  else if (desc.includes('雨')) icon = '🌧️';
  else if (desc.includes('雪')) icon = '❄️';
  else if (desc.includes('雷')) icon = '⛈️';
  document.getElementById('modalWeatherIcon').textContent = icon;

  // 更新基本信息
  document.getElementById('modalWeatherCity').textContent = weather.city || '当前位置';
  document.getElementById('modalTemp').textContent = `${weather.temp}°C`;
  document.getElementById('modalDesc').textContent = desc;

  // 更新详细信息
  document.getElementById('modalFeelsLike').textContent = `${weather.feelsLike || weather.temp}°C`;
  document.getElementById('modalHumidity').textContent = `${weather.humidity}%`;
  document.getElementById('modalVisibility').textContent = `${weather.visibility || '10'}km`;
  document.getElementById('modalPressure').textContent = `${weather.pressure || '1015'}hPa`;
  document.getElementById('modalWind').textContent = `${weather.windDir}${weather.windScale}级`;
  document.getElementById('modalUV').textContent = `UV${weather.uvIndex || '3'}`;
}

async function loadWeatherAdvisory() {
  try {
    const response = await fetch(`${API_BASE}/weather/advisory${buildWeatherQuery()}`);
    const result = await response.json();
    if (result.ok && result.data) {
      const advisory = result.data;
      
      // 更新活动建议
      document.getElementById('weatherRecommendation').textContent = advisory.recommendation || '暂无活动建议';

      // 更新穿衣建议
      const clothingEl = document.getElementById('weatherClothingAdvice');
      if (clothingEl) {
        clothingEl.textContent = advisory.clothingAdvice || '暂无穿衣建议';
      }
      
      // 更新健康建议列表
      const list = document.getElementById('weatherAdvisoryList');
      if (advisory.advisories && advisory.advisories.length > 0) {
        list.innerHTML = advisory.advisories.map(item => 
          `<div class="weather-advisory-item">${item}</div>`
        ).join('');
      } else {
        list.innerHTML = '<div class="weather-advisory-item weather-advisory-item--empty">💚 今日天气整体平稳，请按时吃药、适量饮水</div>';
      }
    }
  } catch (e) {
    console.error("[天气] 获取健康建议失败:", e);
    document.getElementById('weatherAdvisoryList').innerHTML =
      '<div class="weather-advisory-item weather-advisory-item--empty">获取健康建议失败，请稍后再试</div>';
  }
}

// ==================== 启动 ====================

async function boot() {
  memoryService = new MemoryService(CURRENT_USER_ID);
  alertService.setUserId(CURRENT_USER_ID);

  // 初始化语音播报开关状态
  initTTSToggle();

  // 获取天气数据
  await fetchWeather();

  // 加载用户画像和核心记忆（容错：后端不可用时降级）
  let profile = null;
  let memory = null;
  try {
    profile = await memoryService.loadProfile();
    memory = await memoryService.loadMemory();
    console.log("[记忆] 用户画像:", profile);
    console.log("[记忆] 核心记忆:", memory);
  } catch (e) {
    console.error("[记忆] 后端连接失败，使用降级模式:", e);
    profile = { name: "", age: null, gender: "", chronicDiseases: [], behaviorStage: "新手期" };
    memory = { milestones: [], importantDecisions: [], lessons: [], deepMotivation: {} };

    appendMessage({
      role: "assistant",
      text: "⚠️ 记忆后端未连接，长期记忆功能暂不可用。\n请确认后端已启动：python backend/app.py\n\n您仍可正常对话，但记录不会持久保存。",
      meta: `系统 · ${nowTime()}`,
      tags: [{ text: "后端未连接", level: "danger" }],
    });
  }

  // 恢复历史对话
  try {
    const savedHistory = await memoryService.loadChatHistory();
    if (savedHistory && savedHistory.length > 0) {
      const recentHistory = savedHistory.slice(-50);
      recentHistory.forEach(item => {
        appendMessage({
          role: item.role,
          text: item.text,
          meta: `${item.role === 'user' ? '我' : '助手'} · ${new Date(item.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
        });
      });
      MEMORY.history = recentHistory;
      console.log(`[记忆] 已恢复 ${recentHistory.length} 条历史对话`);
    }
  } catch (e) {
    console.warn("[记忆] 恢复对话历史失败:", e);
  }

  // 欢迎语（个性化）
  let welcomeText = "";
  if (profile.name && profile.name !== "test") {
    // 如果有名字且不是默认的"test"，使用称呼
    const salutation = profile.gender === "女" ? "女士" : "先生";
    welcomeText = `${profile.name}${salutation}，你好！我是银发健康助手。\n`;
  } else {
    welcomeText = "你好！我是银发健康助手。\n";
  }
  welcomeText +=
    "我可以帮你：\n" +
    "1) 记录用药\n" +
    "2) 记录血压\n" +
    "3) 健康问答（科普）\n\n" +
    "你可以直接输入一句话告诉我你的需求。";

  // 如果有里程碑，展示最近的
  if (memory.milestones && memory.milestones.length > 0) {
    const latest = memory.milestones[memory.milestones.length - 1];
    welcomeText += `\n\n上次成就：${latest.name}（${latest.date}）`;
  }

  appendMessage({
    role: "assistant",
    text: welcomeText,
    meta: `助手 · ${nowTime()}`,
    tags: [{ text: "长期记忆已启用" }],
  });

  wireQuickButtons();

  // 启动提醒服务（容错）
  try {
    reminderService = new ReminderService(CURRENT_USER_ID);
    reminderService.start((reminder) => {
      onReminderTriggered(reminder);
    });
  } catch (e) {
    console.error("[提醒] 提醒服务启动失败:", e);
  }

  // 检查并请求通知权限
  if (reminderService && "Notification" in window && Notification.permission === "default") {
    appendMessage({
      role: "assistant",
      text: "我可以帮您设置用药提醒，到时间会主动通知您。\n如需开启浏览器通知，请点击允许。",
      meta: `助手 · ${nowTime()}`,
      tags: [{ text: "提醒服务已启动" }],
    });
  }

  const input = document.getElementById("input");
  const send = document.getElementById("send");
  const voiceBtn = document.getElementById("voiceBtn");
  const voiceStatus = document.getElementById("voiceStatus");
  const voiceTranscript = document.getElementById("voiceTranscript");
  const toggleDebug = document.getElementById("toggleDebug");
  const debugPanel = document.getElementById("debugPanel");

  // 初始化语音识别功能
  initVoiceRecognition();

  if (toggleDebug && debugPanel) {
    toggleDebug.addEventListener("click", () => {
      const nextHidden = !debugPanel.hasAttribute("hidden") ? true : false;
      if (nextHidden) debugPanel.setAttribute("hidden", "");
      else debugPanel.removeAttribute("hidden");
      toggleDebug.textContent = nextHidden ? "显示识别结果" : "隐藏识别结果";
    });
  }

  if (send) {
    send.addEventListener("click", () => {
      console.log("[DEBUG] 发送按钮被点击");
      console.log("[DEBUG] 输入框内容:", input.value);
      sendUserMessage(input.value);
      input.value = "";
    });
  } else {
    console.error("[ERROR] 发送按钮未找到！");
  }
  
  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        console.log("[DEBUG] Enter 键被按下");
        console.log("[DEBUG] 输入框内容:", input.value);
        sendUserMessage(input.value);
        input.value = "";
      }
    });
    input.focus();
  } else {
    console.error("[ERROR] 输入框未找到！");
  }

  // 初始化语音识别
  function initVoiceRecognition() {
    if (!voiceBtn) {
      console.warn("[语音] 语音按钮未找到");
      return;
    }

    // 检查浏览器是否支持语音识别
    if (!voiceService.isSupported()) {
      voiceBtn.style.display = 'none';
      console.warn("[语音] 当前浏览器不支持语音识别");
      return;
    }

    // 设置语音识别回调
    voiceService
      .onStart(() => {
        // 开始识别
        voiceBtn.classList.add('chat-input__voice-btn--listening');
        voiceBtn.querySelector('.material-icons').textContent = 'mic';
        if (voiceStatus) {
          voiceStatus.style.display = 'flex';
        }
        if (voiceTranscript) {
          voiceTranscript.textContent = '';
        }
        console.log("[语音] 开始识别");
      })
      .onListening((transcript, isFinal) => {
        // 识别中（实时显示）
        if (voiceTranscript) {
          voiceTranscript.textContent = transcript;
        }
        if (input) {
          input.value = transcript;
        }
      })
      .onResult((transcript) => {
        // 识别完成
        console.log("[语音] 识别结果:", transcript);
        if (input) {
          input.value = transcript;
          input.focus();
        }
        // 显示识别成功提示
        appendMessage({
          role: "assistant",
          text: `🎤 语音识别成功："${transcript}"`,
          meta: `助手 · ${nowTime()}`,
          tags: [{ text: "语音识别" }],
        });
      })
      .onError((errorMessage) => {
        // 识别错误
        console.error("[语音] 错误:", errorMessage);
        appendMessage({
          role: "assistant",
          text: `⚠️ ${errorMessage}`,
          meta: `助手 · ${nowTime()}`,
          tags: [{ text: "语音错误" }],
        });
      })
      .onEnd(() => {
        // 识别结束
        voiceBtn.classList.remove('chat-input__voice-btn--listening');
        voiceBtn.querySelector('.material-icons').textContent = 'mic';
        if (voiceStatus) {
          voiceStatus.style.display = 'none';
        }
        console.log("[语音] 识别结束");
      });

    // 绑定按钮点击事件
    voiceBtn.addEventListener('click', () => {
      const state = voiceService.getState();
      if (state.isListening) {
        voiceService.stop();
      } else {
        // 请求麦克风权限
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(() => {
            voiceService.start();
          })
          .catch((err) => {
            console.error("[语音] 麦克风权限被拒绝:", err);
            appendMessage({
              role: "assistant",
              text: "⚠️ 无法访问麦克风，请在浏览器设置中允许使用麦克风。",
              meta: `助手 · ${nowTime()}`,
              tags: [{ text: "权限错误" }],
            });
          });
      }
    });

    console.log("[语音] 语音识别功能已初始化");
  }
}

// 全局消息发送函数（供HTML调用）
window.sendMessage = function(text) {
  sendUserMessage(text);
};

// 全局导航函数（供HTML调用）
window.navigateTo = function(page) {
  switch (page) {
    case 'home':
      window.location.href = 'index.html';
      break;
    case 'reminders':
      window.location.href = 'reminders.html';
      break;
    case 'records':
      window.location.href = 'records.html';
      break;
    case 'messages':
      window.location.href = 'reminders.html';
      break;
    case 'profile':
      window.location.href = 'profile.html';
      break;
    case 'emergency':
      showEmergencyModal();
      break;
    case 'life':
      window.location.href = '#services';
      break;
    case 'settings':
      window.location.href = 'settings.html';
      break;
  }
};

// 紧急求助弹窗功能
window.showEmergencyModal = function() {
  document.getElementById('emergencyModal').classList.add('emergency-modal--show');
  document.body.style.overflow = 'hidden';
  loadEmergencyContacts();
};

window.hideEmergencyModal = function() {
  document.getElementById('emergencyModal').classList.remove('emergency-modal--show');
  document.body.style.overflow = '';
};

// ==================== 紧急联系人功能 ====================

// 加载紧急联系人列表
window.loadEmergencyContacts = async function() {
  const container = document.getElementById('emergencyContactsList');
  container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">加载中...</div>';
  
  try {
    const response = await fetch(`${API_BASE}/emergency/contacts/default`);
    const result = await response.json();
    
    if (!result.ok || !result.data || result.data.contacts.length === 0) {
      container.innerHTML = `
        <div class="emergency-contacts-empty">
          <span class="material-icons">person_add</span>
          <p>暂无紧急联系人</p>
          <button class="btn btn--primary" onclick="showAddContactModal()">添加联系人</button>
        </div>
      `;
      return;
    }
    
    renderEmergencyContacts(result.data.contacts);
  } catch (error) {
    console.error('加载紧急联系人失败:', error);
    container.innerHTML = `
      <div class="emergency-contacts-empty">
        <span class="material-icons">error</span>
        <p>加载失败，请稍后重试</p>
        <button class="btn btn--primary" onclick="loadEmergencyContacts()">重新加载</button>
      </div>
    `;
  }
};

// 渲染紧急联系人列表
function renderEmergencyContacts(contacts) {
  const container = document.getElementById('emergencyContactsList');
  const relationLabels = {
    'son': '儿子',
    'daughter': '女儿',
    'spouse': '配偶',
    'child': '子女',
    'grandson': '孙子/外孙',
    'granddaughter': '孙女/外孙女',
    'friend': '朋友',
    'other': '其他'
  };
  
  container.innerHTML = contacts.map(contact => `
    <div class="emergency-contact-item ${contact.isPrimary ? 'emergency-contact-item--primary' : ''}">
      ${contact.isPrimary ? '<span class="emergency-contact-item__primary-badge">主要</span>' : ''}
      <div class="emergency-contact-item__avatar">${contact.name ? contact.name.charAt(0) : '?'}</div>
      <div class="emergency-contact-item__info">
        <div class="emergency-contact-item__name">${contact.name || '未命名'}</div>
        <div class="emergency-contact-item__phone">📞 ${contact.phone || '未填写'}</div>
        <div class="emergency-contact-item__relationship">${relationLabels[contact.relationship] || contact.relationship}</div>
      </div>
      <div class="emergency-contact-item__actions">
        <button class="emergency-contact-item__call-btn" onclick="callContact('${contact.phone}', '${contact.name}')" title="拨打电话">
          <span class="material-icons">phone</span>
        </button>
        <button class="emergency-contact-item__delete-btn" onclick="deleteEmergencyContact('${contact.id}')" title="删除联系人">
          <span class="material-icons">delete</span>
        </button>
      </div>
    </div>
  `).join('');
}

// 拨打紧急联系人（主要联系人）
window.callEmergencyContact = async function() {
  try {
    const response = await fetch(`${API_BASE}/emergency/contacts/default/primary`);
    const result = await response.json();
    
    if (!result.ok || !result.data || !result.data.phone) {
      alert('暂无紧急联系人，请先添加');
      showAddContactModal();
      return;
    }
    
    callContact(result.data.phone);
  } catch (error) {
    console.error('获取主要联系人失败:', error);
    alert('获取联系人信息失败');
  }
};

// 检测是否为移动设备
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
         (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
}

// 显示拨号弹窗
function showCallModal(phone, contactName) {
  const modal = document.createElement('div');
  modal.id = 'callModal';
  modal.className = 'emergency-modal-overlay';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;
  
  modal.innerHTML = `
    <div style="
      background: white;
      border-radius: 16px;
      padding: 32px;
      max-width: 400px;
      width: 90%;
      text-align: center;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    ">
      <div style="
        width: 80px;
        height: 80px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4CAF50 0%, #45A049 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
      ">
        <span class="material-icons" style="font-size: 40px; color: white;">phone</span>
      </div>
      <h3 style="margin: 0 0 8px; color: #333; font-size: 24px;">拨打电话</h3>
      <p style="margin: 0 0 24px; color: #666; font-size: 16px;">${contactName ? '联系人：' + contactName : ''}</p>
      <div style="
        background: #f5f5f5;
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 24px;
      ">
        <div style="font-size: 28px; font-weight: bold; color: #1a73e8; letter-spacing: 2px;">${phone}</div>
      </div>
      <div style="display: flex; gap: 12px; flex-direction: column;">
        <a href="tel:${phone.replace(/\s/g, '')}" style="
          flex: 1;
          padding: 16px;
          background: linear-gradient(135deg, #4CAF50 0%, #45A049 100%);
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-size: 18px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        ">
          <span class="material-icons">phone</span>
          点击拨打
        </a>
        <button onclick="copyPhone('${phone}'); document.getElementById('callModal').remove();" style="
          flex: 1;
          padding: 16px;
          background: #f5f5f5;
          color: #333;
          border: 2px solid #ddd;
          border-radius: 8px;
          font-size: 18px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        ">
          <span class="material-icons">content_copy</span>
          复制号码
        </button>
        <button onclick="document.getElementById('callModal').remove()" style="
          padding: 12px;
          background: transparent;
          color: #666;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
        ">
          取消
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// 复制号码到剪贴板
window.copyPhone = function(phone) {
  navigator.clipboard.writeText(phone).then(() => {
    alert('号码已复制到剪贴板！');
  }).catch(() => {
    // 备用方案
    const input = document.createElement('input');
    input.value = phone;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    alert('号码已复制到剪贴板！');
  });
};

// 拨打指定号码
window.callContact = function(phone, contactName) {
  if (!phone) {
    alert('电话号码为空');
    return;
  }
  
  // 保存紧急呼叫记录
  saveEmergencyCallLog(phone);
  
  // 检测是否为移动设备
  if (isMobileDevice()) {
    // 移动设备直接调用 tel 协议
    const telUrl = `tel:${phone.replace(/\s/g, '')}`;
    window.location.href = telUrl;
  } else {
    // PC 端显示拨号弹窗
    showCallModal(phone, contactName);
  }
};

// 拨打 120
window.call120 = function() {
  saveEmergencyCallLog('120');
  
  if (isMobileDevice()) {
    window.location.href = 'tel:120';
  } else {
    showCallModal('120', '急救中心');
  }
};

// 保存紧急呼叫记录
async function saveEmergencyCallLog(phone) {
  try {
    const log = {
      phone: phone,
      type: phone === '120' ? 'emergency_call' : 'contact_call',
      timestamp: new Date().toISOString()
    };
    
    // 可以扩展保存到后端
    console.log('紧急呼叫记录:', log);
    
    // 保存到本地存储
    const logs = JSON.parse(localStorage.getItem('emergencyLogs') || '[]');
    logs.push(log);
    if (logs.length > 50) logs.shift();
    localStorage.setItem('emergencyLogs', JSON.stringify(logs));
  } catch (error) {
    console.error('保存呼叫记录失败:', error);
  }
}

// 保存位置分享记录
async function saveLocationShareLog(lat, lng, contactId) {
  try {
    const log = {
      lat,
      lng,
      contactId,
      timestamp: new Date().toISOString()
    };
    
    console.log('位置分享记录:', log);
    
    // 保存到本地存储
    const logs = JSON.parse(localStorage.getItem('locationLogs') || '[]');
    logs.push(log);
    if (logs.length > 50) logs.shift();
    localStorage.setItem('locationLogs', JSON.stringify(logs));
  } catch (error) {
    console.error('保存位置记录失败:', error);
  }
}

// 显示添加联系人弹窗
window.showAddContactModal = function() {
  const modal = document.getElementById('addContactModal');
  modal.style.display = 'block';
  setTimeout(() => modal.classList.add('emergency-modal--show'), 10);
  document.body.style.overflow = 'hidden';
  
  // 清空表单
  document.getElementById('contactName').value = '';
  document.getElementById('contactPhone').value = '';
  document.getElementById('contactRelationship').value = 'child';
  document.getElementById('contactPrimary').checked = false;
};

// 隐藏添加联系人弹窗
window.hideAddContactModal = function() {
  const modal = document.getElementById('addContactModal');
  modal.classList.remove('emergency-modal--show');
  setTimeout(() => modal.style.display = 'none', 300);
  document.body.style.overflow = '';
};

// 保存紧急联系人
window.saveEmergencyContact = async function() {
  const name = document.getElementById('contactName').value.trim();
  const phone = document.getElementById('contactPhone').value.trim();
  const relationship = document.getElementById('contactRelationship').value;
  const isPrimary = document.getElementById('contactPrimary').checked;
  
  // 验证输入
  if (!name) {
    alert('请输入联系人姓名');
    return;
  }
  
  if (!phone) {
    alert('请输入联系电话');
    return;
  }
  
  // 简单验证手机号格式
  const phoneRegex = /^1[3-9]\d{9}$/;
  if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
    alert('请输入有效的手机号码');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/emergency/contacts/default`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        phone: phone.replace(/\s/g, ''),
        relationship,
        isPrimary
      })
    });
    
    const result = await response.json();
    
    if (result.ok) {
      alert('联系人添加成功');
      hideAddContactModal();
      loadEmergencyContacts();
    } else {
      alert('添加失败，请稍后重试');
    }
  } catch (error) {
    console.error('保存联系人失败:', error);
    alert('保存失败，请稍后重试');
  }
};

// 删除紧急联系人
window.deleteEmergencyContact = async function(contactId) {
  if (!confirm('确定要删除这个联系人吗？')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/emergency/contacts/default/${contactId}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    
    if (result.ok) {
      loadEmergencyContacts();
    } else {
      alert('删除失败，请稍后重试');
    }
  } catch (error) {
    console.error('删除联系人失败:', error);
    alert('删除失败，请稍后重试');
  }
};

// 家庭成员管理功能
window.showFamilyModal = function() {
  const modal = document.getElementById('familyModal');
  modal.style.display = 'block';
  setTimeout(() => modal.classList.add('emergency-modal--show'), 10);
  document.body.style.overflow = 'hidden';
  loadFamilyMembers();
};

window.hideFamilyModal = function() {
  const modal = document.getElementById('familyModal');
  modal.classList.remove('emergency-modal--show');
  setTimeout(() => modal.style.display = 'none', 300);
  document.body.style.overflow = '';
};

// 加载家庭成员列表（从后端获取）
window.loadFamilyMembers = async function() {
  const container = document.getElementById('currentFamilyMembers');
  container.innerHTML = '<p style="color: var(--text-secondary); font-size: var(--font-base);">加载中...</p>';
  
  try {
    const response = await fetch(`${API_BASE}/family/bonds/parent/default`);
    const result = await response.json();
    
    if (!result.ok || !result.data || result.data.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary); font-size: var(--font-base);">暂无已绑定的家庭成员</p>';
      localStorage.setItem('familyContacts', JSON.stringify([]));
      return;
    }
    
    const relationLabels = {
      'son': '儿子',
      'daughter': '女儿',
      'spouse': '配偶',
      'child': '子女',
      'grandson': '孙子/外孙',
      'granddaughter': '孙女/外孙女',
      'mother': '母亲',
      'father': '父亲',
      'parents': '父母',
      'brother': '兄弟',
      'sister': '姐妹'
    };
    
    // 保存已绑定的家庭成员联系方式供紧急求助使用
    const familyContacts = result.data
      .filter(bond => bond.status === 'accepted' && bond.phone)
      .map(bond => ({
        id: bond.id,
        name: relationLabels[bond.relationship] + (bond.child_label ? `（${bond.child_label}）` : ''),
        phone: bond.phone,
        relationship: bond.relationship
      }));
    localStorage.setItem('familyContacts', JSON.stringify(familyContacts));
    
    container.innerHTML = result.data.map((bond) => {
      const relationLabel = relationLabels[bond.relationship] || bond.relationship;
      const labelDisplay = bond.child_label ? `（${bond.child_label}）` : '';
      const phoneDisplay = bond.phone ? ` 📱 ${bond.phone}` : '';
      
      // 状态显示
      let statusDisplay = '';
      let statusClass = '';
      if (bond.status === 'pending') {
        statusDisplay = '<span style="color: #FF9800; font-size: 12px;">等待接受</span>';
        statusClass = 'border-orange-300';
      } else if (bond.status === 'accepted') {
        statusDisplay = '<span style="color: #4CAF50; font-size: 12px;">已绑定</span>';
        statusClass = 'border-green-300';
      } else if (bond.status === 'rejected') {
        statusDisplay = '<span style="color: #f44336; font-size: 12px;">已拒绝</span>';
        statusClass = 'border-red-300';
      } else if (bond.status === 'revoked') {
        statusDisplay = '<span style="color: #9E9E9E; font-size: 12px;">已撤销</span>';
        statusClass = 'border-gray-300';
      }
      
      // 邀请码显示（仅待接受状态）
      const inviteCodeDisplay = bond.status === 'pending' && bond.invite_code 
        ? `<div style="margin-top: 4px; font-size: 12px; color: #666;">邀请码：<strong>${bond.invite_code}</strong></div>` 
        : '';
      
      return `
        <div style="padding: 12px; background: var(--secondary-bg); border-radius: var(--radius); border: 1px solid var(--border-color); margin-bottom: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <span style="font-size: var(--font-base); color: var(--text-primary); font-weight: 500;">${relationLabel}${labelDisplay}</span>
              ${phoneDisplay ? `<span style="font-size: var(--font-sm); color: var(--text-secondary); margin-left: 8px;">${phoneDisplay}</span>` : ''}
            </div>
            ${statusDisplay}
          </div>
          ${inviteCodeDisplay}
          ${bond.status === 'accepted' ? `
            <div style="margin-top: 8px; display: flex; gap: 8px;">
              <button onclick="openPermissions(${bond.id})" style="padding: 6px 12px; background: var(--primary-color); color: white; border: none; border-radius: 4px; font-size: var(--font-sm); cursor: pointer;">
                <span class="material-icons" style="font-size: 16px; vertical-align: middle;">settings</span>
                权限管理
              </button>
              <button onclick="revokeBond(${bond.id})" style="padding: 6px 12px; background: var(--red-color); color: white; border: none; border-radius: 4px; font-size: var(--font-sm); cursor: pointer;">
                <span class="material-icons" style="font-size: 16px; vertical-align: middle;">delete</span>
                撤销绑定
              </button>
            </div>
          ` : bond.status === 'pending' ? `
            <button onclick="copyInviteCode('${bond.invite_code}')" style="margin-top: 8px; padding: 6px 12px; background: var(--primary-color); color: white; border: none; border-radius: 4px; font-size: var(--font-sm); cursor: pointer;">
              <span class="material-icons" style="font-size: 16px; vertical-align: middle;">copy</span>
              复制邀请码
            </button>
          ` : ''}
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('加载家庭成员失败:', error);
    container.innerHTML = '<p style="color: var(--text-secondary); font-size: var(--font-base);">加载失败，请稍后重试</p>';
  }
};

// 添加家庭成员（发起绑定请求）
window.addFamilyMember = async function() {
  const relation = document.getElementById('familyRelation').value;
  const label = document.getElementById('familyLabel').value.trim();
  const phone = document.getElementById('familyPhone').value.trim();
  
  const relationLabels = {
    'son': '儿子',
    'daughter': '女儿',
    'spouse': '配偶',
    'child': '子女',
    'grandson': '孙子/外孙',
    'granddaughter': '孙女/外孙女'
  };
  
  try {
    const response = await fetch(`${API_BASE}/family/bond/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_id: 'default',
        relationship: relation,
        child_label: label || undefined,
        phone: phone || undefined
      })
    });
    
    const result = await response.json();
    
    if (result.ok) {
      // 清空输入框
      document.getElementById('familyLabel').value = '';
      document.getElementById('familyPhone').value = '';
      
      // 刷新列表
      loadFamilyMembers();
      
      // 显示成功提示（包含邀请码）
      appendMessage({
        role: "assistant",
        text: `✅ 已发起绑定请求！\n\n邀请码：${result.invite_code}\n\n请让${label || relationLabels[relation]}在子女端输入此邀请码完成绑定。`,
        meta: `助手 · ${nowTime()}`,
        tags: [{ text: "家庭成员" }]
      });
    } else {
      alert('创建绑定请求失败: ' + (result.error || '未知错误'));
    }
  } catch (error) {
    console.error('创建绑定请求失败:', error);
    alert('创建绑定请求失败，请检查网络连接');
  }
};

// 复制邀请码
window.copyInviteCode = async function(inviteCode) {
  try {
    await navigator.clipboard.writeText(inviteCode);
    appendMessage({
      role: "assistant",
      text: `✅ 邀请码已复制到剪贴板：${inviteCode}`,
      meta: `助手 · ${nowTime()}`,
      tags: [{ text: "家庭成员" }]
    });
  } catch (error) {
    alert('复制失败，请手动复制：' + inviteCode);
  }
};

// 撤销绑定
window.revokeBond = async function(bondId) {
  if (!confirm('确定要撤销此绑定关系吗？撤销后子女将无法查看您的健康数据。')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/family/bond/revoke/${bondId}`, {
      method: 'POST'
    });
    
    const result = await response.json();
    
    if (result.ok) {
      loadFamilyMembers();
      appendMessage({
        role: "assistant",
        text: `✅ 已撤销绑定关系`,
        meta: `助手 · ${nowTime()}`,
        tags: [{ text: "家庭成员" }]
      });
    } else {
      alert('撤销失败: ' + (result.error || '未知错误'));
    }
  } catch (error) {
    console.error('撤销绑定失败:', error);
    alert('撤销失败，请检查网络连接');
  }
};

// 打开权限管理
window.openPermissions = async function(bondId) {
  hideFamilyModal();
  showPermissionsModal(bondId);
};

// 权限管理弹窗
window.showPermissionsModal = async function(bondId) {
  const modal = document.getElementById('permissionsModal');
  if (!modal) {
    // 创建权限管理弹窗
    const modalHTML = `
      <div class="emergency-modal" id="permissionsModal">
        <div class="emergency-modal__overlay" onclick="hidePermissionsModal()"></div>
        <div class="emergency-modal__content" style="max-width: 480px;">
          <div class="emergency-modal__header" style="background: linear-gradient(135deg, #66BB6A 0%, #43A047 100%);">
            <span class="material-icons emergency-modal__icon">shield</span>
            <span class="emergency-modal__title">权限管理</span>
          </div>
          <div class="emergency-modal__body" id="permissionsContent" style="max-height: 50vh; overflow-y: auto;">
            <p style="color: var(--text-secondary); font-size: var(--font-base); margin-bottom: 20px;">设置子女可以访问的健康数据类型：</p>
            <div id="permissionsList"></div>
          </div>
          <div style="padding: 16px 20px; border-top: 1px solid var(--border-color);">
            <button class="emergency-option-btn" onclick="savePermissions(${bondId})" style="width: 100%;">
              <span class="material-icons">save</span>
              <span>保存设置</span>
            </button>
          </div>
          <button class="emergency-modal__close" onclick="hidePermissionsModal()">
            关闭
          </button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
  }
  
  // 加载权限设置
  await loadPermissions(bondId);
  
  const modalEl = document.getElementById('permissionsModal');
  modalEl.style.display = 'block';
  setTimeout(() => modalEl.classList.add('emergency-modal--show'), 10);
  document.body.style.overflow = 'hidden';
};

// 隐藏权限管理弹窗
window.hidePermissionsModal = function() {
  const modal = document.getElementById('permissionsModal');
  if (modal) {
    modal.classList.remove('emergency-modal--show');
    setTimeout(() => modal.remove(), 300);
  }
  document.body.style.overflow = '';
};

// 加载权限设置
window.loadPermissions = async function(bondId) {
  const container = document.getElementById('permissionsList');
  container.innerHTML = '<p style="color: var(--text-secondary);">加载中...</p>';
  
  try {
    const response = await fetch(`${API_BASE}/family/permissions/${bondId}`);
    const result = await response.json();
    
    if (!result.ok) {
      container.innerHTML = '<p style="color: var(--text-secondary);">加载失败</p>';
      return;
    }
    
    const permissions = result.data;
    const permissionItems = [
      { key: 'blood_pressure', label: '血压数据', desc: '允许查看血压记录和趋势' },
      { key: 'blood_sugar', label: '血糖数据', desc: '允许查看血糖记录和趋势' },
      { key: 'weight', label: '体重数据', desc: '允许查看体重记录和趋势' },
      { key: 'medication', label: '用药记录', desc: '允许查看用药记录和依从性' },
      { key: 'emergency', label: '紧急通知', desc: '允许接收紧急求助通知' }
    ];
    
    container.innerHTML = permissionItems.map(item => {
      const enabled = permissions[item.key] !== undefined ? permissions[item.key] : true;
      return `
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--secondary-bg); border-radius: var(--radius); margin-bottom: 12px;">
          <div>
            <p style="font-size: var(--font-base); color: var(--text-primary); font-weight: 500;">${item.label}</p>
            <p style="font-size: var(--font-sm); color: var(--text-secondary);">${item.desc}</p>
          </div>
          <label class="permission-switch">
            <input type="checkbox" ${enabled ? 'checked' : ''} onchange="togglePermission(this, '${bondId}', '${item.key}')">
            <span class="permission-slider"></span>
          </label>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('加载权限失败:', error);
    container.innerHTML = '<p style="color: var(--text-secondary);">加载失败，请稍后重试</p>';
  }
};

// 切换权限
window.togglePermission = async function(checkbox, bondId, permissionType) {
  try {
    await fetch(`${API_BASE}/family/permissions/${bondId}/${permissionType}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: checkbox.checked })
    });
  } catch (error) {
    console.error('更新权限失败:', error);
    checkbox.checked = !checkbox.checked; // 恢复状态
    alert('更新权限失败');
  }
};

// 保存权限设置
window.savePermissions = function(bondId) {
  hidePermissionsModal();
  appendMessage({
    role: "assistant",
    text: `✅ 权限设置已保存`,
    meta: `助手 · ${nowTime()}`,
    tags: [{ text: "权限管理" }]
  });
};

// 拨打紧急联系人
window.callEmergencyContact = function() {
  // 优先从家庭成员中获取紧急联系人
  const familyContacts = JSON.parse(localStorage.getItem('familyContacts') || '[]');
  
  // 如果有绑定的子女，优先使用第一个子女的电话
  if (familyContacts.length > 0 && familyContacts[0].phone) {
    const phone = familyContacts[0].phone.replace(/\s/g, '');
    makePhoneCall(phone, familyContacts[0].name);
  } else {
    // 否则使用手动设置的紧急联系人
    const emergencyContact = localStorage.getItem('emergencyContact') || '13800138000';
    const emergencyContactName = localStorage.getItem('emergencyContactName') || '紧急联系人';
    makePhoneCall(emergencyContact, emergencyContactName);
  }
  hideEmergencyModal();
};

// 实际拨打电话
function makePhoneCall(phone, name) {
  // 移除所有非数字字符
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  
  if (!cleanPhone) {
    alert('紧急联系人电话号码未设置！\n\n请先在个人中心设置紧急联系人。');
    return;
  }
  
  // 使用 tel: 协议拨打电话
  const telUrl = `tel:${cleanPhone}`;
  
  // 创建一个隐藏的链接并点击
  const link = document.createElement('a');
  link.href = telUrl;
  link.style.display = 'none';
  document.body.appendChild(link);
  
  // 添加确认对话框
  if (confirm(`确定要拨打紧急联系人 ${name || '联系人'} 的电话吗？\n\n电话号码：${phone}`)) {
    link.click();
  }
  
  document.body.removeChild(link);
}

// 天气详情弹窗功能
window.showWeatherDetail = async function() {
  const modal = document.getElementById('weatherModal');
  if (!modal) return;

  // 如果没有缓存的天气数据，先获取
  if (!window.currentWeatherData) {
    window.currentWeatherData = await window.fetchWeather();
  }

  if (window.currentWeatherData) {
    window.updateWeatherModal(window.currentWeatherData);
    await window.loadWeatherAdvisory();
  }

  modal.style.display = 'flex';
};

// 暴露辅助函数到全局作用域
window.fetchWeather = fetchWeather;
window.updateWeatherModal = updateWeatherModal;
window.loadWeatherAdvisory = loadWeatherAdvisory;

window.hideWeatherModal = function() {
  const modal = document.getElementById('weatherModal');
  if (modal) {
    modal.style.display = 'none';
  }
};

// 应用字体大小设置
applyFontSize();

// 确保 DOM 完全加载后再启动应用
document.addEventListener('DOMContentLoaded', () => {
  boot();
});

// ==================== 页面可见性变化处理 ====================

// 当页面隐藏时停止语音播报
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    ttsService.stop();
  }
});

// 页面卸载时停止语音播报
window.addEventListener('beforeunload', () => {
  ttsService.stop();
});

window.addEventListener('pagehide', () => {
  ttsService.stop();
});
