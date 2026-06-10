/**
 * 记忆系统 - 测试脚本
 * 
 * 在浏览器控制台中运行：
 * import('./intent/memoryTest.js').then(m => m.runAllTests())
 */

import { MemoryService } from "./memoryService.js";
import {
  extractMedicationData,
  extractBloodPressureData,
  extractBloodSugarData,
  extractWeightData,
  extractEmotionData,
  extractReminderData,
} from "./dataExtractor.js";

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    passCount++;
    console.log(`  ✅ PASS: ${message}`);
  } else {
    failCount++;
    console.error(`  ❌ FAIL: ${message}`);
  }
}

// ==================== 测试 MemoryCache ====================

async function testMemoryCache() {
  console.log("\n=== 测试 MemoryCache ===");
  const { MemoryCache } = await import("./memoryCache.js");
  const cache = new MemoryCache();

  // 测试基本读写
  cache.set("key1", { name: "test" }, "profile");
  const data = cache.get("key1", "profile");
  assert(data !== null, "缓存写入后可以读取");
  assert(data.name === "test", "缓存数据内容正确");

  // 测试会话级缓存不过期
  cache.set("key2", { value: 123 }, "profile");
  const data2 = cache.get("key2", "profile");
  assert(data2 !== null, "会话级缓存(profile)不过期");

  // 测试失效
  cache.invalidate("key1");
  const data3 = cache.get("key1", "profile");
  assert(data3 === null, "invalidate后缓存为null");

  // 测试按类型失效
  cache.set("a", 1, "records");
  cache.set("b", 2, "records");
  cache.invalidateByType("records");
  assert(cache.get("a", "records") === null, "invalidateByType后缓存a为null");
  assert(cache.get("b", "records") === null, "invalidateByType后缓存b为null");

  // 测试统计
  cache.set("x", 1, "profile");
  cache.set("y", 2, "records");
  const stats = cache.stats();
  assert(stats.total === 2, "缓存统计总数正确");

  console.log(`  MemoryCache: ${passCount} passed, ${failCount} failed`);
}

// ==================== 测试 MemoryService ====================

async function testMemoryService() {
  console.log("\n=== 测试 MemoryService ===");
  const prevPass = passCount;
  const prevFail = failCount;

  const ms = new MemoryService("test_user");

  // 测试用户画像
  const profile = await ms.loadProfile();
  assert(profile !== null, "loadProfile返回非null");
  assert(profile.userId === "test_user", "用户画像userId正确");

  const updated = await ms.updateProfile({ name: "测试用户", age: 70 });
  assert(updated.name === "测试用户", "updateProfile更新name成功");
  assert(updated.age === 70, "updateProfile更新age成功");

  // 测试核心记忆
  const memory = await ms.loadMemory();
  assert(memory !== null, "loadMemory返回非null");
  assert(Array.isArray(memory.milestones), "核心记忆milestones是数组");

  // 测试用药记录
  const med = await ms.saveMedication({
    drugName: "阿司匹林",
    dose: { amount: 1, unit: "片" },
    time: new Date().toISOString(),
    person: "self",
    source: "test",
  });
  assert(med.id.startsWith("med_"), "用药记录id以med_开头");
  assert(med.drugName === "阿司匹林", "用药记录drugName正确");

  // 测试血压记录
  const bp = await ms.saveBloodPressure({
    systolic: 145,
    diastolic: 92,
    unit: "mmHg",
    time: new Date().toISOString(),
    source: "test",
  });
  assert(bp.id.startsWith("bp_"), "血压记录id以bp_开头");
  assert(bp.systolic === 145, "血压记录systolic正确");
  assert(bp.diastolic === 92, "血压记录diastolic正确");

  // 测试查询
  const medRecords = await ms.queryMedications(7);
  assert(medRecords.length >= 1, "查询用药记录返回至少1条");

  const bpRecords = await ms.queryBloodPressure(7);
  assert(bpRecords.length >= 1, "查询血压记录返回至少1条");

  // 测试提醒
  const reminder = await ms.addReminder({
    type: "medication",
    drugName: "阿司匹林",
    time: "08:00",
    frequency: "daily",
  });
  assert(reminder.id.startsWith("remind_"), "提醒id以remind_开头");
  assert(reminder.enabled === true, "新提醒默认enabled为true");

  // 测试情绪记录
  const emotion = await ms.saveEmotion({
    type: "lonely",
    text: "一个人在家很闷",
  });
  assert(emotion.records.length >= 1, "情绪记录保存成功");

  // 测试健康事件
  const event = await ms.saveEvent({
    type: "urgent",
    description: "胸痛",
    riskLevel: "URGENT",
  });
  assert(event.records.length >= 1, "健康事件保存成功");

  // 测试里程碑
  const milestone = await ms.addMilestone({
    type: "first_record",
    name: "初次记录",
    message: "恭喜！",
    badge: "first_step",
  });
  assert(milestone !== null, "里程碑添加成功");

  // 测试重复里程碑不添加
  const milestone2 = await ms.addMilestone({
    type: "first_record",
    name: "初次记录",
    message: "恭喜！",
    badge: "first_step",
  });
  assert(milestone2 === null, "重复里程碑不添加");

  // 测试数据导出
  const exported = await ms.exportAllData();
  assert(exported.userId === "test_user", "导出数据userId正确");
  assert(exported.profile.name === "测试用户", "导出用户画像正确");

  // 测试健康摘要
  const summary = await ms.getHealthSummary(7);
  assert(summary.medicationCount >= 1, "健康摘要用药记录数正确");
  assert(summary.bpCount >= 1, "健康摘要血压记录数正确");

  // 清理测试数据
  await ms.clearAllData();
  console.log(`  MemoryService: ${passCount - prevPass} passed, ${failCount - prevFail} failed`);
}

