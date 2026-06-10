export const FIRST_LAYER = {
  /**
   * 作业要求：词库分类表（至少6个类型，每类≥5个关键词）
   * 这里既给“关键词列表”，也给“匹配示例/处理方式”，方便直接截图写进作业。
   */
  lexiconTable: [
    {
      type: "寒暄问候",
      keywords: ["你好", "您好", "在吗", "早上好", "中午好", "下午好", "晚上好", "嗨"],
      example: "「你好」→ 问候回复",
      handling: "直接返回（固定话术+引导功能）",
    },
    {
      type: "感谢确认",
      keywords: ["谢谢", "感谢", "好的", "可以", "行", "明白了", "收到", "嗯嗯"],
      example: "「好的谢谢」→ 确认回复",
      handling: "直接返回（礼貌结束/继续引导）",
    },
    {
      type: "告别结束",
      keywords: ["再见", "拜拜", "晚安", "下次聊", "先这样", "我走了", "退出"],
      example: "「晚安」→ 告别回复",
      handling: "直接返回（结束会话）",
    },
    {
      type: "使用帮助/不会用",
      keywords: ["怎么用", "不会用", "帮帮我", "使用说明", "功能有哪些", "你能做什么", "操作指南"],
      example: "「你能做什么」→ 帮助说明",
      handling: "直接返回（能力清单+示例输入）",
    },
    {
      type: "用药提醒开关",
      keywords: ["设置提醒", "开启提醒", "关提醒", "取消提醒", "提醒我吃药", "闹钟", "定时", "每天提醒"],
      example: "「每天早上8点提醒我吃药」→ 提醒设置",
      handling: "路由执行（进入提醒设置/补槽）",
    },
    {
      type: "健康数据强格式记录",
      keywords: ["血压", "血糖", "体重", "空腹", "餐后", "mmHg", "mmol/L", "公斤", "kg"],
      example: "「血压145/92」→ 记录血压",
      handling: "路由执行（解析数值→写入记录）",
    },
    {
      type: "子女查看父母数据",
      keywords: ["我爸", "我妈", "父亲", "母亲", "老人", "给我看", "我想看", "家属", "替他", "替她"],
      example: "「我想看我妈最近血糖」→ 家属视角查询",
      handling: "路由执行（校验绑定/授权→查询）",
    },
    {
      type: "情绪关怀",
      keywords: ["心烦", "难受", "害怕", "睡不着", "焦虑", "孤单", "孤独", "想哭", "没人陪", "伤心", "难过"],
      example: "「我有点害怕」→ 情绪安抚",
      handling: "直接返回（安抚+必要时升级）",
    },
  ],

  /**
   * 第一层规则：正则快速命中（强优先级从上到下）
   * 返回：intent + 可选 slots
   */
  rules: [
    {
      id: "emergency_keywords",
      intent: "INT_EMERGENCY",
      pattern:
        "(呼吸困难|胸痛|意识模糊|昏迷|中风|口角歪斜|说不清|一侧无力|大出血|自杀|想死|救命|急救|120|不想活了)",
      flags: "i",
      handling: "路由执行（紧急提示/升级）",
      example: "「胸痛喘不过气」→ INT_EMERGENCY",
    },
    {
      id: "emotion_care",
      intent: "INT_SMALLTALK",
      pattern:
        "(孤独|孤单|心情不好|难受|害怕|焦虑|想哭|没人陪|睡不着|很闷|闷得慌|无聊|一个人在家|一个人|伤心|难过)",
      flags: "i",
      handling: "直接返回（情绪安抚）",
      example: "「我好孤独」→ INT_SMALLTALK",
    },
    {
      id: "remind_query",
      intent: "INT_REMIND_QUERY",
      pattern: "(提醒|闹钟|定时).*(查看|查询|我的|有什么)|(查看|查询|我的|有什么).*提醒",
      flags: "i",
      handling: "路由执行（查询提醒）",
      example: "「查看我的提醒」→ INT_REMIND_QUERY",
    },
    {
      id: "bp_log_strong",
      intent: "INT_BP_ADD",
      pattern: "(?:血压|高压|收缩压|低压|舒张压)[^0-9]*(?:高压|收缩压)?\\s*(\\d{2,3})\\s*(?:\\/|\\\\|到|-|\\s)\\s*(?:低压|舒张压)?\\s*(\\d{2,3})",
      flags: "i",
      handling: "路由执行（写入血压）",
      example: "「血压145/92」→ INT_BP_ADD + slots",
    },
    {
      id: "bp_log_pure_format",
      intent: "INT_BP_ADD",
      pattern: "^(\\d{2,3})\\s*(?:\\/|\\\\|到|-)\\s*(\\d{2,3})$",
      flags: "",
      handling: "路由执行（纯数字血压格式，如130/80）",
      example: "「130/80」→ INT_BP_ADD + slots",
    },
    {
      id: "bp_query",
      intent: "INT_BP_QUERY",
      pattern: "(查看|查询|最近|本周|趋势|变化|统计|看一下|看看|想看|查一下).*(血压)|(血压).*(记录|趋势|变化|统计|多少)",
      flags: "i",
      handling: "路由执行（查询血压）",
      example: "「看一下我的血压记录」→ INT_BP_QUERY",
    },
    {
      id: "bs_log_strong",
      intent: "INT_BS_ADD",
      pattern: "(血糖|空腹血糖|餐后血糖)[^0-9]*?(\\d+\\.?\\d*)\\s*(mmol|毫摩|mg/dL)?",
      flags: "i",
      handling: "路由执行（写入血糖）",
      example: "「血糖6.5」→ INT_BS_ADD + slots",
    },
    {
      id: "bs_query",
      intent: "INT_BS_QUERY",
      pattern: "(查看|查询|最近|本周|趋势|变化|统计|看一下|看看|想看|查一下).*(血糖)|(血糖).*(记录|趋势|变化|统计|多少)",
      flags: "i",
      handling: "路由执行（查询血糖）",
      example: "「看一下我的血糖记录」→ INT_BS_QUERY",
    },
    {
      id: "exercise_log",
      intent: "INT_EXERCISE_LOG",
      pattern: "(今天|刚刚|我).*(散步|跑步|快走|慢走|游泳|太极|瑜伽|广场舞|骑车).*(\\d+\\s*(分钟|分|小时))?",
      flags: "i",
      handling: "路由执行（记录运动）",
      example: "「我今天散步了30分钟」→ INT_EXERCISE_LOG",
    },
    {
      id: "diet_log",
      intent: "INT_DIET_LOG",
      pattern: "(今天|中午|早上|晚上|早餐|午餐|晚餐).*(吃了|喝了|摄入).+",
      flags: "i",
      handling: "路由执行（记录饮食）",
      example: "「中午吃了米饭和青菜」→ INT_DIET_LOG",
    },
    {
      id: "diet_suggest",
      intent: "INT_DIET_SUGGEST",
      pattern: "(推荐.*吃|建议.*吃|吃什么|怎么吃|饮食建议|能吃吗|适合吃|忌口|午餐吃什么|晚餐吃什么|中午吃什么)",
      flags: "i",
      handling: "路由执行（饮食建议）",
      example: "「推荐中午吃什么」→ INT_DIET_SUGGEST",
    },
    {
      id: "exercise_recommend",
      intent: "INT_EXERCISE_RECOMMEND",
      pattern: "(推荐.*运动|建议.*运动|做什么运动|适合.*运动|怎么运动|能做什么运动|运动推荐|(高血压|糖尿病|膝盖).*能.*运动|(快跑|慢跑|跑步|游泳|太极|散步).*(可以|能|适合|减肥))",
      flags: "i",
      handling: "路由执行（运动推荐）",
      example: "「膝盖不好推荐什么运动」「高血压能快跑吗」「我想快跑减肥」→ INT_EXERCISE_RECOMMEND",
    },
    {
      id: "exercise_query",
      intent: "INT_EXERCISE_QUERY",
      pattern: "(这周|本周|今天|最近).*(运动|锻炼).*(几次|多少|怎么样|情况)|运动.*(统计|趋势|记录)",
      flags: "i",
      handling: "路由执行（查询运动）",
      example: "「我这周运动了几次」→ INT_EXERCISE_QUERY",
    },
    {
      id: "diet_query",
      intent: "INT_DIET_QUERY",
      pattern: "(热量|卡路里|脂肪|蛋白质|维生素|营养|摄入了多少)",
      flags: "i",
      handling: "路由执行（营养查询）",
      example: "「苹果有多少热量」→ INT_DIET_QUERY",
    },
    {
      id: "stats_query",
      intent: "INT_STATS_QUERY",
      pattern: "(今天统计|本周统计|这周怎么样|本月统计|趋势|目标|进度|看统计|查看统计)",
      flags: "i",
      handling: "路由执行（统计查询）",
      example: "「看看这周运动怎么样」→ INT_STATS_QUERY",
    },
    {
      id: "temp_remind_set",
      intent: "INT_TEMP_REMIND_SET",
      pattern: "(提醒我|设置|开启).*?(分钟后|几点|点|时间).*?(量体温|测体温|体温)|(提醒我|设置|开启).*?(量体温|测体温|体温).*?(分钟后|几点|点|时间)?",
      flags: "i",
      handling: "路由执行（设置临时提醒）",
      example: "「提醒我十分钟后量体温」→ INT_TEMP_REMIND_SET",
    },
    {
      id: "med_remind_set",
      intent: "INT_MED_REMIND_SET",
      pattern: "(设置|开启|打开|安排|提醒我|每天|每).*(用药|吃药|服药|降压药|降糖药|药).*(提醒|闹钟|定时|几点|点)|(提醒我|每天|每).*(用药|吃药|服药|降压药|降糖药|药)",
      flags: "i",
      handling: "路由执行（设置提醒）",
      example: "「开启吃药提醒」「每天九点提醒我吃降压药」→ INT_MED_REMIND_SET",
    },
    {
      id: "med_remind_cancel",
      intent: "INT_MED_REMIND_CANCEL",
      pattern: "(取消|关闭|停用|开启|打开|启用).*(用药|吃药|服药).*(提醒|闹钟|定时)|(关闭|取消|删除|删|开启|打开|启用).*(第[零一二两三四五六七八九十百\\d]+|[零一二两三四五六七八九十百\\d]+)\\s*条",
      flags: "i",
      handling: "路由执行（取消/删除/开启提醒）",
      example: "「把吃药提醒关掉」「关闭第5条」「删除第2条」「开启第3条」→ INT_MED_REMIND_CANCEL",
    },
    {
      id: "med_log",
      intent: "INT_MED_ADD",
      pattern: "(添加|新增|记录|登记|写(一下)?|帮我(记|记录)).*(用药|吃药|药)",
      flags: "i",
      handling: "路由执行（写入用药）",
      example: "「帮我记录用药」→ INT_MED_ADD",
    },
    {
      id: "med_query",
      intent: "INT_MED_QUERY",
      pattern: "(查看|查询|看(看)?|今天|本周|最近).*(用药|吃药|药)",
      flags: "i",
      handling: "路由执行（查询用药）",
      example: "「今天吃药了吗」→ INT_MED_QUERY",
    },
    {
      id: "greet_polite",
      intent: "INT_SMALLTALK",
      // 解决：用户说「晚上好」未命中
      pattern: "^(你好|您好|嗨|hi|在吗|早上好|上午好|中午好|下午好|晚上好|晚安)$",
      flags: "i",
      handling: "直接返回（问候/在线确认）",
      example: "「晚上好」→ INT_SMALLTALK（直接回复问候）",
    },
    {
      id: "profile_view",
      intent: "INT_SMALLTALK",
      pattern: "(查看个人画像|我的画像|个人画像|查看画像|我要看我的个人画像|我就要看我的个人画像|给我看个人画像|显示个人画像)",
      flags: "i",
      handling: "路由执行（查看个人画像）",
      example: "「查看个人画像」「我要看我的个人画像」→ INT_SMALLTALK（查看个人画像）",
    },
    {
      id: "introduce",
      intent: "INT_SMALLTALK",
      pattern: "^(我是|我叫)[\\u4e00-\\u9fa5]{2,4}$|^我今年\\d{1,3}岁$|^我\\d{1,3}岁$",
      flags: "i",
      handling: "直接返回（自我介绍）",
      example: "「我叫张三」「我今年65岁」→ INT_SMALLTALK",
    },
    {
      id: "profile_info",
      intent: "INT_SMALLTALK",
      pattern: "(我的身高是|我的体重是|我今年\\d{1,3}岁|我\\d{1,3}岁|几岁了|今年几岁)",
      flags: "i",
      handling: "路由执行（提取用户画像）",
      example: "「我的身高是168」→ INT_SMALLTALK（用户画像信息）",
    },
    {
      id: "profile_name",
      intent: "INT_SMALLTALK",
      pattern: "(我叫|我是|姓名|名字是|我姓)[\\u4e00-\\u9fa5]{2,4}",
      flags: "i",
      handling: "路由执行（提取姓名）",
      example: "「我叫王大爷」→ INT_SMALLTALK（提取姓名）",
    },
    {
      id: "profile_gender",
      intent: "INT_SMALLTALK",
      pattern: "(我是男|我是女|我是大爷|我是阿姨)",
      flags: "i",
      handling: "路由执行（提取性别）",
      example: "「我是大爷」→ INT_SMALLTALK（提取性别男）",
    },
    {
      id: "profile_disease",
      intent: "INT_SMALLTALK",
      pattern: "(有|患有|得了|我有)(高血压|糖尿病|高血脂|冠心病|关节炎|哮喘|帕金森|脑梗|心梗)",
      flags: "i",
      handling: "路由执行（提取慢性病）",
      example: "「我有高血压和糖尿病」→ INT_SMALLTALK（提取慢性病）",
    },
    {
      id: "profile_allergy",
      intent: "INT_SMALLTALK",
      pattern: "(过敏|过敏史|对.*过敏|过敏体质)",
      flags: "i",
      handling: "路由执行（提取过敏史）",
      example: "「我对鸡蛋过敏」→ INT_SMALLTALK（提取过敏史）",
    },
    {
      id: "profile_family",
      intent: "INT_SMALLTALK",
      pattern: "(儿子|女儿|老伴|老婆|丈夫|妻子|孩子|父母|孙子|孙女|外孙|外孙女)",
      flags: "i",
      handling: "路由执行（提取家庭成员）",
      example: "「我有一个儿子」→ INT_SMALLTALK（提取家庭成员）",
    },
    {
      id: "recovered_ack",
      intent: "INT_SMALLTALK",
      pattern: "(好了|好些了|好多了|缓解了|没事了|不难受了).*(谢谢|感谢)?|(谢谢|感谢).*(好了|好些了|好多了|缓解了|没事了|不难受了)",
      flags: "i",
      handling: "直接返回（结束追问，礼貌收束）",
      example: "「我现在突然好了谢谢你」→ INT_SMALLTALK",
    },
    {
      id: "smalltalk_short",
      intent: "INT_SMALLTALK",
      pattern: "^(谢谢|辛苦了|再见|拜拜)$",
      flags: "i",
      handling: "直接返回",
      example: "「谢谢」→ INT_SMALLTALK",
    },
    {
      id: "med_log_by_action",
      intent: "INT_MED_ADD",
      // 解决：用户说「我晚上吃了布洛芬」未命中
      // 注意：排除"提醒"相关的关键词，避免与提醒设置混淆
      pattern:
        "^(?!.*提醒).*(吃了|吃过|吃完|服用|服了|吃药|用药|喝了(一)?(片|粒|包)?).*(降压药|布洛芬|阿司匹林|二甲双胍|降糖药|片|胶囊|药)",
      flags: "i",
      handling: "路由执行（写入用药：自动判定为用药记录）",
      example: "「我晚上吃了布洛芬」→ INT_MED_ADD（直路由）",
    },
  ],

  matchPolicy: {
    matchMode: "包含匹配为主 + 少量精确匹配",
    lengthLimit: 18,
    reason:
      "短句高频且歧义低适合正则直出；长句多意图/多参数更适合交给第二层抽取与消歧。",
  },
};

