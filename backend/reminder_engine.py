import json
import os
from datetime import datetime, timedelta


HISTORY_DIR = os.path.join(os.path.dirname(__file__), "data", "reminder_history")
os.makedirs(HISTORY_DIR, exist_ok=True)


def _now_time_str():
    now = datetime.now()
    return f"{now.hour:02d}:{now.minute:02d}"


def _today_str():
    return datetime.now().strftime("%Y-%m-%d")


def _read_history(user_id):
    path = os.path.join(HISTORY_DIR, f"{user_id}_history.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"triggered": [], "confirmed": [], "reschedules": []}


def _write_history(user_id, data):
    path = os.path.join(HISTORY_DIR, f"{user_id}_history.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class ReminderEngine:
    def __init__(self, memory_store):
        self.memory_store = memory_store
        self._notified_today = {}
        self._reschedule_times = {}  # 记录重提醒时间

    def check_and_fire(self, user_id):
        now_str = _now_time_str()
        today = _today_str()
        reminders = self.memory_store.get_reminders(user_id)
        triggered = []

        notified_key = f"{user_id}_{today}"
        if notified_key not in self._notified_today:
            self._notified_today[notified_key] = set()

        for r in reminders.get("reminders", []):
            if not r.get("enabled", True):
                continue

            reminder_time = r.get("time", "08:00")
            reminder_id = r.get("id", "")

            if reminder_id in self._notified_today[notified_key]:
                continue

            if self._should_fire(reminder_time, now_str, r.get("frequency", "daily")):
                msg = self._build_message(r, user_id)
                entry = {
                    "reminderId": reminder_id,
                    "type": r.get("type", "medication"),
                    "drugName": r.get("drugName", ""),
                    "time": reminder_time,
                    "message": msg,
                    "triggeredAt": datetime.now().isoformat(),
                    "needConfirm": r.get("type") == "medication",  # 用药提醒需要确认
                }
                triggered.append(entry)
                self._notified_today[notified_key].add(reminder_id)
                self._record_trigger(user_id, entry)
                
                # 一次性提醒触发后自动禁用
                if r.get("frequency") == "once":
                    self.memory_store.toggle_reminder(user_id, reminder_id, False)

        return triggered

    def check_reschedule(self, user_id):
        """检查是否需要重提醒"""
        now = datetime.now()
        reminders = self.memory_store.get_reminders(user_id)
        reschedules = []

        for reminder_id, reschedule_time in list(self._reschedule_times.items()):
            if now >= reschedule_time:
                # 找到对应的提醒
                for r in reminders.get("reminders", []):
                    if r.get("id") == reminder_id and r.get("enabled", True):
                        msg = self._build_message(r, user_id, is_reschedule=True)
                        entry = {
                            "reminderId": reminder_id,
                            "type": r.get("type", "medication"),
                            "drugName": r.get("drugName", ""),
                            "time": r.get("time", "08:00"),
                            "message": msg,
                            "triggeredAt": now.isoformat(),
                            "isReschedule": True,
                            "needConfirm": True,
                        }
                        reschedules.append(entry)
                        self._record_reschedule(user_id, entry)
                        # 更新下次重提醒时间
                        self._reschedule_times[reminder_id] = now + timedelta(minutes=10)
                break

        return reschedules

    def _should_fire(self, reminder_time, now_str, frequency):
        r_hour, r_min = map(int, reminder_time.split(":"))
        n_hour, n_min = map(int, now_str.split(":"))
        diff = (n_hour * 60 + n_min) - (r_hour * 60 + r_min)
        
        if frequency == "daily":
            return 0 <= diff <= 2
        elif frequency == "once":
            # 一次性提醒，只在目标时间之后的 2 分钟内触发（不提前）
            return 0 <= diff <= 2
        return False

    def _build_message(self, reminder, user_id, is_reschedule=False):
        profile = self.memory_store.get_profile(user_id)
        name = profile.get("name", "")
        prefix = f"{name}，" if name else ""

        r_type = reminder.get("type", "medication")
        drug = reminder.get("drugName", "")
        custom_msg = reminder.get("message", "")

        if custom_msg:
            return f"{prefix}{custom_msg}"

        if r_type == "medication":
            if is_reschedule:
                if drug:
                    return f"{prefix}再次提醒您：该吃{drug}了！您还没有确认是否吃药，请回复'吃了'或'没吃'。"
                return f"{prefix}再次提醒您：该吃药了！您还没有确认，请回复'吃了'或'没吃'。"
            else:
                if drug:
                    return f"{prefix}该吃{drug}了！您吃药了吗？请回复'吃了'或'没吃'。"
                return f"{prefix}该吃药了！您吃药了吗？请回复'吃了'或'没吃'。"
        elif r_type == "blood_pressure":
            return f"{prefix}该测血压啦！测完可以告诉我结果。"
        elif r_type == "blood_sugar":
            return f"{prefix}该测血糖了！是空腹还是餐后？"
        elif r_type == "checkup":
            return f"{prefix}别忘了体检哦！"
        elif r_type == "temperature":
            return f"{prefix}该量体温啦！测完可以告诉我结果。"
        else:
            return f"{prefix}该做健康记录了！"

    def _record_trigger(self, user_id, entry):
        history = _read_history(user_id)
        history["triggered"].append(entry)
        if len(history["triggered"]) > 200:
            history["triggered"] = history["triggered"][-200:]
        _write_history(user_id, history)

    def _record_reschedule(self, user_id, entry):
        history = _read_history(user_id)
        history["reschedules"].append(entry)
        if len(history["reschedules"]) > 200:
            history["reschedules"] = history["reschedules"][-200:]
        _write_history(user_id, history)

    def confirm_reminder(self, user_id, reminder_id, action="done"):
        """确认提醒"""
        history = _read_history(user_id)
        entry = {
            "reminderId": reminder_id,
            "action": action,
            "confirmedAt": datetime.now().isoformat(),
        }

        if action == "done":
            entry["recordSaved"] = True
            reminders = self.memory_store.get_reminders(user_id)
            for r in reminders.get("reminders", []):
                if r.get("id") == reminder_id and r.get("type") == "medication":
                    drug = r.get("drugName", "")
                    if drug:
                        self.memory_store.save_record(user_id, "med", {
                            "drugName": drug,
                            "dose": {"amount": 1, "unit": "次"},
                            "source": "reminder",
                        })
                    break
            
            # 清除重提醒
            if reminder_id in self._reschedule_times:
                del self._reschedule_times[reminder_id]

        elif action == "skipped":
            entry["skipped"] = True
            # 记录漏服
            entry["missed"] = True
            # 清除重提醒
            if reminder_id in self._reschedule_times:
                del self._reschedule_times[reminder_id]

        history["confirmed"].append(entry)
        if len(history["confirmed"]) > 200:
            history["confirmed"] = history["confirmed"][-200:]
        _write_history(user_id, history)
        return entry

    def schedule_reschedule(self, user_id, reminder_id):
        """安排重提醒"""
        reminders = self.memory_store.get_reminders(user_id)
        for r in reminders.get("reminders", []):
            if r.get("id") == reminder_id:
                # 设置 10 分钟后重提醒
                reschedule_time = datetime.now() + timedelta(minutes=10)
                self._reschedule_times[reminder_id] = reschedule_time
                return {
                    "reminderId": reminder_id,
                    "rescheduleTime": reschedule_time.isoformat(),
                    "delayMinutes": 10
                }
        return None

    def get_missed_count(self, user_id, reminder_id):
        """获取漏服次数"""
        history = _read_history(user_id)
        count = 0
        for entry in history.get("confirmed", []):
            if entry.get("reminderId") == reminder_id and entry.get("missed"):
                count += 1
        return count

    def get_history(self, user_id):
        return _read_history(user_id)

    def get_medication_adherence(self, user_id, days=7):
        """获取用药依从性统计"""
        history = _read_history(user_id)
        now = datetime.now()
        cutoff = now - timedelta(days=days)
        
        total = 0
        confirmed = 0
        missed = 0
        
        for entry in history.get("confirmed", []):
            try:
                confirmed_at = datetime.fromisoformat(entry.get("confirmedAt", ""))
                if confirmed_at >= cutoff:
                    total += 1
                    if entry.get("action") == "done":
                        confirmed += 1
                    elif entry.get("missed"):
                        missed += 1
            except:
                continue
        
        adherence_rate = confirmed / total if total > 0 else 0
        
        return {
            "days": days,
            "total": total,
            "confirmed": confirmed,
            "missed": missed,
            "adherenceRate": round(adherence_rate, 2)
        }
