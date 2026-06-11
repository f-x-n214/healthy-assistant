/**
 * 健康顾问 - 根据用户画像和输入内容提供个性化建议
 * 基于用户的慢性病史、用药情况等长期记忆数据
 */

/**
 * 慢性疾病与饮食禁忌映射
 */
const DISEASE_FOOD_ADVICE = {
  "高血压": {
    badFoods: ["油条", "奶油蛋糕", "肥肉", "咸菜", "腊肉", "火腿", "方便面", "卤味", "咸鱼", "薯片", "炸鸡", "烧烤"],
    badReasons: {
      "油条": "油条属于油炸食品，高脂肪高热量，长期食用会导致体重增加，不利于血压控制",
      "奶油蛋糕": "奶油蛋糕含有大量糖分和脂肪，容易引起血糖波动和体重增加，对血压控制不利",
      "肥肉": "肥肉脂肪含量高，会增加血液黏稠度，加重血管负担",
      "咸菜": "咸菜含盐量极高，长期过量摄入会导致水钠潴留，升高血压",
      "腊肉": "腊肉属于高盐高脂食物，不利于血压稳定",
      "火腿": "火腿加工肉类，含盐量高，对血压控制不利",
      "方便面": "方便面高盐高油，长期食用影响血压控制",
      "卤味": "卤味通常含盐量很高，不利于血压控制",
      "咸鱼": "咸鱼含盐量极高，是高血压患者需要严格控制的食物",
      "薯片": "薯片高盐高油，不利于健康",
      "炸鸡": "炸鸡高脂肪高热量，会增加体重",
      "烧烤": "烧烤食物通常高盐高油，对血压控制不利"
    },
    suggestions: [
      "建议减少高盐食物摄入，每天食盐控制在5克以内",
      "多吃新鲜蔬菜和水果，补充钾元素有助于降压",
      "选择清蒸、水煮、凉拌等健康烹饪方式",
      "控制体重，避免超重和肥胖",
      "规律运动，每周至少150分钟中等强度运动"
    ]
  },
  "2型糖尿病": {
    badFoods: ["奶油蛋糕", "糖果", "巧克力", "奶茶", "蜂蜜", "荔枝", "芒果", "西瓜", "油条", "白米饭", "白面包"],
    badReasons: {
      "奶油蛋糕": "奶油蛋糕含糖量极高，会导致血糖急剧升高",
      "糖果": "糖果属于精制糖，会快速升高血糖",
      "巧克力": "巧克力含糖量高，对血糖控制不利",
      "奶茶": "奶茶含糖量通常很高，不利于血糖控制",
      "蜂蜜": "蜂蜜虽然是天然食品，但含糖量高，需要严格控制",
      "荔枝": "荔枝含糖量较高，糖尿病患者应少吃",
      "芒果": "芒果含糖量较高，需要控制食用量",
      "西瓜": "西瓜升糖指数较高，糖尿病患者应适量食用",
      "油条": "油条属于精制碳水化合物，升糖较快",
      "白米饭": "白米饭升糖指数较高，建议搭配粗粮",
      "白面包": "白面包属于精制碳水，升糖较快"
    },
    suggestions: [
      "控制主食量，每餐不超过一个拳头大小",
      "多吃粗粮和杂豆，延缓血糖上升",
      "避免含糖饮料和甜点",
      "定时定量进餐，不要暴饮暴食",
      "餐后适当运动，帮助降低血糖"
    ]
  },
  "高血脂": {
    badFoods: ["肥肉", "炸鸡", "油条", "奶油蛋糕", "薯片", "烧烤", "黄油", "动物内脏", "鱿鱼", "鱼子"],
    badReasons: {
      "肥肉": "肥肉饱和脂肪含量高，会升高血脂",
      "炸鸡": "炸鸡高脂肪高热量，不利于血脂控制",
      "油条": "油条油炸食品，脂肪含量高",
      "奶油蛋糕": "奶油蛋糕含有大量脂肪和糖分",
      "薯片": "薯片高油高盐，不利于健康",
      "烧烤": "烧烤食物脂肪含量高，还可能产生有害物质",
      "黄油": "黄油饱和脂肪含量高",
      "动物内脏": "动物内脏胆固醇含量极高",
      "鱿鱼": "鱿鱼胆固醇含量较高",
      "鱼子": "鱼子胆固醇含量很高"
    },
    suggestions: [
      "减少动物脂肪摄入，选择橄榄油、茶籽油等植物油",
      "多吃富含膳食纤维的食物",
      "每周吃2-3次鱼，补充Omega-3脂肪酸",
      "控制体重，避免肥胖",
      "戒烟限酒"
    ]
  },
  "冠心病": {
    badFoods: ["肥肉", "炸鸡", "油条", "奶油蛋糕", "咸菜", "腊肉", "动物内脏", "烧烤", "薯片"],
    badReasons: {
      "肥肉": "肥肉会增加血液黏稠度，加重心脏负担",
      "炸鸡": "炸鸡高脂肪，不利于心血管健康",
      "油条": "油条油炸食品，对心血管不利",
      "奶油蛋糕": "奶油蛋糕高糖高脂，增加心血管风险",
      "咸菜": "咸菜高盐，会升高血压，增加心脏负担",
      "腊肉": "腊肉高盐高脂，不利于心血管健康",
      "动物内脏": "动物内脏胆固醇含量高",
      "烧烤": "烧烤食物可能含有有害物质",
      "薯片": "薯片高盐高油，不利于健康"
    },
    suggestions: [
      "饮食清淡，少油少盐",
      "多吃蔬菜和水果",
      "选择瘦肉和鱼类",
      "规律运动，避免剧烈运动",
      "保持情绪稳定，避免过度激动"
    ]
  }
};

