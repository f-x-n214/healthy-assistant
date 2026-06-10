export const SAFETY = {
  absoluteBlock: [
    {
      category: "自伤/自杀",
      keywords: ["自杀", "想死", "不想活了", "结束生命"],
      reason: "存在自伤风险，必须立即拦截并升级紧急干预流程",
    },
    {
      category: "违法/危险用药行为",
      keywords: ["代开药", "伪造处方", "买处方药", "开处方"],
      reason: "涉及违法与医疗合规风险，禁止提供指导",
    },
    {
      category: "诈骗/敏感信息泄露",
      keywords: ["验证码", "银行卡号", "密码", "转账"],
      reason: "涉及财产与隐私安全，禁止收集/回显/引导操作",
    },
  ],

  conditionalWarn: [
    {
      category: "擅自调整用药",
      keywords: ["加量", "减量", "停药", "换药", "掰开吃"],
      scene: "用户试图自行调整处方/长期用药",
      handling: "提示遵医嘱，建议联系医生/药师；不提供具体剂量调整方案",
    },
    {
      category: "高危症状需进一步确认",
      keywords: ["头晕", "胸闷", "心慌", "黑便", "呕血"],
      scene: "可能为严重问题但信息不足",
      handling: "追问持续时间/伴随症状；命中紧急信号则升级 URGENT",
    },
    {
      category: "饮酒后/空腹运动风险",
      keywords: ["喝酒后运动", "喝了酒运动", "空腹运动", "没吃东西跑步"],
      scene: "存在明显运动安全风险",
      handling: "提醒先补给或等待酒精代谢，不建议立即运动",
    },
    {
      category: "高强度运动风险",
      keywords: ["马拉松", "冲刺", "高强度间歇", "HIIT"],
      scene: "中老年用户请求高强度训练",
      handling: "提示风险，建议先医学评估并改为低冲击运动",
    },
  ],

  urgentMedicalKeywords: [
    "胸痛",
    "呼吸困难",
    "口齿不清",
    "说不清话",
    "一侧无力",
    "麻木",
    "意识模糊",
    "昏迷",
    "大量出血",
    "呕血",
    "黑便",
    "血压180/120",
  ],

  riskLevels: {
    BLOCK:
      "出现自伤自杀、违法处方/代开药、诈骗/索要验证码与银行卡等；或请求处方级指令（具体剂量调整、替代处方药）",
    WARN: "涉及用药调整、潜在风险症状但不确定；允许科普与建议就医/咨询药师，但不提供处方级方案",
    URGENT:
      "出现疑似急症信号（胸痛、呼吸困难、中风表现、意识障碍、大出血等）或极端指标（如高血压危象），必须优先提示就医/急救",
    PASS: "普通记录、查询、看板展示、健康科普与日常闲聊，按正常流程处理",
  },
};

function includesAny(text, words) {
  return words.some((w) => text.includes(w));
}

export function runSafetyCheck(utterance, aiResult) {
  const text = utterance ?? "";

  // 1) 绝对禁止：直接 BLOCK
  for (const row of SAFETY.absoluteBlock) {
    if (includesAny(text, row.keywords)) {
      return { riskLevel: "BLOCK", reasons: [`命中绝对禁止：${row.category}`], matched: row };
    }
  }

  // 2) 紧急：关键词或指标触发 URGENT
  if (includesAny(text, ["胸痛", "呼吸困难", "昏迷", "意识模糊", "口角歪斜", "说不清", "一侧无力", "120"])) {
    return { riskLevel: "URGENT", reasons: ["检测到疑似紧急风险信号"], matched: null };
  }

  if (aiResult?.intent === "INT_BP_ADD") {
    const s = aiResult?.slots?.bp_systolic;
    const d = aiResult?.slots?.bp_diastolic;
    if (Number.isFinite(s) && Number.isFinite(d) && (s >= 180 || d >= 120)) {
      return { riskLevel: "URGENT", reasons: ["血压数值偏高，建议尽快就医评估"], matched: null };
    }
    if (Number.isFinite(s) && Number.isFinite(d) && (s >= 140 || d >= 90)) {
      return { riskLevel: "WARN", reasons: ["血压偏高，建议持续监测；如不适加重请就医"], matched: null };
    }
  }

  // 3) 条件警告：WARN
  for (const row of SAFETY.conditionalWarn) {
    if (includesAny(text, row.keywords)) {
      return { riskLevel: "WARN", reasons: [`命中条件警告：${row.category}`], matched: row };
    }
  }

  return { riskLevel: "PASS", reasons: [], matched: null };
}

