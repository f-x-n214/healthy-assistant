/**
 * 第二层（AI识别）回复逻辑：按“意图分类表”的子意图输出模板
 * 说明：这里做的是“可运行的模板化回复”，不依赖大模型。
 */

const DRUGS = ["降压药", "降糖药", "布洛芬", "阿司匹林", "二甲双胍", "硝苯地平", "氨氯地平", "缬沙坦"];

function pickFirstMatch(text, list) {
  for (const w of list) if (text.includes(w)) return w;
  return "";
}

function extractTimeHint(text) {
  const m = text.match(/(早上|上午|中午|下午|晚上|夜里|刚才|现在|今天|昨天|(\d{1,2})点(\d{1,2})?分?)/);
  return m ? m[0] : "";
}

function parseChineseNumber(q) {
  const map = {
    半: 0.5,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return map[q] ?? null;
}

function parseMedicationDoseFromText(text) {
  const u = text ?? "";

  // 数字：1片 / 1 粒 / 1.5片
  const digitMatch = u.match(/(\d+(?:\.\d+)?)\s*(片|粒|包|颗|滴|ml|毫升|mg|毫克)/);
  if (digitMatch) {
    return { amount: Number(digitMatch[1]), unit: digitMatch[2] };
  }

  // 半片 / 一片 / 两粒
  const chineseMatch = u.match(/(半)?\s*(一|二|两|三|四|五|六|七|八|九|十)\s*(片|粒|包|颗)/);
  if (chineseMatch) {
    const isHalf = Boolean(chineseMatch[1]);
    const digit = isHalf ? 0.5 : parseChineseNumber(chineseMatch[2]);
    if (digit !== null) return { amount: digit, unit: chineseMatch[3] };
  }

  // 十一片（常见但你当前场景主要是一片）
  const tenPlusMatch = u.match(/十([一二三四五六七八九])\s*(片|粒|包|颗)/);
  if (tenPlusMatch) {
    const tail = parseChineseNumber(tenPlusMatch[1]);
    if (tail !== null) return { amount: 10 + tail, unit: tenPlusMatch[2] };
  }

  return null;
}

function bpAssessment(s, d) {
  if (!Number.isFinite(s) || !Number.isFinite(d)) {
    return {
      status: "暂时无法完整判断",
      level: "unknown",
      advice: "本次只记录到部分血压值。建议下次同时记录高压和低压，例如 130/80。",
    };
  }

  if (s >= 180 || d >= 120) {
    return {
      status: "明显升高，需要警惕",
      level: "danger",
      advice:
        "请先坐下休息，避免走动和情绪激动，5-10分钟后复测一次。" +
        "\n如果复测仍然很高，或伴有胸痛、胸闷、呼吸困难、剧烈头痛、说话不清、一侧肢体无力，请立即拨打急救电话或就近急诊。" +
        "\n不要自行加量服用降压药，按医生方案处理。",
    };
  }

  if (s >= 140 || d >= 90) {
    return {
      status: "偏高",
      level: "high",
      advice:
        "建议先安静休息10-15分钟，再测一次，并记录两次结果。" +
        "\n今天饮食尽量清淡，少盐，少吃咸菜、腊肉、火腿、方便面、卤味等高盐食物。" +
        "\n避免饮酒、浓茶、咖啡和剧烈运动，保持情绪平稳，今晚尽量早睡。" +
        "\n如果连续几天都偏高，建议带记录咨询医生，评估是否需要调整治疗方案。",
    };
  }

  if (s < 90 || d < 60) {
    return {
      status: "偏低",
      level: "low",
      advice:
        "建议先坐下或平躺休息，起身动作放慢，适量喝温水。" +
        "\n如果有头晕、乏力、出冷汗、眼前发黑等情况，不要独自外出或洗澡。" +
        "\n若反复偏低，或正在服用降压药，请咨询医生是否需要调整用药。",
    };
  }

  if (s >= 130 || d >= 80) {
    return {
      status: "正常偏高",
      level: "borderline",
      advice:
        "目前不算严重，但需要继续观察。" +
        "\n建议少盐少油，多吃蔬菜，控制体重，每周保持规律轻中度运动。" +
        "\n如果经常达到130/80以上，建议固定早晚测量并观察趋势。",
    };
  }

  return {
    status: "正常范围",
    level: "normal",
    advice: "继续保持规律作息、清淡饮食和适量运动。建议每天固定时间测量，便于观察趋势。",
  };
}

function extractBloodSugarValue(text) {
  const m = (text ?? "").match(/(?:血糖|空腹|餐后)[^0-9]*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function bloodSugarAssessment(value, text) {
  if (!Number.isFinite(value)) {
    return { status: "暂时无法判断", advice: "请补充血糖数值，例如 空腹血糖6.5。" };
  }
  const isFasting = /空腹|早上/.test(text ?? "");
  const isPostMeal = /餐后|饭后/.test(text ?? "");

  if (isFasting) {
    if (value < 3.9) return { status: "偏低", advice: "建议及时补充含糖食物，并观察是否有心慌、出汗、手抖。若反复低血糖，请咨询医生。" };
    if (value >= 7.0) return { status: "偏高", advice: "空腹血糖偏高。建议控制主食和甜食，避免含糖饮料，规律运动，并连续记录几天；若多次≥7.0，建议就医评估。" };
    if (value >= 6.1) return { status: "正常偏高", advice: "建议少吃精制主食和甜食，晚餐别太晚，保持规律运动，并继续观察。" };
    return { status: "正常范围", advice: "继续保持规律饮食和运动。" };
  }

  if (isPostMeal) {
    if (value < 3.9) return { status: "偏低", advice: "餐后仍偏低要警惕低血糖，建议补充糖分并观察症状。" };
    if (value >= 11.1) return { status: "偏高", advice: "餐后血糖偏高。建议减少甜食、含糖饮料和精制主食，餐后适当散步；若反复偏高，请咨询医生。" };
    if (value >= 7.8) return { status: "正常偏高", advice: "建议控制每餐主食量，多搭配蔬菜和优质蛋白，餐后轻度活动。" };
    return { status: "正常范围", advice: "继续保持。" };
  }

  return {
    status: "已记录，需结合测量时间判断",
    advice: "血糖要区分空腹或餐后。下次可说“空腹血糖6.5”或“餐后2小时血糖8.0”，我能判断得更准确。",
  };
}

function extractWeightValue(text) {
  const u = text ?? "";
  // 先尝试匹配公斤
  let m = u.match(/(?:体重|重)[^0-9]*(\d+(?:\.\d+)?)\s*(公斤|kg|千克)/i) || u.match(/(\d+(?:\.\d+)?)\s*(公斤|kg|千克)/i);
  if (m) return Number(m[1]);
  
  // 再尝试匹配斤，转换为公斤
  m = u.match(/(?:体重|重)[^0-9]*(\d+(?:\.\d+)?)\s*斤/i) || u.match(/(\d+(?:\.\d+)?)\s*斤/i);
  if (m) {
    const jinValue = Number(m[1]);
    return Math.round(jinValue / 2);
  }
  
  return null;
}

export function mapToSubIntent({ aiIntent, utterance }) {
  const u = (utterance ?? "").trim();

  // 优先处理“状态恢复/结束会话”语义，避免被误判为继续追问
  if (/(好了|好些了|好多了|缓解了|没事了|不难受了)/.test(u) && /(谢谢|感谢)?/.test(u)) {
    return "chat.confirm";
  }
  if (/(谢谢|感谢)/.test(u) && /(好了|好些了|好多了|缓解了|没事了|不难受了)/.test(u)) {
    return "chat.confirm";
  }

  // 疾病相关饮食咨询应进入健康问答，由大模型生成具体科普回答
  if (/(高血压|低血压|糖尿病|高血糖|高血脂|冠心病)/.test(u) && /(吃什么|怎么吃|饮食|水果|蔬菜|能不能吃|可以吃吗|适合吃|忌口)/.test(u)) {
    return "health_qa.diet";
  }

  // 用药“什么时候吃/饭前饭后”优先归为用药咨询
  if (/(什么时候吃|几点吃|饭前|饭后|怎么吃)/.test(u) && /(药|降压药|降糖药|阿司匹林|布洛芬|二甲双胍)/.test(u)) {
    return "medication.med_consult";
  }

  // 健康咨询细分
  if (aiIntent === "INT_QA_HEALTH") {
    if (/(能不能吃|可以吃吗|不能吃|吃什么|饮食|盐|咸|油|糖)/.test(u)) return "health_qa.diet";
    if (/(漏吃|忘吃|一起吃|相互作用|副作用|不良反应|饭前|饭后|多久吃)/.test(u)) return "health_qa.med";
    if (/(头晕|胸闷|心慌|咳嗽|发烧|疼|不舒服|失眠|气短)/.test(u)) return "health_qa.symptom";
    return "health_qa.general";
  }

  // 查询细分
  if (aiIntent === "INT_MED_QUERY") return "medication.med_query";
  if (aiIntent === "INT_BP_QUERY") return "health_data.bp_query";
  if (aiIntent === "INT_BS_QUERY") return "health_data.bs_query";
  if (aiIntent === "INT_EXERCISE_LOG") return "exercise.log";
  if (aiIntent === "INT_EXERCISE_QUERY") return "exercise.query";
  if (aiIntent === "INT_EXERCISE_RECOMMEND") return "exercise.recommend";
  if (aiIntent === "INT_DIET_LOG") return "diet.log";
  if (aiIntent === "INT_DIET_QUERY") return "diet.query";
  if (aiIntent === "INT_DIET_SUGGEST") return "diet.suggest";
  if (aiIntent === "INT_STATS_QUERY") return "stats.query";

  // 记录细分
  if (aiIntent === "INT_MED_ADD") return "medication.med_log";
  if (aiIntent === "INT_BP_ADD") return "health_data.bp_log";
  if (aiIntent === "INT_BS_ADD") return "health_data.bs_log";
  if (aiIntent === "INT_WEIGHT_ADD") return "health_data.weight_log";

  // 提醒
  if (aiIntent === "INT_MED_REMIND_SET") return "remind.med_set";
  if (aiIntent === "INT_MED_REMIND_CANCEL") return "remind.med_cancel";
  if (aiIntent === "INT_TEMP_REMIND_SET") return "remind.temp_set";
  if (aiIntent === "INT_REMIND_QUERY") return "remind.query";

  // 闲聊/关怀/帮助（尽量细分）
  if (aiIntent === "INT_SMALLTALK") {
    if (/(查看个人画像|我的画像|个人画像|查看画像|我要看我的个人画像|我就要看我的个人画像|给我看个人画像|显示个人画像)/.test(u)) return "chat.profile_view";
    if (/(我的身高是|我的体重是|我今年\d{1,3}岁|我\d{1,3}岁|几岁了|今年几岁|过敏|过敏史|有.*病|患有|得了)/.test(u)) return "chat.profile";
    if (/(不用了|不需要|不要了|先不了|算了)/.test(u) && /(谢谢|感谢)/.test(u)) return "chat.confirm";
    if (/^(不用了|不需要|不要了|先不了|算了)$/.test(u)) return "chat.confirm";
    if (/^(谢谢|好的|收到|嗯|嗯嗯)$/.test(u)) return "chat.confirm";
    if (/^(再见|拜拜)$/.test(u)) return "chat.goodbye";
    if (/(心情不好|难受|害怕|焦虑|孤单|想哭|没人陪|睡不着|很闷|闷得慌|无聊|一个人在家|一个人|伤心|难过|恐惧|心烦|烦躁|低落|消沉|沮丧|想念|怀念|失眠|想不开|活不下去|不想活|郁闷|坐立不安|流泪|眼泪|慌)/.test(u)) return "chat.care";
    if (/(怎么用|不会用|你能做什么|帮助|操作指南)/.test(u)) return "chat.help";
    if (/(天气|阳光|下雨|阴天|风大|凉快|热|冷|今天真好|适合出去|天气好|出太阳|晴)/.test(u)) return "chat.smalltalk";
    if (/(哈哈|呵呵|随便聊|聊聊天)/.test(u)) return "chat.smalltalk";
    return "chat.greet";
  }

  // 即使 AI 层没识别出来，也要把常见闲聊归到 chat.smalltalk，避免一直给“选择意图”
  if (/(天气|阳光|下雨|阴天|风大|凉快|热|冷|今天真好|适合出去)/.test(u)) return "chat.smalltalk";
  if (/(哈哈|呵呵|随便聊|聊聊天)/.test(u)) return "chat.smalltalk";

  // 兜底：识别“吃过了药/早上的药吃过了”
  if (/(吃过|吃完|吃了|服用|服了).*(药|降压药|降糖药|布洛芬|阿司匹林|二甲双胍)/.test(u)) {
    return "medication.med_log";
  }

  // 血糖/体重：当前第二层 mock 还没单独识别，这里兜底
  if (/(血糖|空腹|餐后)/.test(u)) return "health_data.bs_log";
  if (/(体重|公斤|kg)/.test(u)) return "health_data.weight_log";

  // 兜底：血压只有一个数字也当记录（不反问）
  if (/(血压)/.test(u) && /(\d{2,3})/.test(u)) return "health_data.bp_log";

  return "other.unknown";
}

export function generateReply({ utterance, subIntent, slots, safety, profile }) {
  const u = (utterance ?? "").trim();
  const timeHint = extractTimeHint(u);
  const drugName = pickFirstMatch(u, DRUGS) || (/(药)/.test(u) ? "用药" : "");

  // 安全优先（已在 app.js 做 URGENT/BLOCK，这里只做 WARN 语气加强）
  const warnTail = safety?.riskLevel === "WARN" ? "\n提示：如果你感觉不舒服加重，请及时就医。" : "";

  // 获取用户画像中的慢性病史
  const chronicDiseases = profile?.chronicDiseases || [];
  const hasHypertension = chronicDiseases.includes("高血压");
  const hasDiabetes = chronicDiseases.includes("糖尿病");
  const hasKneeIssue = chronicDiseases.includes("关节炎") || chronicDiseases.includes("膝盖");

  switch (subIntent) {
    // 用药记录
    case "medication.med_log":
      // 如果用户已经说了“吃一片/吃了1片”，就不要再追问吃几片了
      {
        let amount = slots?.dose?.amount;
        let unit = slots?.dose?.unit;

        if (!Number.isFinite(amount)) {
          const parsed = parseMedicationDoseFromText(u);
          if (parsed) {
            amount = parsed.amount;
            unit = parsed.unit;
          }
        }

        if (Number.isFinite(amount) && unit) {
          return `好的，已帮您记录${timeHint ? `“${timeHint}”` : "今天"}的${drugName || "[药名]"}：${amount}${unit}。` +
            warnTail;
        }

        return `好的，已帮您记录${timeHint ? `“${timeHint}”` : "今天"}的${drugName || "[药名]"}。` +
          `\n请再告诉我：吃了多少（例如 1片/1粒）？` +
          warnTail;
      }

    // 用药查询
    case "medication.med_query": {
      const days = Number.isFinite(slots?.rangeDays) ? slots.rangeDays : null;
      if (days === 1) return "好的，正在为您查询今天的用药记录。";
      if (days === 7) return "好的，正在为您查询最近一周的用药记录。";
      if (days === 30) return "好的，正在为您查询最近一个月的用药记录。";
      return "好的。我可以帮您查用药记录。\n你想查“今天”、还是“最近一周/一个月”的用药？";
    }

    // 漏服处理（当作咨询）
    case "medication.missed_dose":
      return "我明白了。一般不建议自行加倍补吃。\n请告诉我：是什么药？漏了多久？现在有没有不舒服？我再帮您给出更安全的建议。";

    // 用药咨询
    case "medication.med_consult":
      return "好的，我可以做用药相关科普与注意事项提醒（不替代医生）。\n请告诉我：药名是什么？你现在想问的是“能不能一起吃/忘吃怎么办/饭前饭后”等哪一种？";

    // 血压记录
    case "health_data.bp_log": {
      const s = slots?.bp_systolic;
      const d = slots?.bp_diastolic;
      const assessment = bpAssessment(s, d);
      // 单值也直接记录，不反问
      if (Number.isFinite(s) && !Number.isFinite(d)) {
        return `好的，已记录您的血压（收缩压/高压）${s} mmHg。` +
          `\n血压状态：${assessment.status}。` +
          `\n建议：${assessment.advice}` +
          `\n如果你方便，之后也可以补充低压（例如 ${s}/90）。` +
          warnTail;
      }
      return `好的，已记录您的血压${Number.isFinite(s) && Number.isFinite(d) ? `${s}/${d}` : "[高压]/[低压]"}。` +
        `\n血压状态：${assessment.status}。` +
        `\n建议：${assessment.advice}` +
        warnTail;
    }

    // 血糖记录（空腹/餐后）
    case "health_data.bs_log":
    case "health_data.bs_log_fasting":
    case "health_data.bs_log_post": {
      const value = Number.isFinite(slots?.value) ? slots.value : extractBloodSugarValue(u);
      const assessment = bloodSugarAssessment(value, u);
      return `好的，已记录您的血糖${Number.isFinite(value) ? value : ""}${timeHint ? `（${timeHint}）` : ""}。` +
        `\n血糖状态：${assessment.status}。` +
        `\n建议：${assessment.advice}` +
        warnTail;
    }

    // 体重记录
    case "health_data.weight_log": {
      const value = Number.isFinite(slots?.value) ? slots.value : extractWeightValue(u);
      if (Number.isFinite(value)) {
        return `好的，已记录您的体重${value}公斤。` +
          "\n建议：体重是否合适需要结合身高判断。您可以补充身高，例如“身高165厘米”，我可以帮您估算BMI和体重范围。" +
          warnTail;
      }
      return "好的，已记录体重。\n请告诉我体重数值（例如 68公斤）和测量时间（例如 今天早上）。";
    }

    // 健康数据查询 - 血压
    case "health_data.bp_query": {
      const u = (utterance ?? "").trim();
      let days = Number.isFinite(slots?.rangeDays) ? slots.rangeDays : null;
      
      // 从用户输入中检测时间范围
      if (days === null) {
        if (/今天|今日/.test(u)) days = 1;
        else if (/最近一周|近一周|这周|本周|一周|7天|七天/.test(u)) days = 7;
        else if (/最近一个月|近一个月|本月|这个月|一个月|30天|三十天/.test(u)) days = 30;
      }
      
      if (days === 1) return "好的，正在为您查询今天的血压记录。";
      if (days === 7) return "好的，正在为您查询最近一周的血压记录。";
      if (days === 30) return "好的，正在为您查询最近一个月的血压记录。";
      return "好的，我可以帮您查询血压。\n你想看“今天”、还是“最近一周”的血压趋势？";
    }

    // 健康数据查询 - 血糖
    case "health_data.bs_query": {
      const u = (utterance ?? "").trim();
      let days = Number.isFinite(slots?.rangeDays) ? slots.rangeDays : null;
      
      // 从用户输入中检测时间范围
      if (days === null) {
        if (/今天|今日/.test(u)) days = 1;
        else if (/最近一周|近一周|这周|本周|一周|7天|七天/.test(u)) days = 7;
        else if (/最近一个月|近一个月|本月|这个月|一个月|30天|三十天/.test(u)) days = 30;
      }
      
      if (days === 1) return "好的，正在为您查询今天的血糖记录。";
      if (days === 7) return "好的，正在为您查询最近一周的血糖记录。";
      if (days === 30) return "好的，正在为您查询最近一个月的血糖记录。";
      return "好的，我可以帮您查询血糖。\n你想看“今天”、还是“最近一周”的血糖趋势？";
    }

    // 运动饮食与统计
    case "exercise.log":
      return "太好了，已帮您记录本次运动。\n如果方便，请再告诉我运动时长（例如30分钟）和感受（轻松/有点累）。";
    case "exercise.query":
      return "好的，我可以帮您查运动记录。\n您想看今天、本周还是本月的运动情况？";
    case "exercise.recommend": {
      // 根据用户画像中的健康状况直接给出运动建议，减少追问
      const recommendations = [];
      
      // 针对特定运动的问题给出明确回答
      if (/快跑|跑步/.test(u) && hasHypertension) {
        return "⚠️ 根据您有高血压的情况，**不建议快跑**。快跑会使心率加快、血压骤升，增加心脏负担。\n\n✅ 推荐运动：\n• 散步（每天30分钟，分两次进行）\n• 太极拳（动作缓慢，有助于放松）\n• 八段锦（传统养生运动）\n\n💡 小贴士：运动时保持呼吸平稳，感觉有点累但还能说话的强度最合适。";
      }
      
      if (/快跑|跑步/.test(u)) {
        return "好的！跑步是很好的运动，但要循序渐进。\n\n✅ 建议：\n• 先从快走开始，适应后再慢慢过渡到慢跑\n• 每次30分钟左右，每周3-5次\n• 运动前热身，运动后拉伸\n• 如果感觉气喘或心慌，立即停下来休息";
      }
      
      if (/游泳/.test(u)) {
        if (hasKneeIssue) {
          return "🏊 游泳非常适合您！游泳对膝盖没有压力，还能锻炼全身。\n\n✅ 建议：\n• 每周游泳2-3次，每次30-45分钟\n• 注意水温，避免受凉\n• 游泳前做一些陆上热身运动";
        }
        return "🏊 游泳是很好的全身性运动！\n\n✅ 建议：\n• 每周游泳2-3次，每次30-45分钟\n• 注意安全，最好在有人看护的泳池游泳\n• 游泳前做好热身";
      }
      
      if (/太极|太极拳/.test(u)) {
        return "🧘 太极拳非常适合您！\n\n✅ 优点：\n• 动作缓慢柔和，对身体负担小\n• 有助于放松身心，调节情绪\n• 能改善平衡能力\n\n💡 建议：每周练习3-4次，每次20-30分钟。";
      }
      
      // 通用运动推荐
      if (hasHypertension || hasDiabetes) {
        recommendations.push("散步（每天30分钟，分两次进行）");
        recommendations.push("太极拳（动作缓慢，有助于放松）");
        recommendations.push("八段锦（传统养生运动）");
      } else {
        recommendations.push("快走（每天30分钟）");
        recommendations.push("太极拳或八段锦");
        recommendations.push("哑铃操（轻重量）");
      }
      
      if (hasKneeIssue) {
        recommendations.push("\n⚠️ 注意：避免深蹲、爬楼梯等对膝盖压力大的运动");
      }
      
      return `好的，根据您的情况，我推荐这些运动：\n\n${recommendations.join("\n")}\n\n建议每周运动3-5次，每次30分钟左右。如果运动中感到不适，请立即停止休息。`;
    }
    case "diet.log":
      return "好的，已帮您记录这次饮食。\n如果方便，请补充大概分量（例如1碗/2个）我可以帮您更准确估算热量。";
    case "diet.query":
      return "好的，我可以帮您查营养信息。\n您想查询哪种食物的热量或营养（例如苹果、米饭）？";
    case "diet.suggest": {
      // 根据用户健康状况直接给出饮食建议
      if (hasHypertension) {
        return "好的，根据您有高血压的情况，给您以下饮食建议：\n\n✅ 推荐多吃：\n• 新鲜蔬菜（菠菜、芹菜、西兰花等）\n• 水果（苹果、香蕉、柚子等）\n• 全谷物（燕麦、糙米、玉米）\n• 优质蛋白（鱼、虾、鸡胸肉、豆制品）\n\n❌ 建议少吃：\n• 高盐食物（咸菜、腊肉、方便面、卤味）\n• 油炸食品（油条、炸鸡、薯片）\n• 高脂肪肉类（肥肉、动物内脏）\n\n💡 小贴士：每天食盐控制在5克以内，约一小平勺。烹饪多用清蒸、水煮、凉拌。";
      }
      if (hasDiabetes) {
        return "好的，根据您有糖尿病的情况，给您以下饮食建议：\n\n✅ 推荐多吃：\n• 粗粮（糙米、燕麦、荞麦）\n• 杂豆（红豆、绿豆、鹰嘴豆）\n• 绿叶蔬菜（菠菜、芹菜、生菜）\n• 低糖水果（苹果、柚子、草莓）\n\n❌ 建议少吃：\n• 甜食（蛋糕、糖果、奶茶、蜂蜜）\n• 精制主食（白米饭、白面包、面条）\n• 高糖水果（荔枝、芒果、西瓜）\n\n💡 小贴士：每餐主食不超过一个拳头大小，定时定量进餐。";
      }
      return "好的，给您一些通用的健康饮食建议：\n\n✅ 推荐多吃：\n• 新鲜蔬菜和水果\n• 全谷物和杂豆\n• 优质蛋白（鱼、肉、蛋、奶、豆制品）\n\n❌ 建议少吃：\n• 高盐、高油、高糖食物\n• 油炸食品和加工肉类\n\n💡 小贴士：饮食均衡，三餐规律，细嚼慢咽。";
    }
    case "stats.query":
      return "好的，我可以给您看统计数据。\n您想看今日、本周还是本月的运动和饮食总结？";

    // 健康咨询（饮食/用药/症状）
    case "health_qa.diet":
      return "好的。高血压一般建议少盐、少腌制和加工肉，多蔬菜水果。\n你想问的是哪一种食物？我给你更具体的建议。";
    case "health_qa.med":
      return "好的。我可以做用药科普与注意事项提醒。\n请告诉我：具体药名、现在的问题（例如漏吃/一起吃/饭前饭后）。";
    case "health_qa.symptom": {
      // 根据性别过滤不适用的问题
      const gender = profile?.gender;
      if (gender === "男" && /月经|例假|生理期/.test(u)) {
        return "根据您的个人信息，您是男性，男性不会有月经哦。请问您还有其他健康问题需要咨询吗？";
      }
      
      // 针对常见症状直接给出建议，减少追问
      if (/头痛|头疼/.test(u)) {
        return "头痛可能由多种原因引起，如血压波动、睡眠不足、疲劳等。\n\n建议：\n1. 先坐下或躺下休息，保持环境安静\n2. 轻柔按摩太阳穴\n3. 补充水分\n4. 如果头痛持续不缓解或伴有恶心、视力模糊，请及时就医\n\n您今天血压正常吗？";
      }
      if (/头晕/.test(u)) {
        return "头晕可能与血压变化、血糖波动、体位变化等有关。\n\n建议：\n1. 立即坐下或躺下，以防摔倒\n2. 缓慢变换姿势\n3. 适量补充水分和营养\n4. 如果频繁头晕或伴有心慌、出冷汗，请咨询医生\n\n您最近血压情况如何？";
      }
      if (/恶心|想吐/.test(u)) {
        return "恶心可能与饮食、药物、身体状况等有关。\n\n建议：\n1. 先休息，保持空气流通\n2. 避免油腻食物\n3. 小口喝温水或生姜水\n4. 如果持续恶心或伴有呕吐，请及时就医\n\n您今天饮食正常吗？";
      }
      if (/视力模糊/.test(u)) {
        return "视力模糊可能与血压升高、血糖波动、眼部问题等有关。\n\n⚠️ 重要提示：如果突然出现视力模糊，尤其是伴有头痛、头晕，可能是血压过高的信号，请立即测量血压并坐下休息。\n\n建议：\n1. 立即坐下休息\n2. 测量血压和血糖\n3. 如果症状不缓解，请及时就医检查\n\n您最近有测量血压吗？";
      }
      
      return "您描述的症状我了解了。\n\n请注意：如果症状持续不缓解或加重，请及时就医检查。\n为了能给您更好的建议，您可以告诉我症状持续多久了吗？";
    }
    case "health_qa.general": {
      // 根据性别过滤不适用的问题
      const gender = profile?.gender;
      if (gender === "男" && /月经|例假|生理期/.test(u)) {
        return "根据您的个人信息，您是男性，男性不会有月经哦。请问您还有其他健康问题需要咨询吗？";
      }
      return "好的。你把问题再说具体一点（和哪个病/哪种药/哪项指标有关），我用更简单的话帮你说明。";
    }

    // 看板（本前端 demo 先用文字摘要模板）
    case "dashboard.daily_summary":
      return "好的，我可以给您做“今日健康小结”。\n请先告诉我：今天有没有记录血压/血糖/用药？";
    case "dashboard.weekly_summary":
      return "好的，我可以给您做“本周统计”。\n你想看血压、血糖还是体重？";
    case "dashboard.monthly_summary":
      return "好的，我可以给您做“本月统计”。\n你想看血压、血糖还是体重？";
    case "dashboard.trend":
      return "好的，我可以给您看趋势。\n请说清楚要看：血压/血糖/体重，以及时间范围（例如 最近一周）。";
    case "dashboard.compare":
      return "好的，我可以帮您对比。\n请告诉我对比范围（例如 这周 vs 上周）以及指标（血压/血糖/体重）。";
    case "dashboard.family_view":
      return "好的。查看家人数据需要先绑定/授权。\n请先选择：查看“我爸”还是“我妈”，以及时间范围（今天/本周/本月）。";

    // 提醒
    case "remind.med_set": {
      if (/(点|:|：|分钟|上午|下午|晚上|早上|中午|傍晚|凌晨|深夜)/.test(u) || /阿司匹林|布洛芬|二甲双胍|硝苯地平|氨氯地平|缬沙坦|降压药|降糖药|感冒药|止痛药|消炎药|中药|胰岛素|格列美脲|卡托普利|氯沙坦|美托洛尔|阿莫西林/.test(u)) {
        return null;
      }
      return "好的，我来帮您设置吃药提醒！\n请告诉我：药名和每天几点提醒？（例如：阿司匹林 早上8点）";
    }
    case "remind.med_cancel": {
      if (/第?[零一二两三四五六七八九十\d]+\s*条|全部|所有/.test(u)) {
        return null;
      }
      return "好的，我来帮您操作提醒。\n请告诉我：要关闭、开启还是删除第几条？（例如：关闭第2条 / 开启第1条 / 删除第3条）或者说'全部关闭'。";
    }
    case "remind.bp_set": {
      if (/(点|:|：|分钟|上午|下午|晚上|早上|中午|傍晚|凌晨|深夜)/.test(u)) {
        return null;
      }
      return "好的，我来设置测血压提醒。\n请告诉我：每天几点提醒？（例如：早上7点）";
    }
    case "remind.bs_set": {
      if (/(点|:|：|分钟|上午|下午|晚上|早上|中午|傍晚|凌晨|深夜)/.test(u)) {
        return null;
      }
      return "好的，我来设置测血糖提醒。\n请告诉我：空腹还是餐后？每天几点提醒？";
    }
    case "remind.temp_set": {
      // 检查用户是否已经提供了时间
      if (/(分钟后|几点|点|时间|早上|下午|晚上)/.test(u)) {
        return null; // 已经有时间信息，跳过追问，直接执行设置
      }
      // 根据用户请求类型给出不同的追问
      if (/(吃药|吃药|服药|用药)/.test(u)) {
        return "好的，我来帮您设置临时吃药提醒！\n请告诉我：什么时候提醒？（例如：十分钟后）";
      }
      if (/(量体温|测体温|体温)/.test(u)) {
        return "好的，我来帮您设置量体温提醒！\n请告诉我：什么时候提醒？（例如：十分钟后）";
      }
      return "好的，我来帮您设置临时提醒！\n请告诉我：什么时候提醒？（例如：十分钟后）";
    }
    case "remind.checkup_set":
      return "好的，我来设置体检提醒。\n请告诉我：体检日期或大概时间（例如 下个月10号）。";
    case "remind.query":
      return "好的，我来帮您查看当前所有提醒。";
    case "remind.modify":
      return "好的，我来帮您修改提醒。\n请告诉我：要改哪一个提醒？改成几点？";
    case "remind.trigger_notify":
      return "提醒您：该做健康记录/按时用药了。\n需要我帮您记录一下吗？";

    // 智能对话
    case "chat.greet": {
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      if (/晚/.test(u)) return pick(["晚上好！今天辛苦了，记得早点休息哦。", "晚上好！吃完晚饭了吗？记得按时吃药哦。"]);
      if (/早/.test(u)) return pick(["早上好！新的一天开始了，记得按时吃药、喝点温水哦。", "早上好呀！昨晚睡得好吗？记得吃早饭和晨起药。"]);
      return pick(["您好！我是您的银发健康助手，有什么可以帮您？", "你好呀！今天身体怎么样？有什么需要我帮忙的吗？", "您好！我一直在呢，有什么想问的或想记录的，随时跟我说。"]);
    }
    case "chat.confirm":
      return ["不客气！有需要随时叫我。", "好的！随时找我哦。", "没问题，我一直在。"][Math.floor(Math.random() * 3)];
    case "chat.goodbye":
      return ["好的，祝您平安健康。需要时随时找我。", "嗯，您好好休息。我随时都在，有需要再叫我。", "再见啦，保重身体！明天见。"][Math.floor(Math.random() * 3)];
    case "chat.help":
      return "我可以帮您：记录用药、记录血压/血糖/体重、查询记录、做健康咨询。\n例如你可以说：「我晚上吃了布洛芬」「血压140/90」「空腹血糖6.5」「今天血压怎么样」。";
    case "chat.profile":
      return "收到，我已记下这条个人信息。\n如果你愿意，也可以继续告诉我年龄、慢性病史或常用药，我能给你更贴合的健康提醒。";
    case "chat.profile_view": {
      if (!profile) return "您还没有提供任何个人信息呢。";
      let info = "您的个人画像信息：\n\n";
      if (profile.name) info += `• 姓名：${profile.name}\n`;
      if (profile.age) info += `• 年龄：${profile.age}岁\n`;
      if (profile.gender) info += `• 性别：${profile.gender}\n`;
      if (profile.height) info += `• 身高：${profile.height}cm\n`;
      if (profile.weight) info += `• 体重：${profile.weight}kg\n`;
      if (profile.chronicDiseases && profile.chronicDiseases.length > 0) {
        info += `• 慢性病史：${profile.chronicDiseases.join('、')}\n`;
      }
      if (profile.allergies && profile.allergies.length > 0) {
        info += `• 过敏史：${profile.allergies.join('、')}\n`;
      }
      if (profile.currentMedications && profile.currentMedications.length > 0) {
        info += `• 当前用药：${profile.currentMedications.join('、')}\n`;
      }
      if (profile.familyMembers && profile.familyMembers.length > 0) {
        info += `• 家庭成员：${profile.familyMembers.map(m => m.label).join('、')}\n`;
      }
      if (info === "您的个人画像信息：\n\n") {
        info = "您还没有提供任何个人信息呢。可以告诉我您的年龄、慢性病史或常用药，我能给您更贴合的健康提醒。";
      }
      return info;
    }
    case "chat.care": {
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      if (/(一个人在家|一个人|没.*陪|没人陪)/.test(u)) {
        return pick([
          "听到你这么说，我很心疼你一个人在家。要不要跟我聊聊？如果方便，也可以给家人打个电话，或者到窗边透透气、慢慢走一走。我一直在呢。",
          "一个人在家确实容易觉得孤单。你可以跟我随便聊聊，也可以试着打开收音机听听节目，或者给老朋友打个电话。需要我帮你联系家人吗？",
          "我理解那种一个人在家的滋味。你现在方便出去走走吗？哪怕就在楼下转一圈、晒晒太阳，心情也会好一些的。我随时都在这里陪着你。"
        ]);
      }
      if (/(伤心|难过|想哭|流泪|眼泪)/.test(u)) {
        return pick([
          "听到你这么说，我心里也很难受。想哭就哭出来吧，哭出来会好受一些。我就在这里陪着你，你不是一个人。",
          "难过了就别憋着，好好哭一场也是一种释放。哭完之后喝杯温水，好好休息。如果需要，随时跟我说，我一直都在。",
          "我知道你现在心里很难受，这很正常，不必强忍着。等你平静一些了，想跟我聊聊发生了什么吗？我愿意听。"
        ]);
      }
      if (/(害怕|恐惧|吓|慌)/.test(u)) {
        return pick([
          "别怕，有我在呢。能告诉我是什么让你害怕吗？有时候把害怕的事情说出来，心里会踏实一些。",
          "我理解你现在很害怕。先做几个深呼吸，慢慢吸气、慢慢呼气……感觉好一点了吗？如果还是很害怕，建议联系家人陪陪你。"
        ]);
      }
      if (/(焦虑|着急|心烦|烦躁|坐立不安)/.test(u)) {
        return pick([
          "焦虑的时候人确实很难受。试试慢慢做几个深呼吸：吸气4秒，憋住4秒，慢慢呼出6秒。重复几次，会平静一些的。",
          "心烦的时候，先别想那些让你焦虑的事。站起来倒杯温水，慢慢喝，或者到窗边看看远处。等心情平复了，我们再一起想办法，好吗？",
          "我理解你现在很焦虑。有时候焦虑是因为事情太多不知道从哪做起，要不要跟我说说？我们一起理一理。"
        ]);
      }
      if (/(睡不着|失眠|整夜|翻来覆去)/.test(u)) {
        return pick([
          "睡不着确实很折磨人。试试这些：慢慢做深呼吸，从1数到100；或者起来喝杯温牛奶，别看手机。等有困意了再躺下。",
          "晚上睡不着的时候，可以试试闭着眼睛，慢慢从脚趾到头顶，一部分一部分地放松身体。我陪着你，不用急。",
          "失眠的时候别硬躺着，可以起来坐一会儿，听听轻音乐或者翻翻书，等困了再回床上。明天白天尽量别午睡，晚上会好睡一些。"
        ]);
      }
      if (/(难受|不舒服|心情不好|郁闷|低落|消沉|沮丧)/.test(u)) {
        return pick([
          "听到你难受，我也替你担心。能跟我说说哪里不舒服吗？是身体难受还是心里难受？我都在这里帮你。",
          "心情不好的时候，别一个人扛着。你愿意跟我说说吗？有时候说出来就好了一半。我永远在这里听你说。",
          "我理解你现在的感受。先对自己好一点，给自己倒杯温水，找一个舒服的姿势坐着。等你想说了，随时跟我说。"
        ]);
      }
      if (/(无聊|很闷|闷得慌|没事干)/.test(u)) {
        return pick([
          "无聊了呀？要不要跟我聊聊天？或者试试：翻翻老相册回忆一下美好的事、听听收音机、给老朋友打个电话聊几句？",
          "闷了就别总待在屋里了，出去走走吧，到楼下公园转转、晒晒太阳，遇到邻居打个招呼，心情马上就不一样了。"
        ]);
      }
      if (/(想念|想.*了|怀念)/.test(u)) {
        return pick([
          "想念一个人的时候，心里总是又温暖又酸涩。那些美好的回忆一直都在你心里的，谁也拿不走。",
          "想念是爱的另一种方式，说明那个人在你心里很重要。要不要跟我聊聊你想念的人？说出来也许会舒坦一些。"
        ]);
      }
      return pick([
        "听到你这么说，我很关心你。要不要和我聊聊？我一直在这里陪着你。",
        "我理解你现在的感受，你不需要一个人面对。跟我说说好吗？我愿意听。",
        "你别担心，有什么心里话都可以跟我说。我虽然是个助手，但我一直都在。"
      ]);
    }
    case "chat.smalltalk": {
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      if (/(天气真好|天气好|阳光|出太阳)/.test(u)) return pick(["天气好就要好好享受！出去晒晒太阳、走走，对身体好。", "好天气别浪费了，出去走走吧，顺便活动活动筋骨！"]);
      if (/(下雨|阴天)/.test(u)) return "下雨天就在家好好休息吧，听听收音机、喝杯热茶也挺好的。";
      if (/(热|冷|凉快)/.test(u)) return "天气变化要注意增减衣服，别着凉了。";
      return pick(["我在呢。你想聊聊今天的情况，还是需要我帮你记录一下健康数据？", "今天过得怎么样？有什么想跟我说的吗？", "想聊天还是想记录健康信息？都可以跟我说。"]);
    }

    default:
      return "我明白了。你是想记录用药、记录血压/血糖/体重，还是查询/咨询健康问题？你可以直接用一句话说明。";
  }
}

