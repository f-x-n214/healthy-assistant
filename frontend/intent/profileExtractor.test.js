/**
 * 个人画像提取器测试
 */

import { extractProfileData, shouldUpdateProfile, mergeProfileData } from "./profileExtractor.js";

// 测试数据
const testCases = [
  {
    name: "提取姓名",
    utterance: "我叫王大爷",
    expected: { name: "王大爷", confidence: 0.6 }
  },
  {
    name: "提取年龄",
    utterance: "我今年70岁了",
    expected: { age: 70, confidence: 0.6 }
  },
  {
    name: "提取性别-男",
    utterance: "我是大爷",
    expected: { gender: "男", confidence: 0.6 }
  },
  {
    name: "提取性别-女",
    utterance: "我是阿姨",
    expected: { gender: "女", confidence: 0.6 }
  },
  {
    name: "提取慢性病",
    utterance: "我有高血压和糖尿病",
    expected: { chronicDiseases: ["高血压", "糖尿病"], confidence: 0.6 }
  },
  {
    name: "提取体重",
    utterance: "我的体重是65公斤",
    expected: { weight: 65, confidence: 0.6 }
  },
  {
    name: "提取手机号",
    utterance: "我的手机号是13812345678",
    expected: { phone: "13812345678", confidence: 0.6 }
  },
  {
    name: "提取家庭成员",
    utterance: "我有一个儿子和一个女儿",
    expected: { familyMembers: [{ relation: "son", label: "儿子", name: null, count: 1 }, { relation: "daughter", label: "女儿", name: null, count: 1 }], confidence: 0.6 }
  },
  {
    name: "提取完整信息",
    utterance: "我叫王大爷，今年70岁，男，有高血压，体重65公斤",
    expected: { name: "王大爷", age: 70, gender: "男", chronicDiseases: ["高血压"], weight: 65, confidence: 0.9 }
  }
];

// 运行测试
function runTests() {
  console.log("=== 个人画像提取器测试 ===");
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`\n测试: ${testCase.name}`);
    console.log(`输入: "${testCase.utterance}"`);
    
    const result = extractProfileData(null, testCase.utterance);
    console.log(`输出:`, JSON.stringify(result, null, 2));
    
    // 验证关键字段
    let allPassed = true;
    const expected = testCase.expected;
    
    if (expected.name !== undefined && result.name !== expected.name) {
      console.log(`❌ 姓名不匹配: 期望 "${expected.name}", 实际 "${result.name}"`);
      allPassed = false;
    }
    
    if (expected.age !== undefined && result.age !== expected.age) {
      console.log(`❌ 年龄不匹配: 期望 ${expected.age}, 实际 ${result.age}`);
      allPassed = false;
    }
    
    if (expected.gender !== undefined && result.gender !== expected.gender) {
      console.log(`❌ 性别不匹配: 期望 "${expected.gender}", 实际 "${result.gender}"`);
      allPassed = false;
    }
    
    if (expected.weight !== undefined && result.weight !== expected.weight) {
      console.log(`❌ 体重不匹配: 期望 ${expected.weight}, 实际 ${result.weight}`);
      allPassed = false;
    }
    
    if (expected.phone !== undefined && result.phone !== expected.phone) {
      console.log(`❌ 手机号不匹配: 期望 "${expected.phone}", 实际 "${result.phone}"`);
      allPassed = false;
    }
    
    if (expected.chronicDiseases !== undefined) {
      const expectedDiseases = expected.chronicDiseases.sort();
      const actualDiseases = (result.chronicDiseases || []).sort();
      if (JSON.stringify(expectedDiseases) !== JSON.stringify(actualDiseases)) {
        console.log(`❌ 慢性病不匹配: 期望 ${expectedDiseases}, 实际 ${actualDiseases}`);
        allPassed = false;
      }
    }
    
    if (expected.confidence !== undefined && result.confidence < expected.confidence - 0.1) {
      console.log(`❌ 置信度偏低: 期望 ${expected.confidence}, 实际 ${result.confidence}`);
      allPassed = false;
    }
    
    if (allPassed) {
      console.log("✅ 通过");
      passed++;
    } else {
      console.log("❌ 失败");
      failed++;
    }
  }
  
  // 测试合并功能
  console.log("\n=== 测试合并功能 ===");
  const existingProfile = { name: "张大爷", age: 65, chronicDiseases: ["高血压"] };
  const extractedData = { age: 70, gender: "男", weight: 65 };
  const merged = mergeProfileData(existingProfile, extractedData);
  
  console.log("现有画像:", JSON.stringify(existingProfile));
  console.log("提取数据:", JSON.stringify(extractedData));
  console.log("合并结果:", JSON.stringify(merged));
  
  if (merged.name === "张大爷" && merged.age === 70 && merged.gender === "男" && merged.weight === 65 && merged.chronicDiseases.includes("高血压")) {
    console.log("✅ 合并测试通过");
    passed++;
  } else {
    console.log("❌ 合并测试失败");
    failed++;
  }
  
  // 测试shouldUpdateProfile
  console.log("\n=== 测试shouldUpdateProfile ===");
  const emptyData = { name: null, age: null, gender: null, chronicDiseases: [], weight: null, phone: null, familyMembers: [], confidence: 0.5 };
  const validData = { name: "李大爷", age: 75, confidence: 0.7 };
  
  console.log("空数据 shouldUpdate:", shouldUpdateProfile(emptyData));
  console.log("有效数据 shouldUpdate:", shouldUpdateProfile(validData));
  
  if (!shouldUpdateProfile(emptyData) && shouldUpdateProfile(validData)) {
    console.log("✅ shouldUpdateProfile测试通过");
    passed++;
  } else {
    console.log("❌ shouldUpdateProfile测试失败");
    failed++;
  }
  
  console.log(`\n=== 测试结果: ${passed} 个通过, ${failed} 个失败 ===`);
  
  return failed === 0;
}

// 导出测试函数
export { runTests };

// 如果直接运行该文件则执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}