/**
 * 增强提醒服务 - 支持用药确认、10 分钟后重提醒、通知子女
 * 
 * 功能：
 * - 定时轮询后端检查到期提醒
 * - 浏览器 Notification 推送
 * - 在对话界面中注入提醒消息和确认按钮
 * - 用户确认/跳过提醒
 * - 10 分钟后未确认自动重提醒
 * - 连续漏服通知子女
 */

import { API_BASE } from "../config.js";
const POLL_INTERVAL = 30 * 1000; // 30 秒轮询
const RESCHEDULE_DELAY = 10 * 60 * 1000; // 10 分钟后重提醒
const MISSED_THRESHOLD = 2; // 连续漏服 2 次通知子女

class ReminderService {
  constructor(userId = "default") {
    this.userId = userId;
    this.polling = false;
    this.pollTimer = null;
    this.onReminderTriggered = null;
    this.notificationEnabled = false;
    this.pendingReminders = new Map(); // 待确认的提醒
    this.missedCount = new Map(); // 漏服计数
    this._initNotification();
    this._loadMissedCount();
  }

  async _initNotification() {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      this.notificationEnabled = true;
    } else if (Notification.permission !== "denied") {
      const perm = await Notification.requestPermission();
      this.notificationEnabled = perm === "granted";
    }
  }

  async _loadMissedCount() {
    try {
      const data = localStorage.getItem(`missed_count_${this.userId}`);
      if (data) {
        const parsed = JSON.parse(data);
        this.missedCount = new Map(Object.entries(parsed));
      }
    } catch (e) {
      console.error("[ReminderService] 加载漏服计数失败:", e);
    }
  }

  _saveMissedCount() {
    try {
      const obj = Object.fromEntries(this.missedCount);
      localStorage.setItem(`missed_count_${this.userId}`, JSON.stringify(obj));
    } catch (e) {
      console.error("[ReminderService] 保存漏服计数失败:", e);
    }
  }

  start(onReminderTriggered) {
    if (this.polling) return;
    this.onReminderTriggered = onReminderTriggered;
    this.polling = true;
    console.log("[ReminderService] 提醒轮询已启动，间隔 30 秒");
    this._poll();
    this.pollTimer = setInterval(() => this._poll(), POLL_INTERVAL);
  }

  stop() {
    this.polling = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    // 清除所有待重提醒
    for (const [reminderId, timerId] of this.pendingReminders.entries()) {
      clearTimeout(timerId);
    }
    this.pendingReminders.clear();
    console.log("[ReminderService] 提醒轮询已停止");
  }

  async _poll() {
    if (!this.polling) return;
    try {
      const res = await fetch(`${API_BASE}/reminders/check/${this.userId}`);
      if (!res.ok) return;
      const json = await res.json();
      const triggered = json.data || [];

      for (const reminder of triggered) {
        this._handleTriggered(reminder);
      }
    } catch (e) {
      console.error("[ReminderService] 轮询失败:", e);
    }
  }

  _handleTriggered(reminder) {
    console.log("[ReminderService] 提醒触发:", reminder);

    // 发送浏览器通知
    if (this.notificationEnabled) {
      try {
        new Notification("银发健康助手 - 提醒", {
          body: reminder.message,
          icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>💊</text></svg>",
          tag: reminder.reminderId,
          requireInteraction: true,
        });
      } catch (e) {
        console.error("[ReminderService] 通知推送失败:", e);
      }
    }

    // 添加到待确认列表
    this.pendingReminders.set(reminder.reminderId, null);
    
    // 设置 10 分钟后重提醒
    this._scheduleReschedule(reminder);

    // 通知前端显示确认界面
    if (this.onReminderTriggered) {
      this.onReminderTriggered(reminder);
    }
  }

  _scheduleReschedule(reminder) {
    // 清除之前的定时器
    const existingTimer = this.pendingReminders.get(reminder.reminderId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // 设置 10 分钟后重提醒
    const timerId = setTimeout(() => {
      this._handleReschedule(reminder);
    }, RESCHEDULE_DELAY);

    this.pendingReminders.set(reminder.reminderId, timerId);
    console.log(`[ReminderService] 已设置重提醒：${reminder.reminderId}，10 分钟后`);
  }

  async _handleReschedule(reminder) {
    // 检查用户是否已确认
    if (!this.pendingReminders.has(reminder.reminderId)) {
      return; // 已确认，无需重提醒
    }

    // 增加漏服计数
    const currentCount = this.missedCount.get(reminder.reminderId) || 0;
    const newCount = currentCount + 1;
    this.missedCount.set(reminder.reminderId, newCount);
    this._saveMissedCount();

    console.log(`[ReminderService] 提醒未确认：${reminder.reminderId}，漏服次数：${newCount}`);

    // 发送重提醒通知
    if (this.notificationEnabled) {
      try {
        new Notification("银发健康助手 - 再次提醒", {
          body: `您还没有确认是否吃药：${reminder.drugName || "药物"}。请尽快确认！`,
          icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚠️</text></svg>",
          tag: reminder.reminderId,
          requireInteraction: true,
        });
      } catch (e) {
        console.error("[ReminderService] 重提醒通知失败:", e);
      }
    }

    // 如果连续漏服达到阈值，通知子女
    if (newCount >= MISSED_THRESHOLD) {
      await this._notifyChildren(reminder);
      // 重置计数
      this.missedCount.set(reminder.reminderId, 0);
      this._saveMissedCount();
    }

    // 再次触发提醒
    if (this.onReminderTriggered) {
      this.onReminderTriggered({
        ...reminder,
        isReschedule: true,
        missedCount: newCount
      });
    }
  }

  async _notifyChildren(reminder) {
    try {
      console.log("[ReminderService] 通知子女：连续漏服", reminder);
      
      // 获取用户画像中的家庭成员信息
      const profileRes = await fetch(`${API_BASE}/memory/profile/${this.userId}`);
      if (!profileRes.ok) return;
      
      const profileData = await profileRes.json();
      const profile = profileData.data || {};
      const familyMembers = profile.familyMembers || [];
      
      // 查找子女信息
      const children = familyMembers.filter(m => 
        m.relation === "son" || m.relation === "daughter" || 
        m.label === "儿子" || m.label === "女儿"
      );

      if (children.length === 0) {
        console.log("[ReminderService] 未找到子女信息，跳过通知");
        return;
      }

      // 发送通知给每个子女
      for (const child of children) {
        if (child.phone) {
          // 这里可以调用短信 API 或推送 API
          console.log(`[ReminderService] 发送通知给${child.label}（${child.phone}）：` +
            `您的${profile.name || '父母'}连续${MISSED_THRESHOLD}次未确认服用${reminder.drugName || '药物'}。`);
          
          // TODO: 实际应用中这里调用短信 API
          // await sendSms(child.phone, message);
        }
      }

      // 记录通知事件
      await fetch(`${API_BASE}/memory/events/${this.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "reminder_missed",
          description: `连续${MISSED_THRESHOLD}次未确认服药：${reminder.drugName || '药物'}`,
          riskLevel: "WARN",
          data: {
            reminderId: reminder.reminderId,
            drugName: reminder.drugName,
            missedCount: MISSED_THRESHOLD,
            notifiedChildren: children.map(c => c.label)
          }
        })
      });

    } catch (e) {
      console.error("[ReminderService] 通知子女失败:", e);
    }
  }

  /**
   * 用户确认已吃药
   */
  async confirmReminder(reminderId, action = "done") {
    try {
      // 清除重提醒定时器
      const timerId = this.pendingReminders.get(reminderId);
      if (timerId) {
        clearTimeout(timerId);
      }
      this.pendingReminders.delete(reminderId);

      // 重置漏服计数
      this.missedCount.set(reminderId, 0);
      this._saveMissedCount();

      // 调用后端确认
      const res = await fetch(
        `${API_BASE}/reminders/confirm/${this.userId}/${reminderId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      const result = await res.json();
      
      console.log("[ReminderService] 确认提醒:", reminderId, action);
      return result;
    } catch (e) {
      console.error("[ReminderService] 确认提醒失败:", e);
      return { ok: false };
    }
  }

  /**
   * 用户确认未吃药（跳过）
   */
  async skipReminder(reminderId, reason = "") {
    return this.confirmReminder(reminderId, "skipped");
  }

  /**
   * 安排重提醒（用户点击"没吃"后调用）
   */
  async scheduleReschedule(reminderId) {
    try {
      const res = await fetch(
        `${API_BASE}/reminders/reschedule/${this.userId}/${reminderId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const result = await res.json();
      
      // 同时在前端设置定时器，确保即时响应
      const reminders = await this.getReminders();
      const reminder = reminders.find(r => r.id === reminderId);
      if (reminder) {
        this._scheduleReschedule({ reminderId, ...reminder });
      }
      
      console.log("[ReminderService] 已安排重提醒:", reminderId);
      return result;
    } catch (e) {
      console.error("[ReminderService] 安排重提醒失败:", e);
      return { ok: false };
    }
  }

  async getReminderHistory() {
    try {
      const res = await fetch(`${API_BASE}/reminders/history/${this.userId}`);
      const json = await res.json();
      return json.data || [];
    } catch (e) {
      console.error("[ReminderService] 获取历史失败:", e);
      return [];
    }
  }

  /**
   * 获取待确认的提醒列表
   */
  getPendingReminders() {
    return Array.from(this.pendingReminders.keys());
  }

  /**
   * 获取漏服计数
   */
  getMissedCount(reminderId) {
    return this.missedCount.get(reminderId) || 0;
  }
}

export { ReminderService };
