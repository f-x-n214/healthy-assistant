/**
 * 个人画像信息提取器
 * 
 * 从用户对话中自动提取以下个人画像信息：
 * - 姓名
 * - 年龄
 * - 性别
 * - 慢性病
 * - 体重
 * - 手机号
 * - 家庭成员
 * 
 * 支持从大模型提取结果和正则两种方式
 */

// 常见慢性病列表
const CHRONIC_DISEASES = [
  "高血压", "糖尿病", "高血脂", "冠心病", "关节炎",
  "哮喘", "肺气肿", "帕金森", "脑梗", "心梗",
  "慢性胃炎", "胃溃疡", "胆结石", "肾结石",
  "青光眼", "白内障", "骨质疏松", "甲状腺问题"
];

// 常见过敏原列表
const ALLERGENS = [
  "青霉素", "头孢", "阿莫西林", "磺胺", "阿司匹林",
  "海鲜", "虾", "蟹", "鱼", "鸡蛋", "牛奶",
  "花生", "大豆", "小麦", "花粉", "尘螨",
  "霉菌", "宠物毛", "酒精", "芒果", "菠萝"
];

// 家庭成员关系词
const FAMILY_RELATIONS = [
  { keyword: "儿子", relation: "son", label: "儿子" },
  { keyword: "女儿", relation: "daughter", label: "女儿" },
  { keyword: "女儿", relation: "daughter", label: "女儿" },
  { keyword: "老伴", relation: "spouse", label: "配偶" },
  { keyword: "老婆", relation: "spouse", label: "配偶" },
  { keyword: "丈夫", relation: "spouse", label: "配偶" },
  { keyword: "妻子", relation: "spouse", label: "配偶" },
  { keyword: "孩子", relation: "child", label: "子女" },
  { keyword: "儿女", relation: "children", label: "儿女" },
  { keyword: "孙子", relation: "grandson", label: "孙子" },
  { keyword: "孙女", relation: "granddaughter", label: "孙女" },
  { keyword: "外孙", relation: "grandson", label: "外孙" },
  { keyword: "外孙女", relation: "granddaughter", label: "外孙女" },
  { keyword: "妈妈", relation: "mother", label: "母亲" },
  { keyword: "爸爸", relation: "father", label: "父亲" },
  { keyword: "父母", relation: "parents", label: "父母" },
  { keyword: "弟弟", relation: "brother", label: "弟弟" },
  { keyword: "妹妹", relation: "sister", label: "妹妹" },
  { keyword: "哥哥", relation: "brother", label: "哥哥" },
  { keyword: "姐姐", relation: "sister", label: "姐姐" },
];

/**
 * 从大模型结果和用户输入中提取个人画像信息
 * @param {object} aiResult - 大模型返回结果
 * @param {string} utterance - 用户原始输入
 * @returns {object} 提取的画像信息
 */