/**
 * 检查食物是否适合用户
 * @param {string[]} foods - 食物列表
 * @param {string[]} diseases - 用户的慢性病史
 * @returns {object} 包含需要注意的食物和建议
 */
export function checkFoodForDiseases(foods, diseases) {
  const warnings = [];
  const allSuggestions = new Set();

  for (const disease of diseases) {
    const advice = DISEASE_FOOD_ADVICE[disease];
    if (!advice) continue;

    for (const food of foods) {
      if (advice.badFoods.includes(food)) {
        warnings.push({
          food,
          disease,
          reason: advice.badReasons[food] || `${food}不适合${disease}患者食用`
        });
      }
    }

    // 添加该疾病的通用建议
    advice.suggestions.forEach(s => allSuggestions.add(s));
  }

  return {
    warnings,
    suggestions: Array.from(allSuggestions)
  };
}

/**
 * 生成个性化健康建议文本
 * @param {string[]} foods - 食物列表
 * @param {string[]} diseases - 用户的慢性病史
 * @returns {string} 建议文本
 */
export function generateFoodAdvice(foods, diseases) {
  const result = checkFoodForDiseases(foods, diseases);
  
  if (result.warnings.length === 0) {
    return "";
  }

  let adviceText = "\n\n【健康提醒】根据您的健康状况，有几点需要注意：\n";
  
  // 按疾病分组显示警告
  const warningsByDisease = {};
  for (const warning of result.warnings) {
    if (!warningsByDisease[warning.disease]) {
      warningsByDisease[warning.disease] = [];
    }
    warningsByDisease[warning.disease].push(warning);
  }

  for (const [disease, diseaseWarnings] of Object.entries(warningsByDisease)) {
    adviceText += `\n📌 您有${disease}，以下食物建议少吃：\n`;
    for (const warning of diseaseWarnings) {
      adviceText += `   • ${warning.food}：${warning.reason}\n`;
    }
  }

  // 添加建议
  if (result.suggestions.length > 0) {
    adviceText += "\n💡 给您的建议：\n";
    result.suggestions.slice(0, 3).forEach((s, i) => {
      adviceText += `   ${i + 1}. ${s}\n`;
    });
  }

  return adviceText;
}

