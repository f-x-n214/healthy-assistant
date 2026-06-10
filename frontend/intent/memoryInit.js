/**
 * 记忆系统 - 初始化脚本
 * 
 * 用于设置默认用户画像和演示数据
 * 在浏览器控制台中运行：import('./intent/memoryInit.js')
 */

import { MemoryService } from "./memoryService.js";

const DEMO_USER_ID = "default";

/**
 * 初始化演示用户画像
 */
export async function initDemoProfile() {
  const ms = new MemoryService(DEMO_USER_ID);

  const profile = await ms.updateProfile({
    name: "张大爷",
    age: 72,
    gender: "男",
    phone: "138****1234",
    chronicDiseases: ["高血压", "2型糖尿病"],
    allergies: ["青霉素"],
    currentMedications: [
      { name: "阿司匹林", dose: "100mg", frequency: "每日1次" },
      { name: "二甲双胍", dose: "500mg", frequency: "每日2次" },
      { name: "硝苯地平", dose: "30mg", frequency: "每日1次" },
    ],
    habits: {
      sleepTime: "早6点起床，晚9点休息",
      dietPreference: "清淡饮食，少盐少油",
      exerciseHabit: "每日晨练30分钟",
    },
    family: [
      { relationship: "儿子", name: "张小明", phone: "139****5678", authorized: true },
    ],
    behaviorStage: "稳定期",
    trustLevel: "高",
  });

  console.log("[初始化] 用户画像已设置:", profile);
  return profile;
}

/**
 * 初始化演示核心记忆
 */
export async function initDemoMemory() {
  const ms = new MemoryService(DEMO_USER_ID);

  const memory = await ms.updateMemory({
    milestones: [
      {
        type: "first_record",
        name: "初次记录",
        message: "恭喜您完成第一次健康记录！",
        badge: "first_step",
        date: "2026-03-01",
        createdAt: "2026-03-01T08:00:00.000Z",
      },
      {
        type: "continuous_7days",
        name: "坚持一周",
        message: "太棒了！您已连续记录7天健康数据！",
        badge: "week_warrior",
        date: "2026-03-08",
        createdAt: "2026-03-08T08:00:00.000Z",
      },
    ],
    importantDecisions: [
      {
        text: "医生建议增加降压药剂量",
        date: "2026-03-05",
        createdAt: "2026-03-05T10:00:00.000Z",
      },
    ],
    deepMotivation: {
      healthGoal: "将血压控制在130/80以下",
      familyResponsibility: "想多陪孙子几年，不想成为子女负担",
    },
    lessons: [
      {
        text: "忘记服药导致血压波动，已设置提醒",
        date: "2026-03-10",
        createdAt: "2026-03-10T09:00:00.000Z",
      },
    ],
  });

  console.log("[初始化] 核心记忆已设置:", memory);
  return memory;
}

/**
 * 添加演示用药记录
 */
export async function initDemoMedications() {
  const ms = new MemoryService(DEMO_USER_ID);
  const records = [];

  // 最近7天的用药记录
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(8, 0, 0, 0);

    // 早上：阿司匹林
    records.push(await ms.saveMedication({
      drugName: "阿司匹林",
      dose: { amount: 1, unit: "片" },
      time: date.toISOString(),
      person: "self",
      notes: "早餐后服用",
      source: "demo",
    }));

    // 晚上：二甲双胍
    const eveningDate = new Date(date);
    eveningDate.setHours(20, 0, 0, 0);
    records.push(await ms.saveMedication({
      drugName: "二甲双胍",
      dose: { amount: 1, unit: "片" },
      time: eveningDate.toISOString(),
      person: "self",
      notes: "晚餐后服用",
      source: "demo",
    }));
  }

  console.log(`[初始化] 已添加 ${records.length} 条用药记录`);
  return records;
}

/**
 * 添加演示血压记录
 */
export async function initDemoBloodPressure() {
  const ms = new MemoryService(DEMO_USER_ID);
  const records = [];

  const now = new Date();
  // 基础血压值，模拟逐渐改善的趋势
  const baseValues = [150, 148, 145, 142, 140, 138, 136];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    date.setHours(7, 30, 0, 0);

    const systolic = baseValues[6 - i];
    const diastolic = Math.round(systolic * 0.6);

    records.push(await ms.saveBloodPressure({
      systolic,
      diastolic,
      unit: "mmHg",
      time: date.toISOString(),
      measurementContext: "晨起静息",
      source: "demo",
    }));
  }

  console.log(`[初始化] 已添加 ${records.length} 条血压记录`);
  return records;
}

/**
 * 添加演示提醒
 */
export async function initDemoReminders() {
  const ms = new MemoryService(DEMO_USER_ID);
  const reminders = [];

  reminders.push(await ms.addReminder({
    type: "medication",
    drugName: "阿司匹林",
    time: "08:00",
    frequency: "daily",
    message: "该吃阿司匹林了！",
  }));

  reminders.push(await ms.addReminder({
    type: "medication",
    drugName: "二甲双胍",
    time: "20:00",
    frequency: "daily",
    message: "该吃二甲双胍了！",
  }));

  reminders.push(await ms.addReminder({
    type: "blood_pressure",
    time: "07:00",
    frequency: "daily",
    message: "该测血压啦！",
  }));

  console.log(`[初始化] 已添加 ${reminders.length} 个提醒`);
  return reminders;
}

/**
 * 一键初始化所有演示数据
 */
export async function initAllDemoData() {
  console.log("========== 开始初始化演示数据 ==========");

  const profile = await initDemoProfile();
  const memory = await initDemoMemory();
  const medications = await initDemoMedications();
  const bloodPressure = await initDemoBloodPressure();
  const reminders = await initDemoReminders();

  console.log("========== 演示数据初始化完成 ==========");
  console.log("用户画像:", profile);
  console.log("核心记忆:", memory);
  console.log("用药记录数:", medications.length);
  console.log("血压记录数:", bloodPressure.length);
  console.log("提醒数:", reminders.length);

  return {
    profile,
    memory,
    medications,
    bloodPressure,
    reminders,
  };
}

/**
 * 清除所有演示数据
 */
export async function clearAllDemoData() {
  const ms = new MemoryService(DEMO_USER_ID);
  await ms.clearAllData();
  console.log("[初始化] 所有数据已清除");
}

/**
 * 查看当前所有数据
 */
export async function viewAllData() {
  const ms = new MemoryService(DEMO_USER_ID);
  const data = await ms.exportAllData();
  console.log("[数据] 当前所有数据:", data);
  return data;
}