export function extractProfileData(aiResult, utterance) {
  const result = {
    name: null,
    age: null,
    gender: null,
    height: null,
    weight: null,
    chronicDiseases: [],
    allergies: [],
    phone: null,
    familyMembers: [],
    source: "regex",
    confidence: 0.5
  };

  // 优先使用大模型提取的数据
  if (aiResult?.extractedData && Object.keys(aiResult.extractedData).length > 0) {
    const ed = aiResult.extractedData;
    
    if (ed.name || ed.userName || ed.patientName) {
      result.name = ed.name || ed.userName || ed.patientName;
    }
    
    if (ed.age !== undefined) {
      result.age = Number(ed.age);
    }
    
    if (ed.gender || ed.sex) {
      result.gender = ed.gender || ed.sex;
    }
    
    if (ed.chronicDisease || ed.disease || ed.illness) {
      const diseases = Array.isArray(ed.chronicDisease) 
        ? ed.chronicDisease 
        : (ed.chronicDisease || ed.disease || ed.illness).split(/[、，,]/);
      result.chronicDiseases = [...new Set(diseases.filter(d => d.trim()))];
    }
    
    if (ed.allergy || ed.allergies) {
      const allergies = Array.isArray(ed.allergy) 
        ? ed.allergy 
        : (ed.allergy || ed.allergies).split(/[、，,]/);
      result.allergies = [...new Set(allergies.filter(a => a.trim()))];
    }
    
    if (ed.height !== undefined) {
      result.height = Number(ed.height);
    }
    
    if (ed.weight !== undefined) {
      result.weight = Number(ed.weight);
    }
    
    if (ed.phone || ed.phoneNumber || ed.mobile) {
      result.phone = ed.phone || ed.phoneNumber || ed.mobile;
    }
    
    if (ed.familyMembers || ed.family) {
      result.familyMembers = Array.isArray(ed.familyMembers || ed.family)
        ? ed.familyMembers || ed.family
        : [];
    }
    
    if (ed.confidence) {
      result.confidence = ed.confidence;
    }
    
    result.source = "llm";
    return result;
  }

  // 降级：使用正则从用户输入中提取
  const u = utterance ?? "";
  
  // 提取姓名
  result.name = extractNameFromText(u);
  
  // 提取年龄
  result.age = extractAgeFromText(u);
  
  // 提取性别
  result.gender = extractGenderFromText(u);
  
  // 提取身高
  result.height = extractHeightFromText(u);
  
  // 提取体重
  result.weight = extractWeightFromText(u);
  
  // 提取慢性病
  result.chronicDiseases = extractChronicDiseases(u);
  
  // 提取过敏史
  result.allergies = extractAllergies(u);
  
  // 提取手机号
  result.phone = extractPhoneFromText(u);
  
  // 提取家庭成员
  result.familyMembers = extractFamilyMembers(u);
  
  // 计算置信度
  const filledFields = [result.name, result.age, result.gender, 
                        result.height, result.weight,
                        result.chronicDiseases.length > 0, 
                        result.allergies.length > 0,
                        result.phone, 
                        result.familyMembers.length > 0];
  const filledCount = filledFields.filter(Boolean).length;
  
  // 基础置信度
  let confidence = 0.3 + filledCount * 0.12;
  
  // 健康数据单独给予更高权重
  if (result.weight || result.height) {
    confidence += 0.1;
  }
  if (result.chronicDiseases.length > 0 || result.allergies.length > 0) {
    confidence += 0.1;
  }
  
  result.confidence = Math.min(confidence, 0.9);
  
  return result;
}

/**
 * 从文本中提取姓名
 */
function extractNameFromText(text) {
  const u = text ?? "";
  
  // 模式：我叫XXX / 我是XXX / 姓名XXX / 名字是XXX
  const namePatterns = [
    /我叫\s*([\u4e00-\u9fa5]{2,4})/,
    /我是\s*([\u4e00-\u9fa5]{2,4})/,
    /姓名\s*[：:]\s*([\u4e00-\u9fa5]{2,4})/,
    /名字\s*(?:是)?\s*([\u4e00-\u9fa5]{2,4})/,
    /姓\s*([\u4e00-\u9fa5]{1,2})\s*名\s*([\u4e00-\u9fa5]{1,3})/,
    /我姓\s*([\u4e00-\u9fa5]{1,2})/,
    /称呼\s*[：:]\s*([\u4e00-\u9fa5]{2,4})/
  ];
  
  for (const pattern of namePatterns) {
    const match = u.match(pattern);
    if (match) {
      // 如果是姓+名的模式，组合起来
      if (match[2]) {
        return match[1] + match[2];
      }
      return match[1];
    }
  }
  
  return null;
}

/**
 * 从文本中提取年龄
 */
function extractAgeFromText(text) {
  const u = text ?? "";
  
  // 匹配数字年龄
  const agePatterns = [
    /(?:今年|现在|我)\s*(\d{1,3})\s*岁/,
    /年龄\s*[：:]\s*(\d{1,3})/,
    /(\d{1,3})\s*岁(?:了)?/,
    /(?:今年|现在)\s*(\d{1,3})\s*(?:岁)?(?:了)?/
  ];
  
  for (const pattern of agePatterns) {
    const match = u.match(pattern);
    if (match) {
      const age = Number(match[1]);
      if (age > 0 && age <= 120) {
        return age;
      }
    }
  }
  
  return null;
}

/**
 * 从文本中提取性别
 */
function extractGenderFromText(text) {
  const u = text ?? "";
  
  if (/男(?:士|生|人)?/.test(u)) {
    return "男";
  }
  if (/女(?:士|生|人)?/.test(u)) {
    return "女";
  }
  
  // 通过称呼推断性别
  if (/我是大爷|我是大叔|我是伯父/.test(u)) {
    return "男";
  }
  if (/我是大妈|我是阿姨|我是伯母/.test(u)) {
    return "女";
  }
  
  return null;
}

