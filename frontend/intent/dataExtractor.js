/**
 * 记忆系统 - 数据提取器
 * 
 * 负责从用户输入和大模型返回结果中提取结构化数据
 * 优先使用大模型 extractedData，降级使用正则提取
 */

const DRUG_NAMES = [
  "阿司匹林", "布洛芬", "阿莫西林", "头孢", "罗红霉素", "二甲双胍", "硝苯地平", "氨氯地平", "缬沙坦",
  "降压药", "降糖药", "感冒药", "止痛药", "消炎药", "中药",
  "胰岛素", "格列美脲", "卡托普利", "氯沙坦", "美托洛尔",
];

/**
 * 从大模型结果和用户输入中提取用药记录数据
 * @param {object} aiResult - 大模型返回结果
 * @param {string} utterance - 用户原始输入
 * @returns {object} 提取的用药数据
 */
export function extractMedicationData(aiResult, utterance) {
  // 优先使用大模型提取的数据
  if (aiResult?.extractedData && Object.keys(aiResult.extractedData).length > 0) {
    const ed = aiResult.extractedData;
    return {
      drugName: ed.drugName || ed.drug || "",
      dose: ed.dose || (ed.amount ? { amount: ed.amount, unit: ed.unit || "片" } : { amount: null, unit: "" }),
      time: ed.time?.iso || ed.time?.raw || new Date().toISOString(),
      person: ed.person || "self",
      notes: ed.notes || "",
      source: "llm",
    };
  }

  // 降级：正则提取
  return extractMedicationByRegex(utterance);
}

/**
 * 正则提取用药数据
 */
function extractMedicationByRegex(utterance) {
  const u = utterance ?? "";

  // 提取药名
  let drugName = "";
  for (const drug of DRUG_NAMES) {
    if (u.includes(drug)) {
      drugName = drug;
      break;
    }
  }

  // 提取剂量
  let dose = { amount: null, unit: "" };
  const doseMatch = u.match(/(\d+(?:\.\d+)?)\s*(片|粒|包|颗|滴|ml|毫升|mg|毫克)/);
  if (doseMatch) {
    dose = { amount: Number(doseMatch[1]), unit: doseMatch[2] };
  } else {
    // 支持中文剂量：一片/半片/两粒
    const chineseMatch = u.match(/(半)?\s*(一|二|两|三|四|五|六|七|八|九|十)\s*(片|粒|包|颗)/);
    if (chineseMatch) {
      const isHalf = Boolean(chineseMatch[1]);
      const map = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
      const digit = isHalf ? 0.5 : map[chineseMatch[2]];
      if (digit !== undefined) dose = { amount: digit, unit: chineseMatch[3] };
    } else {
      // 十一片等：十X片
      const tenPlusMatch = u.match(/十([一二三四五六七八九])\s*(片|粒|包|颗)/);
      if (tenPlusMatch) {
        const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
        const tail = map[tenPlusMatch[1]];
        if (tail !== undefined) dose = { amount: 10 + tail, unit: tenPlusMatch[2] };
      }
    }
  }

  // 提取时间
  const time = extractTimeFromText(u);

  return {
    drugName,
    dose,
    time: time || new Date().toISOString(),
    person: "self",
    notes: "",
    source: "regex",
  };
}

/**
 * 从大模型结果和用户输入中提取血压数据
 * @param {object} aiResult - 大模型返回结果
 * @param {string} utterance - 用户原始输入
 * @returns {object} 提取的血压数据
 */
export function extractBloodPressureData(aiResult, utterance) {
  // 优先使用大模型提取的数据
  if (aiResult?.extractedData && Object.keys(aiResult.extractedData).length > 0) {
    const ed = aiResult.extractedData;
    return {
      systolic: ed.systolic ?? ed.bp_systolic ?? null,
      diastolic: ed.diastolic ?? ed.bp_diastolic ?? null,
      unit: ed.unit || "mmHg",
      time: ed.time?.iso || ed.time?.raw || new Date().toISOString(),
      measurementContext: ed.measurementContext || "",
      source: "llm",
    };
  }

  // 降级：正则提取
  return extractBloodPressureByRegex(utterance);
}

/**
 * 正则提取血压数据
 */
