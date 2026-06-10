import os
import json
import uuid
from datetime import datetime, timedelta
from pathlib import Path

import chromadb
from chromadb.config import Settings


DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
CHROMA_DIR = os.path.join(os.path.dirname(__file__), "chroma_data")
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(CHROMA_DIR, exist_ok=True)


def _now():
    return datetime.now().isoformat()


def _gen_id(prefix):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    rand = uuid.uuid4().hex[:4]
    return f"{prefix}_{ts}_{rand}"


def _current_month():
    now = datetime.now()
    return f"{now.year}-{now.month:02d}"


def _file_path(user_id, suffix):
    return os.path.join(DATA_DIR, f"{user_id}_{suffix}.json")


def _read_json(path):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def _write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class MemoryStore:
    def __init__(self):
        self.chroma_client = chromadb.PersistentClient(path=CHROMA_DIR)
        self._collections = {}

    def _get_collection(self, user_id):
        if user_id not in self._collections:
            col_name = f"memory_{user_id}"
            self._collections[user_id] = self.chroma_client.get_or_create_collection(
                name=col_name,
                metadata={"hnsw:space": "cosine"},
            )
        return self._collections[user_id]

    def _add_to_chroma(self, user_id, doc_id, text, metadata=None):
        col = self._get_collection(user_id)
        existing = col.get(ids=[doc_id])
        if existing and existing["ids"]:
            col.update(ids=[doc_id], documents=[text], metadatas=[metadata or {}])
        else:
            col.add(ids=[doc_id], documents=[text], metadatas=[metadata or {}])

    def _delete_from_chroma(self, user_id, doc_id):
        col = self._get_collection(user_id)
        try:
            existing = col.get(ids=[doc_id])
            if existing and existing["ids"]:
                col.delete(ids=[doc_id])
        except Exception:
            pass

    # ==================== Profile ====================

    def get_profile(self, user_id):
        path = _file_path(user_id, "profile")
        data = _read_json(path)
        if data is None:
            data = self._default_profile(user_id)
            _write_json(path, data)
        return data

    def update_profile(self, user_id, updates):
        profile = self.get_profile(user_id)
        profile.update(updates)
        profile["updatedAt"] = _now()
        _write_json(_file_path(user_id, "profile"), profile)
        self._add_to_chroma(
            user_id,
            f"profile_{user_id}",
            json.dumps(profile, ensure_ascii=False),
            {"type": "profile"},
        )
        return profile

    def _default_profile(self, user_id):
        return {
            "userId": user_id,
            "name": "",
            "age": None,
            "gender": "",
            "phone": "",
            "chronicDiseases": [],
            "allergies": [],
            "currentMedications": [],
            "habits": {
                "sleepTime": "",
                "dietPreference": "",
                "exerciseHabit": "",
            },
            "family": [],
            "behaviorStage": "新手期",
            "trustLevel": "低",
            "createdAt": _now(),
            "updatedAt": _now(),
        }

    # ==================== Core Memory ====================

    def get_memory(self, user_id):
        path = _file_path(user_id, "memory")
        data = _read_json(path)
        if data is None:
            data = self._default_memory()
            _write_json(path, data)
        return data

    def update_memory(self, user_id, updates):
        memory = self.get_memory(user_id)
        memory.update(updates)
        memory["updatedAt"] = _now()
        _write_json(_file_path(user_id, "memory"), memory)
        self._add_to_chroma(
            user_id,
            f"memory_{user_id}",
            json.dumps(memory, ensure_ascii=False),
            {"type": "memory"},
        )
        return memory

    def _default_memory(self):
        return {
            "milestones": [],
            "importantDecisions": [],
            "deepMotivation": {"healthGoal": "", "familyResponsibility": ""},
            "lessons": [],
            "createdAt": _now(),
            "updatedAt": _now(),
        }

    # ==================== Records (med/bp/bs/wt/exercise/diet) ====================

    def save_record(self, user_id, record_type, data):
        month = data.get("_month", _current_month())
        path = _file_path(user_id, f"{record_type}_{month}")
        container = _read_json(path) or {"month": month, "records": [], "statistics": {}}

        record_id = _gen_id(record_type)
        record = {"id": record_id, **data, "createdAt": _now()}
        if "time" not in record:
            record["time"] = _now()

        container["records"].append(record)
        _write_json(path, container)

        self._add_to_chroma(
            user_id,
            record_id,
            json.dumps(record, ensure_ascii=False),
            {"type": record_type, "month": month},
        )

        return record

    def query_records(self, user_id, record_type, days=7):
        # 体重记录类型别名（支持 wt 和 weight 两种）
        type_mapping = {"weight": ["weight", "wt"]}
        search_types = type_mapping.get(record_type, [record_type])
        
        # 如果是查询今天的记录，从凌晨0点开始
        if days == 1:
            cutoff = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            cutoff = datetime.now() - timedelta(days=days)
        all_records = []

        months = self._months_in_range(days)
        for month in months:
            for search_type in search_types:
                path = _file_path(user_id, f"{search_type}_{month}")
                container = _read_json(path)
                if container and "records" in container:
                    for r in container["records"]:
                        t = r.get("time") or r.get("createdAt")
                        try:
                            rt = datetime.fromisoformat(t.replace("Z", "+00:00").replace("+00:00", ""))
                        except Exception:
                            continue
                        if rt >= cutoff:
                            all_records.append(r)

        all_records.sort(key=lambda r: r.get("time") or r.get("createdAt"))
        return all_records

    def delete_record(self, user_id, record_type, record_id):
        months = self._months_in_range(365)
        for month in months:
            path = _file_path(user_id, f"{record_type}_{month}")
            container = _read_json(path)
            if container and "records" in container:
                before = len(container["records"])
                container["records"] = [r for r in container["records"] if r.get("id") != record_id]
                if len(container["records"]) < before:
                    _write_json(path, container)
                    self._delete_from_chroma(user_id, record_id)
                    return {"deleted": True, "id": record_id}
        return {"deleted": False, "id": record_id}

    def _months_in_range(self, days):
        months = []
        now = datetime.now()
        for i in range(days // 30 + 2):
            d = now - timedelta(days=i * 30)
            months.append(f"{d.year}-{d.month:02d}")
        return list(dict.fromkeys(months))

    # ==================== Reminders ====================

    def get_reminders(self, user_id):
        path = _file_path(user_id, "reminders")
        data = _read_json(path)
        if data is None:
            data = {"userId": user_id, "reminders": []}
            _write_json(path, data)
        return data

    def save_reminders(self, user_id, data):
        path = _file_path(user_id, "reminders")
        _write_json(path, data)
        return data

    def add_reminder(self, user_id, reminder):
        data = self.get_reminders(user_id)
        new_reminder = {
            "id": _gen_id("remind"),
            "type": reminder.get("type", "medication"),
            "drugName": reminder.get("drugName", ""),
            "time": reminder.get("time", "08:00"),
            "frequency": reminder.get("frequency", "daily"),
            "enabled": True,
            "message": reminder.get("message", ""),
            "createdAt": _now(),
        }
        data["reminders"].append(new_reminder)
        _write_json(_file_path(user_id, "reminders"), data)
        return new_reminder

    def remove_reminder(self, user_id, reminder_id):
        data = self.get_reminders(user_id)
        data["reminders"] = [r for r in data["reminders"] if r.get("id") != reminder_id]
        _write_json(_file_path(user_id, "reminders"), data)
        return data

    def toggle_reminder(self, user_id, reminder_id, enabled=True):
        data = self.get_reminders(user_id)
        for r in data["reminders"]:
            if r.get("id") == reminder_id:
                r["enabled"] = enabled
                break
        _write_json(_file_path(user_id, "reminders"), data)
        return data

    # ==================== Emotion ====================

    def save_emotion(self, user_id, data):
        path = _file_path(user_id, "emotion")
        emotions = _read_json(path) or {"records": []}
        record = {
            "id": _gen_id("emo"),
            "type": data.get("type", "unknown"),
            "text": data.get("text", ""),
            "time": data.get("time", _now()),
            "createdAt": _now(),
        }
        emotions["records"].append(record)
        if len(emotions["records"]) > 100:
            emotions["records"] = emotions["records"][-100:]
        _write_json(path, emotions)
        self._add_to_chroma(
            user_id,
            record["id"],
            record["text"],
            {"type": "emotion"},
        )
        return emotions

    def get_emotions(self, user_id):
        path = _file_path(user_id, "emotion")
        return _read_json(path) or {"records": []}

    # ==================== Events ====================

    def save_event(self, user_id, data):
        path = _file_path(user_id, "events")
        events = _read_json(path) or {"records": []}
        record = {
            "id": _gen_id("evt"),
            "type": data.get("type", "info"),
            "description": data.get("description", ""),
            "riskLevel": data.get("riskLevel", "PASS"),
            "time": data.get("time", _now()),
            "createdAt": _now(),
        }
        events["records"].append(record)
        _write_json(path, events)
        self._add_to_chroma(
            user_id,
            record["id"],
            record["description"],
            {"type": "event", "riskLevel": record["riskLevel"]},
        )
        return events

    def get_events(self, user_id):
        path = _file_path(user_id, "events")
        return _read_json(path) or {"records": []}

    # ==================== Health Summary ====================

    def get_health_summary(self, user_id, days=7):
        medications = self.query_records(user_id, "med", days)
        bp_records = self.query_records(user_id, "bp", days)
        bs_records = self.query_records(user_id, "bs", days)
        exercises = self.query_records(user_id, "exercise", days)
        diets = self.query_records(user_id, "diet", days)
        profile = self.get_profile(user_id)

        systolics = [r["systolic"] for r in bp_records if r.get("systolic") is not None]
        diastolics = [r["diastolic"] for r in bp_records if r.get("diastolic") is not None]
        sugar_values = [r["value"] for r in bs_records if r.get("value") is not None]
        
        # 检测血糖记录的类型（空腹/餐后）
        sugar_types = [r.get("type") for r in bs_records if r.get("type")]
        sugar_type = sugar_types[0] if sugar_types else ""

        return {
            "days": days,
            "medicationCount": len(medications),
            "bpCount": len(bp_records),
            "bsCount": len(bs_records),
            "exerciseCount": len(exercises),
            "dietCount": len(diets),
            "latestBP": bp_records[-1] if bp_records else None,
            "latestBS": bs_records[-1] if bs_records else None,
            "latestExercise": exercises[-1] if exercises else None,
            "latestDiet": diets[-1] if diets else None,
            "avgSystolic": round(sum(systolics) / len(systolics)) if systolics else None,
            "avgDiastolic": round(sum(diastolics) / len(diastolics)) if diastolics else None,
            "avgSugar": round(sum(sugar_values) / len(sugar_values), 1) if sugar_values else None,
            "sugarType": sugar_type,
            "profile": {
                "name": profile.get("name", ""),
                "age": profile.get("age"),
                "chronicDiseases": profile.get("chronicDiseases", []),
                "behaviorStage": profile.get("behaviorStage", ""),
            },
        }

    # ==================== Export / Import ====================

    def export_all_data(self, user_id):
        return {
            "exportTime": _now(),
            "userId": user_id,
            "profile": self.get_profile(user_id),
            "memory": self.get_memory(user_id),
            "reminders": self.get_reminders(user_id),
            "medications": self.query_records(user_id, "med", 365),
            "bloodPressure": self.query_records(user_id, "bp", 365),
            "exercises": self.query_records(user_id, "exercise", 365),
            "diets": self.query_records(user_id, "diet", 365),
        }

    def import_data(self, user_id, data):
        if "profile" in data:
            _write_json(_file_path(user_id, "profile"), data["profile"])
        if "memory" in data:
            _write_json(_file_path(user_id, "memory"), data["memory"])
        if "reminders" in data:
            _write_json(_file_path(user_id, "reminders"), data["reminders"])
        return {"imported": True}

    # ==================== Clear ====================

    def clear_all_data(self, user_id):
        prefix = f"{user_id}_"
        for f in os.listdir(DATA_DIR):
            if f.startswith(prefix) and f.endswith(".json"):
                os.remove(os.path.join(DATA_DIR, f))
        col_name = f"memory_{user_id}"
        try:
            self.chroma_client.delete_collection(name=col_name)
        except Exception:
            pass
        self._collections.pop(user_id, None)

    # ==================== Semantic Search ====================

    def semantic_search(self, user_id, query, top_k=5):
        col = self._get_collection(user_id)
        count = col.count()
        if count == 0:
            return []
        results = col.query(query_texts=[query], n_results=min(top_k, count))
        items = []
        for i, doc_id in enumerate(results["ids"][0]):
            items.append({
                "id": doc_id,
                "document": results["documents"][0][i],
                "metadata": results["metadatas"][0][i],
                "distance": results["distances"][0][i] if "distances" in results else None,
            })
        return items

    # ==================== Alerts ====================

    def get_alerts(self, user_id):
        path = _file_path(user_id, "alerts")
        data = _read_json(path)
        return data if data else []

    def save_alert(self, user_id, alert):
        alerts = self.get_alerts(user_id)
        alerts.append(alert)
        if len(alerts) > 200:
            alerts = alerts[-200:]
        _write_json(_file_path(user_id, "alerts"), alerts)
        return alert

    # ==================== Chat History ====================

    def get_chat_history(self, user_id):
        path = _file_path(user_id, "chat_history")
        data = _read_json(path)
        return data if data else []

    def save_chat_history(self, user_id, history):
        if len(history) > 500:
            history = history[-500:]
        _write_json(_file_path(user_id, "chat_history"), history)
        return history

    # ==================== Emergency Contacts ====================

    def get_emergency_contacts(self, user_id):
        """获取紧急联系人列表"""
        path = _file_path(user_id, "emergency_contacts")
        data = _read_json(path)
        return data if data else {"contacts": []}

    def add_emergency_contact(self, user_id, contact_data):
        """添加紧急联系人"""
        contacts = self.get_emergency_contacts(user_id)
        new_contact = {
            "id": _gen_id("contact"),
            "name": contact_data.get("name", ""),
            "phone": contact_data.get("phone", ""),
            "relationship": contact_data.get("relationship", ""),
            "isPrimary": contact_data.get("isPrimary", False),
            "createdAt": _now(),
        }
        
        # 如果设为主要联系人，取消其他主要联系人
        if new_contact["isPrimary"]:
            for c in contacts["contacts"]:
                c["isPrimary"] = False
        
        contacts["contacts"].append(new_contact)
        _write_json(_file_path(user_id, "emergency_contacts"), contacts)
        return new_contact

    def update_emergency_contact(self, user_id, contact_id, updates):
        """更新紧急联系人"""
        contacts = self.get_emergency_contacts(user_id)
        for c in contacts["contacts"]:
            if c["id"] == contact_id:
                # 如果设为主要联系人，取消其他主要联系人
                if updates.get("isPrimary", False):
                    for other in contacts["contacts"]:
                        other["isPrimary"] = False
                c.update(updates)
                c["updatedAt"] = _now()
                break
        _write_json(_file_path(user_id, "emergency_contacts"), contacts)
        return contacts

    def delete_emergency_contact(self, user_id, contact_id):
        """删除紧急联系人"""
        contacts = self.get_emergency_contacts(user_id)
        contacts["contacts"] = [c for c in contacts["contacts"] if c["id"] != contact_id]
        _write_json(_file_path(user_id, "emergency_contacts"), contacts)
        return contacts

    def get_primary_contact(self, user_id):
        """获取主要紧急联系人"""
        contacts = self.get_emergency_contacts(user_id)
        primary = [c for c in contacts["contacts"] if c.get("isPrimary")]
        if primary:
            return primary[0]
        # 如果没有设置主要联系人，返回第一个联系人
        return contacts["contacts"][0] if contacts["contacts"] else None
