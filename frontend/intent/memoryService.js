/**
 * 记忆系统 - MemoryService 核心类
 * 
 * 使用 Flask + ChromaDB 后端进行持久化存储和语义检索
 */

import { MemoryCache } from "./memoryCache.js";
import { API_BASE } from "../config.js";

export class MemoryService {
  constructor(userId = "default") {
    this.userId = userId;
    this.cache = new MemoryCache();
    this.updateQueue = [];
    this.processing = false;
  }

  // ==================== 基础请求方法 ====================

  async _request(method, path, body = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    };
    if (body) opts.body = JSON.stringify(body);
    
    try {
      const res = await fetch(`${API_BASE}${path}`, opts);
      if (!res.ok) {
        clearTimeout(timeoutId);
        const err = await res.text();
        console.error(`[MemoryService] API错误 ${method} ${path}:`, err);
        throw new Error(`API error: ${res.status}`);
      }
      const json = await res.json();
      clearTimeout(timeoutId);
      
      // 处理不同的数据格式
      if (json && json.data !== undefined) {
        return json.data;
      } else if (Array.isArray(json) || typeof json === 'object') {
        return json;
      }
      return json;
    } catch (e) {
      clearTimeout(timeoutId);
      const message = e.name === "AbortError" ? "请求超时，请确认后端服务是否已启动" : e.message;
      console.error(`[MemoryService] 请求失败 ${method} ${path}:`, e);
      throw new Error(message);
    }
  }

  _generateId(prefix) {
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const rand = Math.random().toString(36).slice(2, 6);
    return `${prefix}_${ts}_${rand}`;
  }

  // ==================== 用户画像 ====================

  async loadProfile() {
    const cached = this.cache.get("profile", "profile");
    if (cached) return cached;

    const profile = await this._request("GET", `/memory/profile/${this.userId}`);
    this.cache.set("profile", profile, "profile");
    return profile;
  }

  async updateProfile(updates) {
    const profile = await this._request("POST", `/memory/profile/${this.userId}`, updates);
    this.cache.set("profile", profile, "profile");
    return profile;
  }

  // ==================== 核心记忆 ====================

  async loadMemory() {
    const cached = this.cache.get("memory", "memory");
    if (cached) return cached;

    const memory = await this._request("GET", `/memory/core/${this.userId}`);
    this.cache.set("memory", memory, "memory");
    return memory;
  }

  async updateMemory(updates) {
    const memory = await this._request("POST", `/memory/core/${this.userId}`, updates);
    this.cache.set("memory", memory, "memory");
    return memory;
  }

  // ==================== 用药记录 ====================

  async saveMedication(data) {
    const record = await this._request("POST", `/memory/record/${this.userId}/med`, {
      drugName: data.drugName || "",
      dose: data.dose || { amount: null, unit: "" },
      time: data.time || new Date().toISOString(),
      person: data.person || "self",
      notes: data.notes || "",
      source: data.source || "llm",
    });

    this.cache.invalidateByType("records");
    this.cache.invalidateByType("statistics");
    return record;
  }

  async queryMedications(days = 7) {
    const cacheKey = `med_recent_${days}`;
    const cached = this.cache.get(cacheKey, "records");
    if (cached) return cached;

    const records = await this._request("GET", `/memory/record/${this.userId}/med?days=${days}`);
    this.cache.set(cacheKey, records, "records");
    return records;
  }

  // ==================== 血压记录 ====================

  async saveBloodPressure(data) {
    const record = await this._request("POST", `/memory/record/${this.userId}/bp`, {
      systolic: data.systolic ?? null,
      diastolic: data.diastolic ?? null,
      unit: data.unit || "mmHg",
      time: data.time || new Date().toISOString(),
      measurementContext: data.measurementContext || "",
      source: data.source || "llm",
    });

    this.cache.invalidateByType("records");
    this.cache.invalidateByType("statistics");
    this._enqueue(() => this.detectMilestone());
    return record;
  }

  async queryBloodPressure(days = 7) {
    const cacheKey = `bp_recent_${days}`;
    const cached = this.cache.get(cacheKey, "records");
    if (cached) return cached;

    const records = await this._request("GET", `/memory/record/${this.userId}/bp?days=${days}`);
    this.cache.set(cacheKey, records, "records");
    return records;
  }

  // ==================== 血糖记录 ====================

  async saveBloodSugar(data) {
    const record = await this._request("POST", `/memory/record/${this.userId}/bs`, {
      value: data.value ?? null,
      unit: data.unit || "mmol/L",
      type: data.type || "",
      time: data.time || new Date().toISOString(),
      source: data.source || "llm",
    });

    this.cache.invalidateByType("records");
    return record;
  }

  async queryBloodSugar(days = 7) {
    const cacheKey = `bs_recent_${days}`;
    const cached = this.cache.get(cacheKey, "records");
    if (cached) return cached;

    const records = await this._request("GET", `/memory/record/${this.userId}/bs?days=${days}`);
    this.cache.set(cacheKey, records, "records");
    return records;
  }

  // ==================== 体重记录 ====================

  async saveWeight(data) {
    const record = await this._request("POST", `/memory/record/${this.userId}/weight`, {
      value: data.value ?? null,
      unit: data.unit || "kg",
      time: data.time || new Date().toISOString(),
      source: data.source || "llm",
    });

    this.cache.invalidateByType("records");
    return record;
  }

  async queryWeight(days = 7) {
    const cacheKey = `weight_recent_${days}`;
    const cached = this.cache.get(cacheKey, "records");
    if (cached) return cached;

    const records = await this._request("GET", `/memory/record/${this.userId}/weight?days=${days}`);
    this.cache.set(cacheKey, records, "records");
    return records;
  }

  // ==================== 运动记录 ====================

  async saveExercise(data) {
    const record = await this._request("POST", `/memory/record/${this.userId}/exercise`, {
      action: data.action || "",
      duration: Number.isFinite(data.duration) ? data.duration : null,
      durationUnit: data.durationUnit || "分钟",
      intensity: data.intensity || "",
      feeling: data.feeling || "",
      time: data.time || new Date().toISOString(),
      source: data.source || "llm",
    });

    this.cache.invalidateByType("records");
    this.cache.invalidateByType("statistics");
    this._enqueue(() => this.detectMilestone());
    return record;
  }

  async queryExercises(days = 7) {
    const cacheKey = `exercise_recent_${days}`;
    const cached = this.cache.get(cacheKey, "records");
    if (cached) return cached;

    const records = await this._request("GET", `/memory/record/${this.userId}/exercise?days=${days}`);
    this.cache.set(cacheKey, records, "records");
    return records;
  }

  // ==================== 饮食记录 ====================

  async saveDiet(data) {
    const record = await this._request("POST", `/memory/record/${this.userId}/diet`, {
      foods: Array.isArray(data.foods) ? data.foods : [],
      meal: data.meal || "",
      amount: data.amount || "",
      calories: Number.isFinite(data.calories) ? data.calories : null,
      note: data.note || "",
      time: data.time || new Date().toISOString(),
      source: data.source || "llm",
    });

    this.cache.invalidateByType("records");
    this.cache.invalidateByType("statistics");
    return record;
  }

  async queryDiet(days = 7) {
    const cacheKey = `diet_recent_${days}`;
    const cached = this.cache.get(cacheKey, "records");
    if (cached) return cached;

    const records = await this._request("GET", `/memory/record/${this.userId}/diet?days=${days}`);
    this.cache.set(cacheKey, records, "records");
    return records;
  }

  // ==================== 提醒设置 ====================

  async loadReminders() {
    const cacheKey = `reminders_${this.userId}`;
    const cached = this.cache.get(cacheKey, "reminders");
    if (cached) return cached;

    try {
      const reminders = await this._request("GET", `/memory/reminders/${this.userId}`);
      this.cache.set(cacheKey, reminders, "reminders");
      return reminders;
    } catch (error) {
      console.error(`[MemoryService] 加载提醒失败:`, error);
      // 返回默认空数据，避免阻塞流程
      return { reminders: [], userId: this.userId };
    }
  }

  async addReminder(reminder) {
    const newReminder = await this._request("POST", `/memory/reminders/${this.userId}`, {
      type: reminder.type || "medication",
      drugName: reminder.drugName || "",
      time: reminder.time || "08:00",
      frequency: reminder.frequency || "daily",
      message: reminder.message || "",
    });
    this.cache.invalidateByType("reminders");
    return newReminder;
  }

  async removeReminder(reminderId) {
    const data = await this._request("DELETE", `/memory/reminders/${this.userId}/${reminderId}`);
    this.cache.invalidateByType("reminders");
    return data;
  }

  async toggleReminder(reminderId, enabled) {
    const data = await this.loadReminders();
    const reminder = data.reminders.find(r => r.id === reminderId);
    if (reminder) {
      reminder.enabled = enabled;
      await this._request("POST", `/memory/reminders/${this.userId}/${reminderId}/toggle`, { enabled });
      this.cache.invalidateByType("reminders");
    }
    return data;
  }

  async updateReminders(data) {
    await this._request("PUT", `/memory/reminders/${this.userId}`, data);
    this.cache.invalidateByType("reminders");
    return data;
  }

  // ==================== 对话历史 ====================

  async loadChatHistory() {
    try {
      return await this._request("GET", `/memory/chat_history/${this.userId}`);
    } catch {
      return [];
    }
  }

  async saveChatHistory(history) {
    try {
      await this._request("POST", `/memory/chat_history/${this.userId}`, history);
    } catch (e) {
      console.warn("[MemoryService] 保存对话历史失败:", e);
    }
  }

  // ==================== 情绪记录 ====================

  async saveEmotion(data) {
    const emotions = await this._request("POST", `/memory/emotion/${this.userId}`, {
      type: data.type || "unknown",
      text: data.text || "",
      time: data.time || new Date().toISOString(),
    });
    return emotions;
  }

  // ==================== 健康事件 ====================

  async saveEvent(data) {
    const events = await this._request("POST", `/memory/events/${this.userId}`, {
      type: data.type || "info",
      description: data.description || "",
      riskLevel: data.riskLevel || "PASS",
      time: data.time || new Date().toISOString(),
    });
    return events;
  }

  // ==================== 里程碑 ====================

  async addMilestone(milestone) {
    const memory = await this.loadMemory();
    const entry = {
      type: milestone.type,
      name: milestone.name,
      message: milestone.message,
      badge: milestone.badge || "",
      date: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
    };

    const exists = memory.milestones.some(
      m => m.type === entry.type && m.date === entry.date
    );
    if (exists) return null;

    memory.milestones.push(entry);
    const updated = await this.updateMemory({ milestones: memory.milestones });
    return entry;
  }

  async addLesson(lesson) {
    const memory = await this.loadMemory();
    memory.lessons.push({
      text: lesson,
      date: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
    });
    await this.updateMemory({ lessons: memory.lessons });
  }

  async addImportantDecision(decision) {
    const memory = await this.loadMemory();
    memory.importantDecisions.push({
      text: decision,
      date: new Date().toISOString().split("T")[0],
      createdAt: new Date().toISOString(),
    });
    await this.updateMemory({ importantDecisions: memory.importantDecisions });
  }

  // ==================== 里程碑检测 ====================

  async detectMilestone() {
    const medications = await this.queryMedications(30);
    const bpRecords = await this.queryBloodPressure(30);

    const rules = [
      {
        type: "first_record",
        name: "初次记录",
        condition: () => medications.length === 1 || bpRecords.length === 1,
        message: "恭喜您完成第一次健康记录！良好的开始是成功的一半。",
        badge: "first_step",
      },
      {
        type: "continuous_7days",
        name: "坚持一周",
        condition: () => this._checkContinuousDays(medications, 7) || this._checkContinuousDays(bpRecords, 7),
        message: "太棒了！您已连续记录7天健康数据！坚持就是胜利！",
        badge: "week_warrior",
      },
      {
        type: "continuous_30days",
        name: "坚持一月",
        condition: () => this._checkContinuousDays(medications, 30) || this._checkContinuousDays(bpRecords, 30),
        message: "了不起！您已连续记录30天！您已经养成了良好的健康习惯！",
        badge: "month_champion",
      },
      {
        type: "bp_improved",
        name: "血压改善",
        condition: () => {
          if (bpRecords.length < 14) return false;
          const recent = bpRecords.slice(-7);
          const previous = bpRecords.slice(-14, -7);
          const recentAvg = this._average(recent.map(r => r.systolic).filter(Number.isFinite));
          const previousAvg = this._average(previous.map(r => r.systolic).filter(Number.isFinite));
          return recentAvg !== null && previousAvg !== null && recentAvg < previousAvg - 5;
        },
        message: "您的血压控制有改善！收缩压下降了，继续保持！",
        badge: "bp_hero",
      },
      {
        type: "med_adherence_90",
        name: "用药依从性达标",
        condition: () => {
          if (medications.length < 7) return false;
          return this._calculateAdherence(medications) >= 0.9;
        },
        message: "您的用药依从性达到90%以上！这是控制慢病的关键！",
        badge: "med_master",
      },
    ];

    for (const rule of rules) {
      try {
        if (rule.condition()) {
          const milestone = await this.addMilestone(rule);
          if (milestone) return milestone;
        }
      } catch (e) {
        console.error("[MemoryService] 里程碑检测失败:", rule.type, e);
      }
    }

    return null;
  }

  // ==================== 统计查询 ====================

  async getHealthSummary(days = 7) {
    const cacheKey = `summary_${days}`;
    const cached = this.cache.get(cacheKey, "statistics");
    if (cached) return cached;

    try {
      const summary = await this._request("GET", `/memory/summary/${this.userId}?days=${days}`);
      this.cache.set(cacheKey, summary, "statistics");
      return summary;
    } catch (e) {
      console.error("[MemoryService] 健康摘要获取失败，使用本地计算:", e);
      return this._localHealthSummary(days);
    }
  }

  async _localHealthSummary(days = 7) {
    const medications = await this.queryMedications(days);
    const bpRecords = await this.queryBloodPressure(days);
    const exercises = await this.queryExercises(days);
    const diets = await this.queryDiet(days);
    const profile = await this.loadProfile();

    return {
      days,
      medicationCount: medications.length,
      bpCount: bpRecords.length,
      exerciseCount: exercises.length,
      dietCount: diets.length,
      latestBP: bpRecords.length > 0 ? bpRecords[bpRecords.length - 1] : null,
      latestExercise: exercises.length > 0 ? exercises[exercises.length - 1] : null,
      latestDiet: diets.length > 0 ? diets[diets.length - 1] : null,
      avgSystolic: this._average(bpRecords.map(r => r.systolic).filter(Number.isFinite)),
      avgDiastolic: this._average(bpRecords.map(r => r.diastolic).filter(Number.isFinite)),
      adherenceRate: medications.length > 0 ? this._calculateAdherence(medications) : 0,
      profile: {
        name: profile.name,
        age: profile.age,
        chronicDiseases: profile.chronicDiseases,
        behaviorStage: profile.behaviorStage,
      },
    };
  }

  // ==================== 语义搜索 ====================

  async semanticSearch(query, topK = 5) {
    return await this._request("POST", `/memory/search/${this.userId}`, { query, topK });
  }

  // ==================== 辅助方法 ====================

  _checkContinuousDays(records, days) {
    if (records.length < days) return false;

    const dateSet = new Set(
      records.map(r => new Date(r.time || r.createdAt).toISOString().split("T")[0])
    );
    const dates = [...dateSet].sort().reverse();

    if (dates.length < days) return false;

    for (let i = 0; i < days - 1; i++) {
      const current = new Date(dates[i]);
      const next = new Date(dates[i + 1]);
      const diff = (current - next) / (1000 * 60 * 60 * 24);
      if (diff !== 1) return false;
    }
    return true;
  }

  _average(arr) {
    if (!arr.length) return null;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  _calculateAdherence(medications) {
    if (!medications.length) return 0;
    const days = new Set(
      medications.map(r => new Date(r.time || r.createdAt).toISOString().split("T")[0])
    ).size;
    const totalDays = Math.max(7, days);
    return Math.min(days / totalDays, 1);
  }

  // ==================== 异步更新队列 ====================

  _enqueue(task) {
    this.updateQueue.push({ execute: task, retries: 0 });
    if (!this.processing) {
      this._processQueue();
    }
  }

  async _processQueue() {
    this.processing = true;
    while (this.updateQueue.length > 0) {
      const task = this.updateQueue.shift();
      try {
        await task.execute();
      } catch (e) {
        console.error("[MemoryService] 异步更新失败:", e);
        if (task.retries < 3) {
          task.retries++;
          this.updateQueue.push(task);
        }
      }
    }
    this.processing = false;
  }

  // ==================== 数据导出/导入 ====================

  async exportAllData() {
    return await this._request("GET", `/memory/export/${this.userId}`);
  }

  async importData(data) {
    return await this._request("POST", `/memory/import/${this.userId}`, data);
  }

  // ==================== 清除数据 ====================

  async clearAllData() {
    await this._request("POST", `/memory/clear/${this.userId}`);
    this.cache.clear();
  }
}