function extractBloodPressureByRegex(utterance) {
  const u = utterance ?? "";
  let systolic = null;
  let diastolic = null;

  // 匹配 "血压 145/92" 或 "145/92"
  const fullMatch = u.match(/(\d{2,3})\s*(?:\/|\\|到|-)\s*(\d{2,3})/);
  if (fullMatch) {
    systolic = Number(fullMatch[1]);
    diastolic = Number(fullMatch[2]);
  } else {
    // 只有一个数字
    const singleMatch = u.match(/血压[^0-9]*?(\d{2,3})/);
    if (singleMatch) {
      systolic = Number(singleMatch[1]);
    }
  }

  return {
    systolic,
    diastolic,
    unit: "mmHg",
    time: new Date().toISOString(),
    measurementContext: "",
    source: "regex",
  };
}

/**
 * 从大模型结果和用户输入中提取血糖数据
 */
export function extractBloodSugarData(aiResult, utterance) {
  if (aiResult?.extractedData && Object.keys(aiResult.extractedData).length > 0) {
    const ed = aiResult.extractedData;
    return {
      value: ed.value ?? ed.sugarValue ?? null,
      unit: ed.unit || "mmol/L",
      type: ed.type || (ed.isFasting ? "fasting" : ""),
      time: ed.time?.iso || ed.time?.raw || new Date().toISOString(),
      source: "llm",
    };
  }

  // 正则降级
  const u = utterance ?? "";
  let value = null;
  let type = "";

  const valMatch = u.match(/(\d+\.?\d*)\s*(mmol|毫摩)/);
  if (valMatch) value = Number(valMatch[1]);
  if (!valMatch) {
    const valMatch2 = u.match(/(\d+\.?\d*)/);
    if (valMatch2 && /血糖|空腹|餐后/.test(u)) value = Number(valMatch2[1]);
  }

  if (/空腹/.test(u)) type = "fasting";
  if (/餐后/.test(u)) type = "postprandial";

  return {
    value,
    unit: "mmol/L",
    type,
    time: new Date().toISOString(),
    source: "regex",
  };
}

/**
 * 从大模型结果和用户输入中提取体重数据
 */
export function extractWeightData(aiResult, utterance) {
  if (aiResult?.extractedData && Object.keys(aiResult.extractedData).length > 0) {
    const ed = aiResult.extractedData;
    return {
      value: ed.value ?? ed.weight ?? null,
      unit: ed.unit || "kg",
      time: ed.time?.iso || ed.time?.raw || new Date().toISOString(),
      source: "llm",
    };
  }

  // 正则降级
  const u = utterance ?? "";
  let value = null;

  const kgMatch = u.match(/(\d+\.?\d*)\s*(?:公斤|kg|千克)/i);
  if (kgMatch) {
    value = Number(kgMatch[1]);
  } else {
    const jinMatch = u.match(/(\d+\.?\d*)\s*(?<![公千])斤/);
    if (jinMatch) {
      value = Math.round(Number(jinMatch[1]) / 2);
    }
  }

  return {
    value,
    unit: "kg",
    time: new Date().toISOString(),
    source: "regex",
  };
}

/**
 * 从文本中提取时间信息
 */
function extractTimeFromText(text) {
  const u = text ?? "";
  const now = new Date();

  // 今天/昨天
  if (/今天/.test(u)) {
    return now.toISOString();
  }
  if (/昨天/.test(u)) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d.toISOString();
  }

  // 早上/上午/中午/下午/晚上
  let hours = 12;
  if (/早上|上午/.test(u)) hours = 8;
  else if (/中午/.test(u)) hours = 12;
  else if (/下午/.test(u)) hours = 15;
  else if (/晚上|夜里/.test(u)) hours = 20;

  // 具体时间 "8点" "8:30"
  const timeMatch = u.match(/(\d{1,2})[点:：](\d{1,2})?/);
  if (timeMatch) {
    hours = Number(timeMatch[1]);
    const minutes = timeMatch[2] ? Number(timeMatch[2]) : 0;
    now.setHours(hours, minutes, 0, 0);
    return now.toISOString();
  }

  return now.toISOString();
}

/**
 * 从用户输入中提取情绪数据
 */
export function extractEmotionData(utterance) {
  const u = utterance ?? "";
  const emotionMap = {
    lonely: ["孤独", "孤单", "一个人在家", "一个人", "没人陪"],
    anxious: ["焦虑", "害怕", "担心", "紧张"],
    sad: ["难受", "心情不好", "想哭", "不开心", "郁闷"],
    bored: ["无聊", "很闷", "闷得慌"],
    insomniac: ["睡不着", "失眠", "整夜"],
  };

  for (const [type, keywords] of Object.entries(emotionMap)) {
    if (keywords.some(kw => u.includes(kw))) {
      return { type, text: u, time: new Date().toISOString() };
    }
  }

  return null;
}