export function runFirstLayer(utterance) {
  for (const r of FIRST_LAYER.rules) {
    const re = new RegExp(r.pattern, r.flags);
    const m = utterance.match(re);
    if (!m) continue;

    const slots = {};
    if (r.intent === "INT_BP_ADD") {
      slots.bp_systolic = Number(m[1]);
      slots.bp_diastolic = Number(m[2]);
      slots.bp_unit = "mmHg";
    }
    if (r.intent === "INT_MED_REMIND_CANCEL") {
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
      const idxMatches = [...utterance.matchAll(/第\s*([零一二两三四五六七八九十\d]+)\s*条/g)];
      if (idxMatches.length > 0) {
        slots.reminderIndices = idxMatches.map(m => parseNum(m[1])).filter(n => n > 0);
      }
      if (!slots.reminderIndices || slots.reminderIndices.length === 0) {
        const singleMatch = utterance.match(/第?\s*([零一二两三四五六七八九十\d]+)\s*条/);
        if (singleMatch) {
          const n = parseNum(singleMatch[1]);
          if (n > 0) slots.reminderIndices = [n];
        }
      }
      // 检测操作区域：开启中 or 已关闭中
      if (/关闭.*中|已关闭/.test(utterance)) {
        slots.reminderSection = "disabled";
      } else if (/开启.*中|已开启/.test(utterance)) {
        slots.reminderSection = "enabled";
      }
    }

    return {
      hit: true,
      ruleId: r.id,
      intent: r.intent,
      slots,
      pattern: `/${r.pattern}/${r.flags}`,
      handling: r.handling,
    };
  }
  return { hit: false, ruleId: null, intent: null, slots: {}, pattern: null, handling: null };
}

export function firstLayerStats() {
  const totalKeywords = FIRST_LAYER.lexiconTable.reduce((sum, row) => sum + row.keywords.length, 0);
  return {
    totalKeywords,
    categories: FIRST_LAYER.lexiconTable.length,
    coveredScenes: [
      "日常问候/感谢/告别",
      "使用帮助",
      "用药提醒开关入口",
      "血压/血糖/体重强格式记录",
      "子女查看父母数据入口",
      "情绪关怀",
    ],
  };
}