/**
 * 从文本中提取慢性病
 */
function extractChronicDiseases(text) {
  const u = text ?? "";
  const diseases = [];
  
  for (const disease of CHRONIC_DISEASES) {
    if (u.includes(disease)) {
      diseases.push(disease);
    }
  }
  
  // 处理"有高血压和糖尿病"这种模式
  const combinedMatch = u.match(/(有|患有|得了)\s*([\u4e00-\u9fa5]+?)病?/);
  if (combinedMatch) {
    const diseaseStr = combinedMatch[2];
    // 尝试匹配多个疾病
    const diseaseNames = diseaseStr.split(/和|还有|、|，|,/);
    for (const name of diseaseNames) {
      const trimmed = name.trim();
      if (trimmed && !diseases.includes(trimmed)) {
        // 如果是部分匹配，添加完整疾病名
        const fullDisease = CHRONIC_DISEASES.find(d => d.includes(trimmed) || trimmed.includes(d));
        if (fullDisease && !diseases.includes(fullDisease)) {
          diseases.push(fullDisease);
        }
      }
    }
  }
  
  return [...new Set(diseases)];
}

/**
 * 从文本中提取身高
 */
function extractHeightFromText(text) {
  const u = text ?? "";
  
  const heightPatterns = [
    /(?:身高|我)\s*(?:是)?\s*(\d{2,3})\s*(?:厘米|cm)/,
    /(\d{2,3})\s*(?:厘米|cm)/,
    /身高\s*[：:]\s*(\d{2,3})/,
    /(?:身高|我)\s*(?:是)?\s*(\d{2,3})/
  ];
  
  for (const pattern of heightPatterns) {
    const match = u.match(pattern);
    if (match) {
      const height = Number(match[1]);
      if (height > 100 && height < 250) {
        return height;
      }
    }
  }
  
  return null;
}

/**
 * 从文本中提取体重
 */
function extractWeightFromText(text) {
  const u = text ?? "";
  
  const weightPatterns = [
    /(?:体重|我)\s*(?:是)?\s*(\d{2,3})\s*(?:公斤|kg|千克)/,
    /(\d{2,3})\s*(?:公斤|kg|千克)/,
    /体重\s*[：:]\s*(\d{2,3})/,
    /(?:体重|我)\s*(?:是)?\s*(\d{2,3})\s*(?:斤)/,
    /(\d{2,3})\s*(?:斤)/
  ];
  
  for (const pattern of weightPatterns) {
    const match = u.match(pattern);
    if (match) {
      let weight = Number(match[1]);
      // 如果是斤，转换为公斤
      if (pattern.source.includes('斤') && weight > 40 && weight < 400) {
        weight = Math.round(weight / 2);
      }
      if (weight > 20 && weight < 200) {
        return weight;
      }
    }
  }
  
  return null;
}

/**
 * 从文本中提取过敏史
 */
function extractAllergies(text) {
  const u = text ?? "";
  const allergies = [];
  
  // 检查是否有过敏相关词汇
  if (!/(过敏|过敏史|对.*过敏|过敏体质)/.test(u)) {
    return [];
  }
  
  // 匹配常见过敏原
  for (const allergen of ALLERGENS) {
    if (u.includes(allergen)) {
      allergies.push(allergen);
    }
  }
  
  // 处理"对XX过敏"这种模式
  const allergyPattern = /对\s*([\u4e00-\u9fa5]+?)\s*过敏/;
  const matches = u.match(allergyPattern);
  if (matches) {
    const allergyName = matches[1].trim();
    if (allergyName && !allergies.includes(allergyName)) {
      // 尝试匹配完整过敏原名称
      const fullAllergen = ALLERGENS.find(a => a.includes(allergyName) || allergyName.includes(a));
      if (fullAllergen && !allergies.includes(fullAllergen)) {
        allergies.push(fullAllergen);
      } else if (!allergies.includes(allergyName)) {
        allergies.push(allergyName);
      }
    }
  }
  
  // 处理"过敏XX"这种模式
  const allergyPattern2 = /过敏\s*([\u4e00-\u9fa5]+?)(?:、|，|,|和|还有|\s|$)/;
  const matches2 = u.match(allergyPattern2);
  if (matches2) {
    const allergyName = matches2[1].trim();
    if (allergyName && !allergies.includes(allergyName)) {
      const fullAllergen = ALLERGENS.find(a => a.includes(allergyName) || allergyName.includes(a));
      if (fullAllergen && !allergies.includes(fullAllergen)) {
        allergies.push(fullAllergen);
      } else if (!allergies.includes(allergyName)) {
        allergies.push(allergyName);
      }
    }
  }
  
  return [...new Set(allergies)];
}