/**
 * 从大模型结果中提取提醒数据
 */
/**
 * 将中文数字转换为阿拉伯数字（支持：十、十五、三十、两、半）
 */
export function chineseToNumber(chinese) {
  if (chinese == null || chinese === "") return 0;
  const s = String(chinese).trim();
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if (s === "半") return 0.5;

  const map = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (map[s.slice(1)] ?? 0);
  if (s.endsWith("十")) return (map[s[0]] ?? 0) * 10;
  if (s.includes("十")) {
    const [head, tail] = s.split("十");
    return (head ? (map[head] ?? Number(head)) : 1) * 10 + (tail ? (map[tail] ?? Number(tail)) : 0);
  }
  return map[s] ?? (parseInt(s, 10) || 0);
}

/**
 * 从文本中解析运动时长（支持阿拉伯数字和中文数字）
 */
export function parseDurationFromText(text) {
  const u = text ?? "";
  let m = u.match(/(\d+(?:\.\d+)?)\s*(分钟|分|小时|hrs?|h)/i);
  if (m) {
    return {
      duration: Number(m[1]),
      durationUnit: /小时|hrs?|h/i.test(m[2]) ? "小时" : "分钟",
    };
  }
  m = u.match(/(半|[零一二两三四五六七八九十百\d]+)\s*(?:个)?\s*(分钟|分|小时|钟头)/);
  if (m) {
    if (m[1] === "半" && /分钟|分/.test(m[2])) return { duration: 30, durationUnit: "分钟" };
    const val = chineseToNumber(m[1]);
    return {
      duration: val,
      durationUnit: /小时|钟头/.test(m[2]) ? "小时" : "分钟",
    };
  }
  return { duration: null, durationUnit: "分钟" };
}

export function extractReminderData(aiResult, utterance, slots = {}) {
  const u = utterance ?? "";

  let type = slots?.inheritedReminderType || "medication";
  if (/血压/.test(u)) type = "blood_pressure";
  if (/血糖/.test(u)) type = "blood_sugar";
  if (/体检/.test(u)) type = "checkup";
  if (/体温|量体温/.test(u)) type = "temperature";

  let time = null;
  let delayMinutes = null;
  let drugName = "";
  let dosage = "";
  let frequency = "once";

  // 优先使用LLM提取的数据
  if (aiResult?.extractedData && Object.keys(aiResult.extractedData).length > 0) {
    const ed = aiResult.extractedData;
    drugName = ed.med_name || ed.drugName || ed.drug || "";
    dosage = ed.dosage || ed.dose || "";
    if (ed.time) {
      if (typeof ed.time === 'string') {
        const parsed = parseTimeFromString(ed.time);
        if (parsed) time = parsed;
      } else if (ed.time.iso) {
        const d = new Date(ed.time.iso);
        time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      } else if (ed.time.raw) {
        const parsed = parseTimeFromString(ed.time.raw);
        if (parsed) time = parsed;
      }
    }
    if (ed.frequency) frequency = ed.frequency;
  }

  // 时间提取：正则从utterance补充
  if (!time) {
    const relativeMatch = u.match(/([零一二两三四五六七八九十\d]+)\s*分钟后/);
    if (relativeMatch) {
      delayMinutes = chineseToNumber(relativeMatch[1]);
      if (delayMinutes > 0) {
        const now = new Date();
        now.setMinutes(now.getMinutes() + delayMinutes);
        time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      }
    } else {
      time = parseTimeFromString(u);
    }
  }

  // 药名：LLM已有则用，否则正则
  if (!drugName) {
    for (const drug of DRUG_NAMES) {
      if (u.includes(drug)) {
        drugName = drug;
        break;
      }
    }
    if (!drugName && type === "medication") {
      const fallbackMatch = u.match(/([\u4e00-\u9fa5a-zA-Z]{2,6})\s*(每天|早上|上午|中午|下午|晚上|凌晨|深夜|傍晚|\d)/);
      if (fallbackMatch) {
        drugName = fallbackMatch[1];
      }
    }
  }

  // 频率检测
  if (/每天|每日/.test(u)) frequency = "daily";
  if (/每周|周一|周二|周三|周四|周五|周六|周日|星期/.test(u)) frequency = "weekly";

  if (!time && !delayMinutes) {
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  }

  return {
    type,
    drugName,
    time,
    delayMinutes,
    frequency,
    dosage,
    message: "",
  };
}

