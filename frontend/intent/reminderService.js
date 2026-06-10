/**
 * 提醒服务 - ReminderService
 * 
 * 功能：
 * - 定时轮询后端检查到期提醒
 * - 浏览器 Notification 推送
 * - 在对话界面中注入提醒消息
 * - 用户确认/跳过提醒
 */

const API_BASE = "http://localhost:5001/api";
const POLL_INTERVAL = 30 * 1000;

class ReminderService {
  constructor(userId = "default") {
    this.userId = userId;
    this.polling = false;
    this.pollTimer = null;
    this.onReminderTriggered = null;
    this.notificationEnabled = false;
    this._initNotification();
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

  start(onReminderTriggered) {
    if (this.polling) return;
    this.onReminderTriggered = onReminderTriggered;
    this.polling = true;
    console.log("[ReminderService] 提醒轮询已启动，间隔30秒");
    this._poll();
    this.pollTimer = setInterval(() => this._poll(), POLL_INTERVAL);
  }

  stop() {
    this.polling = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
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

    if (this.onReminderTriggered) {
      this.onReminderTriggered(reminder);
    }
  }

  async confirmReminder(reminderId, action = "done") {
    try {
      const res = await fetch(
        `${API_BASE}/reminders/confirm/${this.userId}/${reminderId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }
      );
      return await res.json();
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

  async addReminder(reminderData) {
    /**
     * 添加提醒
     * @param {Object} reminderData - 提醒数据
     * @param {string} reminderData.message - 提醒内容
     * @param {string} reminderData.time - 时间 (HH:MM格式)
     * @param {string} reminderData.type - 提醒类型 (如 'activity', 'medication')
     * @param {string} [reminderData.date] - 日期 (YYYY-MM-DD格式，默认当天)
     * @returns {Promise<Object>} 添加结果
     */
    try {
      const reminder = {
        message: reminderData.message,
        time: reminderData.time,
        type: reminderData.type || 'activity',
        date: reminderData.date || new Date().toISOString().split('T')[0],
        enabled: true,
        repeat: 'once'
      };
      
      const res = await fetch(`${API_BASE}/memory/reminders/${this.userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reminder)
      });
      
      const json = await res.json();
      if (json.ok) {
        console.log("[ReminderService] 提醒已添加:", reminder);
      }
      return json;
    } catch (e) {
      console.error("[ReminderService] 添加提醒失败:", e);
      return { ok: false, error: e.message };
    }
  }
}

export { ReminderService };