/**
 * 从文本中提取食物名称
 * @param {string} text - 用户输入文本
 * @returns {string[]} 提取的食物列表
 */
export function extractFoodsFromText(text) {
  const foodList = [
    "油条", "奶油蛋糕", "肥肉", "咸菜", "腊肉", "火腿", "方便面", 
    "卤味", "咸鱼", "薯片", "炸鸡", "烧烤", "糖果", "巧克力", 
    "奶茶", "蜂蜜", "荔枝", "芒果", "西瓜", "白米饭", "白面包",
    "黄油", "动物内脏", "鱿鱼", "鱼子", "苹果", "香蕉", "米饭",
    "面条", "馒头", "鸡蛋", "牛奶", "青菜", "粥", "饺子", "包子"
  ];
  
  const foundFoods = [];
  for (const food of foodList) {
    if (text.includes(food)) {
      foundFoods.push(food);
    }
  }
  
  return foundFoods;
}

function normalizeDiseases(diseases) {
  return (diseases || []).map((d) => {
    if (/糖尿病|高血糖/.test(d)) return "2型糖尿病";
    return d;
  });
}

/**
 * 根据运动记录生成个性化建议
 */
export function getExerciseAdviceFromRecords(records, { days = 7, profile } = {}) {
  const list = records || [];
  const count = list.length;
  let totalMinutes = 0;
  let withDuration = 0;
  list.forEach((r) => {
    if (r.duration) {
      withDuration++;
      totalMinutes += r.durationUnit === "小时" ? r.duration * 60 : r.duration;
    }
  });

  const diseases = profile?.chronicDiseases || [];
  const hasHypertension = diseases.some((d) => /高血压/.test(d));
  const hasDiabetes = diseases.some((d) => /糖尿病|高血糖/.test(d));
  const hasKneeIssue = diseases.some((d) => /关节|膝盖/.test(d));
  const rangeText = days === 1 ? "今天" : days === 7 ? "本周" : days === 30 ? "本月" : `最近${days}天`;

  if (count === 0) {
    let tip = "建议每周运动3～5次，每次20～30分钟，可从散步、太极拳等温和运动开始。";
    if (hasHypertension) tip = "您有高血压，建议每天散步20～30分钟，分早晚两次，对控制血压很有帮助。";
    else if (hasDiabetes) tip = "您有糖尿病，建议餐后散步15～20分钟，有助于平稳血糖。";
    else if (hasKneeIssue) tip = "有关节不适，建议选游泳、太极等低冲击运动，避免爬山和深蹲。";
    return `\n\n【建议】${tip}\n说「今天散步了30分钟」即可帮您记录。`;
  }

  const lines = ["\n\n【建议】"];

  if (totalMinutes > 0) {
    const target = days === 7 ? 150 : days === 30 ? 600 : days === 1 ? 20 : Math.round(150 * days / 7);
    if (totalMinutes >= target) {
      lines.push(`${rangeText}累计运动约${totalMinutes}分钟，运动量不错，请继续保持！`);
    } else if (totalMinutes >= target * 0.6) {
      lines.push(`${rangeText}累计约${totalMinutes}分钟，接近推荐量。可逐步增至${days === 7 ? "每周150分钟" : "每天20～30分钟"}左右。`);
    } else {
      lines.push(`${rangeText}累计约${totalMinutes}分钟，偏少。建议逐步增加，${days === 7 ? "每周至少150分钟" : "每天20～30分钟"}中等强度活动。`);
    }
  } else {
    lines.push("记录中缺少运动时长，下次可说「散步30分钟」，方便帮您统计和给出更准建议。");
  }

  const minFreq = days === 7 ? 3 : days === 30 ? 12 : 1;
  if (count < minFreq) {
    lines.push(`${rangeText}运动${count}次，频率偏低，建议每周至少3～5次，养成习惯。`);
  }

  if (hasHypertension) {
    lines.push("💡 您有高血压：优选散步、太极等温和有氧，避免憋气和剧烈运动，运动后注意监测血压。");
  } else if (hasDiabetes) {
    lines.push("💡 您有糖尿病：餐后1小时散步最佳，运动前不宜空腹，穿舒适鞋子，随身带颗糖防低血糖。");
  } else if (hasKneeIssue) {
    lines.push("💡 有关节不适：避免爬山、久蹲，可选游泳、骑固定单车等低冲击运动。");
  } else {
    lines.push("💡 运动前简单热身5分钟，结束后拉伸放松；如感到胸闷、头晕，请立即停止休息。");
  }

  return lines.join("\n");
}