function parseTimeFromString(text) {
  const u = text ?? "";

  // 中文数字映射
  const cnNumMap = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12 };
  const cnHourMatch = u.match(/(上午|下午|晚上|傍晚|凌晨|深夜|中午|早上)?\s*([零一二两三四五六七八九十十一十二\d]{1,3})[点时：:](半|([零一二两三四五六七八九十\d]*)分?)?/);
  if (cnHourMatch) {
    let hour;
    const hourStr = cnHourMatch[2];
    if (/^\d+$/.test(hourStr)) {
      hour = parseInt(hourStr);
    } else {
      hour = cnNumMap[hourStr] ?? parseInt(hourStr);
    }
    if (hour == null || isNaN(hour)) return null;

    const period = cnHourMatch[1] || "";
    if ((period === "下午" || period === "晚上" || period === "傍晚" || period === "深夜" || period === "中午") && hour < 12) {
      hour += 12;
    }

    let minute = 0;
    if (cnHourMatch[3] === '半') {
      minute = 30;
    } else if (cnHourMatch[4]) {
      const minStr = cnHourMatch[4];
      if (/^\d+$/.test(minStr)) {
        minute = parseInt(minStr);
      } else {
        minute = cnNumMap[minStr] ?? 0;
      }
    }

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  // 纯数字时间 "18:00" "6:30"
  const timeMatch = u.match(/(\d{1,2})[：:](\d{1,2})/);
  if (timeMatch) {
    return `${String(parseInt(timeMatch[1])).padStart(2, "0")}:${String(parseInt(timeMatch[2])).padStart(2, "0")}`;
  }

  // 时段匹配（无具体时间）
  if (/早上|上午/.test(u)) return "08:00";
  if (/中午/.test(u)) return "12:00";
  if (/下午/.test(u)) return "15:00";
  if (/晚上|夜里/.test(u)) return "18:00";

  return null;
}

/**
 * 从大模型结果和用户输入中提取运动记录
 */
const EXERCISE_ACTIONS = [
  "散步", "跑步", "快走", "慢走", "游泳", "太极", "太极拳", "瑜伽", "广场舞",
  "骑车", "骑自行车", "骑行", "爬山", "跳绳", "打球", "羽毛球", "乒乓球",
  "八段锦", "健身操", "拉伸", "慢跑", "快跑", "锻炼", "运动",
];

export function extractExerciseData(aiResult, utterance) {
  if (aiResult?.extractedData && Object.keys(aiResult.extractedData).length > 0) {
    const ed = aiResult.extractedData;
    return {
      action: ed.action || ed.exercise || ed.type || "",
      duration: Number.isFinite(ed.duration) ? ed.duration : (ed.duration ? Number(ed.duration) : null),
      durationUnit: ed.durationUnit || ed.unit || "分钟",
      intensity: ed.intensity || "",
      feeling: ed.feeling || "",
      time: ed.time?.iso || ed.time?.raw || extractTimeFromText(utterance),
      source: "llm",
    };
  }

  const u = utterance ?? "";
  let action = "";
  for (const a of EXERCISE_ACTIONS) {
    if (a !== "运动" && a !== "锻炼" && u.includes(a)) {
      action = a;
      break;
    }
  }
  if (!action) {
    const actionMatch = u.match(/(散步|跑步|快走|慢走|游泳|太极|瑜伽|广场舞|骑车|骑自行车|八段锦|跳绳|打球)/);
    action = actionMatch ? actionMatch[1] : (/锻炼|运动/.test(u) ? "锻炼" : "");
  }

  const durationParsed = parseDurationFromText(u);
  let duration = durationParsed.duration;
  let durationUnit = durationParsed.durationUnit;

  return {
    action,
    duration,
    durationUnit,
    intensity: /剧烈|高强度/.test(u) ? "高" : /慢走|轻松|温和/.test(u) ? "低" : "",
    feeling: /舒服|轻松|还好/.test(u) ? "轻松" : /累|疲惫|吃力|喘/.test(u) ? "疲惫" : "",
    time: extractTimeFromText(u),
    source: "regex",
  };
}

/**
 * 从文本中提取食物名称（正则降级）
 */