// ==================== 测试 DataExtractor ====================

async function testDataExtractor() {
  console.log("\n=== 测试 DataExtractor ===");
  const prevPass = passCount;
  const prevFail = failCount;

  // 测试用药数据提取 - 大模型结果
  const medData1 = extractMedicationData(
    { extractedData: { drugName: "阿司匹林", dose: { amount: 1, unit: "片" } } },
    "我今天吃了阿司匹林一片"
  );
  assert(medData1.drugName === "阿司匹林", "大模型提取用药drugName正确");
  assert(medData1.source === "llm", "大模型提取source为llm");

  // 测试用药数据提取 - 正则降级
  const medData2 = extractMedicationData({}, "我今天吃了布洛芬2片");
  assert(medData2.drugName === "布洛芬", "正则提取用药drugName正确");
  assert(medData2.source === "regex", "正则提取source为regex");
  assert(medData2.dose.amount === 2, "正则提取剂量正确");

  // 测试血压数据提取 - 大模型结果
  const bpData1 = extractBloodPressureData(
    { extractedData: { systolic: 145, diastolic: 92 } },
    "血压145/92"
  );
  assert(bpData1.systolic === 145, "大模型提取血压systolic正确");
  assert(bpData1.diastolic === 92, "大模型提取血压diastolic正确");
  assert(bpData1.source === "llm", "大模型提取source为llm");

  // 测试血压数据提取 - 正则降级
  const bpData2 = extractBloodPressureData({}, "血压150/90");
  assert(bpData2.systolic === 150, "正则提取血压systolic正确");
  assert(bpData2.diastolic === 90, "正则提取血压diastolic正确");
  assert(bpData2.source === "regex", "正则提取source为regex");

  // 测试血压单值提取
  const bpData3 = extractBloodPressureData({}, "今天血压145");
  assert(bpData3.systolic === 145, "正则提取血压单值systolic正确");
  assert(bpData3.diastolic === null, "正则提取血压单值diastolic为null");

  // 测试血糖数据提取
  const bsData = extractBloodSugarData(
    { extractedData: { value: 6.2, type: "fasting" } },
    "空腹血糖6.2"
  );
  assert(bsData.value === 6.2, "大模型提取血糖value正确");
  assert(bsData.type === "fasting", "大模型提取血糖type正确");

  // 测试体重数据提取
  const wtData = extractWeightData(
    { extractedData: { value: 68, unit: "kg" } },
    "体重68公斤"
  );
  assert(wtData.value === 68, "大模型提取体重value正确");

  // 测试情绪数据提取
  const emoData = extractEmotionData("一个人在家很闷");
  assert(emoData !== null, "情绪数据提取成功");
  assert(emoData.type === "bored", "情绪类型识别为bored");

  const emoData2 = extractEmotionData("我好孤独");
  assert(emoData2 !== null, "孤独情绪提取成功");
  assert(emoData2.type === "lonely", "情绪类型识别为lonely");

  // 测试提醒数据提取
  const remindData = extractReminderData({}, "每天早上8点提醒我吃阿司匹林");
  assert(remindData.type === "medication", "提醒类型识别为medication");
  assert(remindData.time === "08:00", "提醒时间提取正确");
  assert(remindData.drugName === "阿司匹林", "提醒药名提取正确");

  console.log(`  DataExtractor: ${passCount - prevPass} passed, ${failCount - prevFail} failed`);
}

// ==================== 运行所有测试 ====================

export async function runAllTests() {
  console.log("========================================");
  console.log("  银发健康助手 - 记忆系统测试");
  console.log("========================================");

  passCount = 0;
  failCount = 0;

  await testMemoryCache();
  await testMemoryService();
  await testDataExtractor();

  console.log("\n========================================");
  console.log(`  总计: ${passCount + failCount} 个测试`);
  console.log(`  通过: ${passCount} ✅`);
  console.log(`  失败: ${failCount} ❌`);
  console.log("========================================");

  return { total: passCount + failCount, passed: passCount, failed: failCount };
}