/**
 * 根据饮食记录生成个性化建议
 */
export function getDietAdviceFromRecords(records, { days = 7, profile } = {}) {
  const list = records || [];
  const count = list.length;
  const rangeText = days === 1 ? "今天" : days === 7 ? "本周" : days === 30 ? "本月" : `最近${days}天`;

  if (count === 0) {
    return `\n\n【建议】均衡饮食对健康管理很重要。建议每餐有蔬菜、适量主食和优质蛋白，少盐少油。\n说「中午吃了米饭和青菜」即可帮您记录。`;
  }

  const allFoods = [];
  let missingFoodDetail = 0;
  list.forEach((r) => {
    if (Array.isArray(r.foods) && r.foods.length > 0) allFoods.push(...r.foods);
    else missingFoodDetail++;
  });
  const uniqueFoods = [...new Set(allFoods)];

  const lines = ["\n\n【建议】"];

  const diseases = normalizeDiseases(profile?.chronicDiseases);
  if (uniqueFoods.length > 0 && diseases.length > 0) {
    const foodAdvice = generateFoodAdvice(uniqueFoods, diseases);
    if (foodAdvice) {
      lines.push(foodAdvice.replace(/^\n\n/, ""));
    }
  }

  const minMeals = days === 1 ? 2 : days === 7 ? 6 : 20;
  if (count < minMeals) {
    lines.push(`${rangeText}饮食记录${count}条，记录偏少。建议早中晚都记一下，方便分析是否均衡。`);
  }

  if (missingFoodDetail > 0) {
    lines.push(`有${missingFoodDetail}条未写明具体食物，下次可说「午餐吃了米饭、青菜和鱼」，分析会更准确。`);
  }

  const carbFoods = uniqueFoods.filter((f) => /米饭|面条|馒头|包子|饺子|焖面|油条|白面包/.test(f));
  const vegFoods = uniqueFoods.filter((f) => /青菜|菠菜|芹菜|西兰花|蔬菜|沙拉|番茄|黄瓜/.test(f));
  if (carbFoods.length >= 2 && vegFoods.length === 0) {
    lines.push("主食偏多、蔬菜偏少，建议每餐搭配一把蔬菜，有助于控制血糖和血压。");
  } else if (vegFoods.length >= 2 && carbFoods.length === 0) {
    lines.push("蔬菜摄入不错，注意搭配适量主食和优质蛋白（鱼、蛋、豆制品），营养更均衡。");
  }

  const hasHypertension = diseases.some((d) => /高血压/.test(d));
  const hasDiabetes = diseases.some((d) => /2型糖尿病|糖尿病/.test(d));
  if (lines.length === 1) {
    if (hasHypertension) {
      lines.push("整体饮食记录尚可。高血压建议每天食盐不超过5克，少吃咸菜、腊肉，多用清蒸、水煮。");
    } else if (hasDiabetes) {
      lines.push("整体饮食记录尚可。糖尿病建议定时定量，每餐主食约一个拳头大小，少喝含糖饮料。");
    } else {
      lines.push("饮食记录整体尚可，继续保持少盐少油、定时定量，有问题随时问我。");
    }
  }

  return lines.join("\n");
}