function extractFoodsByRegex(text) {
  const u = text ?? "";
  const knownFoods = [
    "油条", "奶油蛋糕", "肥肉", "咸菜", "腊肉", "火腿", "方便面", "卤味", "咸鱼", "薯片", "炸鸡", "烧烤",
    "糖果", "巧克力", "奶茶", "蜂蜜", "荔枝", "芒果", "西瓜", "白米饭", "白面包", "米饭", "面条", "馒头",
    "鸡蛋", "牛奶", "青菜", "菠菜", "芹菜", "西兰花", "苹果", "香蕉", "柚子", "草莓", "粥", "饺子", "包子",
    "鱼", "虾", "鸡胸肉", "豆腐", "豆浆", "燕麦", "糙米", "玉米", "红薯", "土豆", "番茄", "黄瓜", "胡萝卜",
    "猪肉", "牛肉", "鸡肉", "鸭肉", "排骨", "馄饨", "烧饼", "面包", "蛋糕", "水果", "蔬菜", "沙拉",
  ];
  const found = [];
  for (const f of knownFoods) {
    if (u.includes(f)) found.push(f);
  }
  if (found.length > 0) return found;

  // 从「吃了X和Y」中提取
  const ateMatch = u.match(/(?:刚刚|刚才|刚|今天)?(?:吃了|喝了|摄入了?)[了]?([^，。！？?；;]+)/);
  if (ateMatch) {
    const segment = ateMatch[1]
      .replace(/(今天|昨天|早上|中午|晚上|一点|一些|大概|大约)/g, "")
      .trim();
    const parts = segment.split(/[和与及、,，]+/).map(s => s.trim()).filter(Boolean);
    const cleaned = parts
      .map(p => p.replace(/^(一个|两个|一碗|两碗|三碗|一份|半份|一点|一些|大概|大约)/, "").trim())
      .filter(p => p.length >= 1 && p.length <= 8 && !/^(了|的|吧|呢|吗)$/.test(p));
    if (cleaned.length > 0) return cleaned;
  }

  // 「吃了一碗焖面」兜底
  const portionMatch = u.match(/(?:吃了|喝了)[了]?(?:一|两|三|四|半)?(?:碗|份|个|盘|杯|块|根|片|条)?([\u4e00-\u9fa5]{2,6})/);
  if (portionMatch) {
    const food = portionMatch[1];
    if (!/^(刚刚|刚才|今天|早上|中午|晚上)$/.test(food)) return [food];
  }

  return [];
}

/**
 * 从大模型结果和用户输入中提取饮食记录
 */
export function extractDietData(aiResult, utterance) {
  if (aiResult?.extractedData && Object.keys(aiResult.extractedData).length > 0) {
    const ed = aiResult.extractedData;
    const foods = ed.foods || (ed.food ? (Array.isArray(ed.food) ? ed.food : [ed.food]) : []);
    return {
      foods: Array.isArray(foods) ? foods : [foods].filter(Boolean),
      meal: ed.meal || "",
      amount: ed.amount || "",
      calories: Number.isFinite(ed.calories) ? ed.calories : null,
      note: ed.note || "",
      time: ed.time?.iso || ed.time?.raw || extractTimeFromText(utterance),
      source: "llm",
    };
  }

  const u = utterance ?? "";
  const mealMatch = u.match(/(早餐|午餐|晚餐|早饭|中饭|晚饭|早上|中午|晚上|上午|下午)/);
  let meal = mealMatch ? mealMatch[1] : "";
  if (/早上|早饭|上午/.test(u)) meal = "早餐";
  else if (/中午|中饭/.test(u)) meal = "午餐";
  else if (/晚上|晚饭|下午/.test(u)) meal = "晚餐";

  const foods = extractFoodsByRegex(u);
  const amountMatch = u.match(/(一碗|两碗|两个|三个|一份|半份|大份|小份|一个)/);

  return {
    foods,
    meal,
    amount: amountMatch ? amountMatch[1] : (/一碗|一份|一个|两碗/.test(u) ? (u.match(/(一碗|两碗|两个|三个|一份|半份|大份|小份|一个)/)?.[1] || "") : ""),
    calories: null,
    note: "",
    time: extractTimeFromText(u),
    source: "regex",
  };
}

/**
 * 合并饮食记录的补充信息（餐次、饱感等）
 */
export function mergeDietSupplement(baseData, supplement) {
  const data = { ...baseData };
  const u = supplement ?? "";
  if (/早餐|早饭|早上/.test(u)) data.meal = "早餐";
  else if (/午餐|中饭|中午/.test(u)) data.meal = "午餐";
  else if (/晚餐|晚饭|晚上/.test(u)) data.meal = "晚餐";
  const fullness = u.match(/([五六七八九十\d]+|半)分饱|全饱|吃饱了|七分饱|八分饱/);
  if (fullness) data.note = fullness[0];
  return data;
}