/**
 * 从文本中提取手机号
 */
function extractPhoneFromText(text) {
  const u = text ?? "";
  
  // 匹配中国大陆手机号
  const phonePattern = /1[3-9]\d{9}/;
  const match = u.match(phonePattern);
  
  if (match) {
    return match[0];
  }
  
  return null;
}

/**
 * 从文本中提取家庭成员
 */
function extractFamilyMembers(text) {
  const u = text ?? "";
  const members = [];
  
  for (const family of FAMILY_RELATIONS) {
    if (u.includes(family.keyword)) {
      // 尝试提取具体姓名或描述
      const nameMatch = u.match(new RegExp(`${family.keyword}(?:叫)?\\s*([\\u4e00-\\u9fa5]{2,4})`));
      members.push({
        relation: family.relation,
        label: family.label,
        name: nameMatch ? nameMatch[1] : null
      });
    }
  }
  
  // 处理"有一个儿子一个女儿"这种模式
  const countPattern = /(\d+)\s*(个)?\s*(儿子|女儿|孩子|孙子|孙女)/;
  const countMatches = u.match(countPattern);
  if (countMatches) {
    const count = Number(countMatches[1]);
    const relation = countMatches[3];
    const found = FAMILY_RELATIONS.find(f => f.keyword === relation);
    if (found) {
      for (let i = 0; i < count; i++) {
        members.push({
          relation: found.relation,
          label: found.label,
          name: null,
          count: count
        });
      }
    }
  }
  
  // 去重
  const uniqueMembers = [];
  const seen = new Set();
  for (const m of members) {
    const key = `${m.relation}-${m.name || 'unknown'}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueMembers.push(m);
    }
  }
  
  return uniqueMembers;
}

/**
 * 判断提取的数据是否值得更新到画像中
 */
export function shouldUpdateProfile(extracted) {
  // 如果没有提取到任何有效信息，不更新
  const hasInfo = extracted.name || extracted.age || extracted.gender ||
                  extracted.height || extracted.weight ||
                  extracted.chronicDiseases.length > 0 || extracted.allergies.length > 0 ||
                  extracted.phone || extracted.familyMembers.length > 0;
  
  return hasInfo && extracted.confidence >= 0.5;
}

/**
 * 将提取的信息合并到现有画像中
 */
export function mergeProfileData(existingProfile, extractedData) {
  const merged = { ...existingProfile };
  
  if (extractedData.name && !merged.name) {
    merged.name = extractedData.name;
  }
  
  if (extractedData.age && !merged.age) {
    merged.age = extractedData.age;
  }
  
  if (extractedData.gender && !merged.gender) {
    merged.gender = extractedData.gender;
  }
  
  // 身高总是更新为最新值
  if (extractedData.height) {
    merged.height = extractedData.height;
  }
  
  // 体重总是更新为最新值
  if (extractedData.weight) {
    merged.weight = extractedData.weight;
  }
  
  if (extractedData.phone && !merged.phone) {
    merged.phone = extractedData.phone;
  }
  
  // 合并慢性病列表（去重）
  if (extractedData.chronicDiseases && extractedData.chronicDiseases.length > 0) {
    const existingDiseases = merged.chronicDiseases || [];
    merged.chronicDiseases = [...new Set([...existingDiseases, ...extractedData.chronicDiseases])];
  }
  
  // 合并过敏史列表（去重）
  if (extractedData.allergies && extractedData.allergies.length > 0) {
    const existingAllergies = merged.allergies || [];
    merged.allergies = [...new Set([...existingAllergies, ...extractedData.allergies])];
  }
  
  // 合并家庭成员（去重）
  if (extractedData.familyMembers && extractedData.familyMembers.length > 0) {
    const existingMembers = merged.familyMembers || [];
    const existingKeys = new Set(existingMembers.map(m => `${m.relation}-${m.name || ''}`));
    
    for (const member of extractedData.familyMembers) {
      const key = `${member.relation}-${member.name || ''}`;
      if (!existingKeys.has(key)) {
        existingMembers.push(member);
        existingKeys.add(key);
      }
    }
    merged.familyMembers = existingMembers;
  }
  
  return merged;
}