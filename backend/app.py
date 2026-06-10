from flask import Flask, request, jsonify
from flask_cors import CORS
from memory_service import MemoryStore
from reminder_engine import ReminderEngine
from family_service import FamilyDB
from weather_service import weather_service
import os

app = Flask(__name__)
CORS(app, 
     origins=["http://localhost:63342", "http://localhost:8080", "http://127.0.0.1:63342"], 
     supports_credentials=True,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization", "Origin", "Accept"])

memory_store = MemoryStore()
reminder_engine = ReminderEngine(memory_store)
family_db = FamilyDB()

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)


@app.route("/api/memory/profile/<user_id>", methods=["GET"])
def get_profile(user_id):
    data = memory_store.get_profile(user_id)
    return jsonify({"ok": True, "data": data})


@app.route("/api/memory/profile/<user_id>", methods=["POST"])
def update_profile(user_id):
    updates = request.get_json(force=True)
    data = memory_store.update_profile(user_id, updates)
    return jsonify({"ok": True, "data": data})


@app.route("/api/memory/core/<user_id>", methods=["GET"])
def get_memory(user_id):
    data = memory_store.get_memory(user_id)
    return jsonify({"ok": True, "data": data})


@app.route("/api/memory/core/<user_id>", methods=["POST"])
def update_memory(user_id):
    updates = request.get_json(force=True)
    data = memory_store.update_memory(user_id, updates)
    return jsonify({"ok": True, "data": data})


@app.route("/api/memory/record/<user_id>/<record_type>", methods=["POST"])
def save_record(user_id, record_type):
    data = request.get_json(force=True)
    result = memory_store.save_record(user_id, record_type, data)
    return jsonify({"ok": True, "data": result})


@app.route("/api/memory/record/<user_id>/<record_type>", methods=["GET"])
def query_records(user_id, record_type):
    days = request.args.get("days", 7, type=int)
    results = memory_store.query_records(user_id, record_type, days)
    return jsonify({"ok": True, "data": results})


@app.route("/api/memory/record/<user_id>/<record_type>/<record_id>", methods=["DELETE"])
def delete_record(user_id, record_type, record_id):
    result = memory_store.delete_record(user_id, record_type, record_id)
    return jsonify({"ok": True, "data": result})


@app.route("/api/memory/reminders/<user_id>", methods=["GET"])
def get_reminders(user_id):
    data = memory_store.get_reminders(user_id)
    return jsonify({"ok": True, "data": data})


@app.route("/api/memory/reminders/<user_id>", methods=["POST"])
def add_reminder(user_id):
    reminder = request.get_json(force=True)
    result = memory_store.add_reminder(user_id, reminder)
    return jsonify({"ok": True, "data": result})


@app.route("/api/memory/reminders/<user_id>", methods=["PUT"])
def update_reminders(user_id):
    data = request.get_json(force=True)
    memory_store.save_reminders(user_id, data)
    return jsonify({"ok": True, "data": data})


@app.route("/api/memory/reminders/<user_id>/<reminder_id>", methods=["DELETE"])
def remove_reminder(user_id, reminder_id):
    result = memory_store.remove_reminder(user_id, reminder_id)
    return jsonify({"ok": True, "data": result})


@app.route("/api/memory/reminders/<user_id>/<reminder_id>/toggle", methods=["POST"])
def toggle_reminder(user_id, reminder_id):
    body = request.get_json(force=True)
    enabled = body.get("enabled", True)
    result = memory_store.toggle_reminder(user_id, reminder_id, enabled)
    return jsonify({"ok": True, "data": result})


@app.route("/api/memory/emotion/<user_id>", methods=["GET", "POST"])
def handle_emotion(user_id):
    if request.method == "POST":
        data = request.get_json(force=True)
        result = memory_store.save_emotion(user_id, data)
        return jsonify({"ok": True, "data": result})
    data = memory_store.get_emotions(user_id)
    return jsonify({"ok": True, "data": data})


@app.route("/api/memory/events/<user_id>", methods=["GET", "POST"])
def handle_events(user_id):
    if request.method == "POST":
        data = request.get_json(force=True)
        result = memory_store.save_event(user_id, data)
        return jsonify({"ok": True, "data": result})
    data = memory_store.get_events(user_id)
    return jsonify({"ok": True, "data": data})


@app.route("/api/memory/summary/<user_id>", methods=["GET"])
def get_health_summary(user_id):
    days = request.args.get("days", 7, type=int)
    result = memory_store.get_health_summary(user_id, days)
    return jsonify({"ok": True, "data": result})


@app.route("/api/memory/export/<user_id>", methods=["GET"])
def export_data(user_id):
    result = memory_store.export_all_data(user_id)
    return jsonify({"ok": True, "data": result})


@app.route("/api/memory/import/<user_id>", methods=["POST"])
def import_data(user_id):
    data = request.get_json(force=True)
    result = memory_store.import_data(user_id, data)
    return jsonify({"ok": True, "data": result})


@app.route("/api/memory/clear/<user_id>", methods=["POST"])
def clear_data(user_id):
    memory_store.clear_all_data(user_id)
    return jsonify({"ok": True})


@app.route("/api/memory/search/<user_id>", methods=["POST"])
def semantic_search(user_id):
    body = request.get_json(force=True)
    query = body.get("query", "")
    top_k = body.get("topK", 5)
    results = memory_store.semantic_search(user_id, query, top_k)
    return jsonify({"ok": True, "data": results})


@app.route("/api/reminders/check/<user_id>", methods=["GET"])
def check_reminders(user_id):
    triggered = reminder_engine.check_and_fire(user_id)
    return jsonify({"ok": True, "data": triggered})


@app.route("/api/reminders/history/<user_id>", methods=["GET"])
def get_reminder_history(user_id):
    history = reminder_engine.get_history(user_id)
    return jsonify({"ok": True, "data": history})


@app.route("/api/reminders/confirm/<user_id>/<reminder_id>", methods=["POST"])
def confirm_reminder(user_id, reminder_id):
    body = request.get_json(force=True) if request.data else {}
    action = body.get("action", "done")
    result = reminder_engine.confirm_reminder(user_id, reminder_id, action)
    return jsonify({"ok": True, "data": result})


@app.route("/api/reminders/reschedule/<user_id>/<reminder_id>", methods=["POST"])
def reschedule_reminder(user_id, reminder_id):
    """安排重提醒"""
    result = reminder_engine.schedule_reschedule(user_id, reminder_id)
    return jsonify({"ok": True, "data": result})


@app.route("/api/reminders/missed/<user_id>/<reminder_id>", methods=["GET"])
def get_missed_count(user_id, reminder_id):
    """获取漏服次数"""
    count = reminder_engine.get_missed_count(user_id, reminder_id)
    return jsonify({"ok": True, "data": {"count": count}})


@app.route("/api/reminders/adherence/<user_id>", methods=["GET"])
def get_medication_adherence(user_id):
    """获取用药依从性统计"""
    days = request.args.get("days", 7, type=int)
    result = reminder_engine.get_medication_adherence(user_id, days)
    return jsonify({"ok": True, "data": result})


@app.route("/api/children/<parent_id>/medication-records", methods=["GET"])
def get_parent_medication_records(parent_id):
    """子女查看父母的用药记录"""
    days = request.args.get("days", 7, type=int)
    
    # 查询用药记录
    records = memory_store.query_records(parent_id, "med", days)
    
    # 查询提醒确认历史
    history = reminder_engine.get_history(parent_id)
    confirmed = [e for e in history.get("confirmed", []) if e.get("reminderId")]
    
    # 获取用药依从性
    adherence = reminder_engine.get_medication_adherence(parent_id, days)
    
    # 获取画像信息
    profile = memory_store.get_profile(parent_id)
    
    return jsonify({
        "ok": True,
        "data": {
            "parentName": profile.get("name", ""),
            "records": records,
            "confirmations": confirmed[-20:],  # 最近 20 条确认记录
            "adherence": adherence
        }
    })


@app.route("/api/children/<parent_id>/alert-events", methods=["GET"])
def get_parent_alert_events(parent_id):
    """子女查看父母的重要提醒事件（漏服通知）"""
    events = memory_store.get_events(parent_id)
    # 筛选出漏服相关的事件
    missed_events = [e for e in events.get("records", []) 
                     if e.get("type") == "reminder_missed"]
    return jsonify({
        "ok": True,
        "data": {
            "events": missed_events[-50:]  # 最近 50 条
        }
    })


@app.route("/api/memory/alerts/<user_id>", methods=["GET"])
def get_alerts(user_id):
    data = memory_store.get_alerts(user_id)
    return jsonify({"ok": True, "data": data})


@app.route("/api/memory/alerts/<user_id>", methods=["POST"])
def save_alert(user_id):
    alert = request.get_json(force=True)
    result = memory_store.save_alert(user_id, alert)
    return jsonify({"ok": True, "data": result})


@app.route("/api/memory/chat_history/<user_id>", methods=["GET"])
def get_chat_history(user_id):
    data = memory_store.get_chat_history(user_id)
    return jsonify({"ok": True, "data": data})


@app.route("/api/memory/chat_history/<user_id>", methods=["POST"])
def save_chat_history(user_id):
    history = request.get_json(force=True)
    result = memory_store.save_chat_history(user_id, history)
    return jsonify({"ok": True, "data": result})


@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"ok": True, "status": "running"})


# ==================== 紧急联系人 API ====================

@app.route("/api/emergency/contacts/<user_id>", methods=["GET"])
def get_emergency_contacts(user_id):
    """获取紧急联系人列表"""
    contacts = memory_store.get_emergency_contacts(user_id)
    return jsonify({"ok": True, "data": contacts})


@app.route("/api/emergency/contacts/<user_id>", methods=["POST"])
def add_emergency_contact(user_id):
    """添加紧急联系人"""
    data = request.get_json(force=True)
    result = memory_store.add_emergency_contact(user_id, data)
    return jsonify({"ok": True, "data": result})


@app.route("/api/emergency/contacts/<user_id>/<contact_id>", methods=["PUT"])
def update_emergency_contact(user_id, contact_id):
    """更新紧急联系人"""
    data = request.get_json(force=True)
    result = memory_store.update_emergency_contact(user_id, contact_id, data)
    return jsonify({"ok": True, "data": result})


@app.route("/api/emergency/contacts/<user_id>/<contact_id>", methods=["DELETE"])
def delete_emergency_contact(user_id, contact_id):
    """删除紧急联系人"""
    result = memory_store.delete_emergency_contact(user_id, contact_id)
    return jsonify({"ok": True, "data": result})


@app.route("/api/emergency/contacts/<user_id>/primary", methods=["GET"])
def get_primary_contact(user_id):
    """获取主要紧急联系人"""
    contact = memory_store.get_primary_contact(user_id)
    return jsonify({"ok": True, "data": contact})


# ==================== 家庭成员绑定 API ====================

@app.route("/api/family/bond/request", methods=["POST"])
def create_bond_request():
    """父母端发起绑定请求，生成邀请码"""
    data = request.get_json(force=True)
    parent_id = data.get("parent_id", "default")
    relationship = data.get("relationship", "child")
    child_label = data.get("child_label")
    phone = data.get("phone")
    
    result = family_db.create_bond_request(parent_id, relationship, child_label, phone)
    return jsonify(result)


@app.route("/api/family/bond/accept", methods=["POST"])
def accept_bond_request():
    """子女端接受绑定请求"""
    data = request.get_json(force=True)
    invite_code = data.get("invite_code")
    child_id = data.get("child_id", "default")
    
    result = family_db.accept_bond_request(invite_code, child_id)
    return jsonify(result)


@app.route("/api/family/bond/reject", methods=["POST"])
def reject_bond_request():
    """子女端拒绝绑定请求"""
    data = request.get_json(force=True)
    invite_code = data.get("invite_code")
    
    result = family_db.reject_bond_request(invite_code)
    return jsonify(result)


@app.route("/api/family/bond/revoke/<bond_id>", methods=["POST"])
def revoke_bond(bond_id):
    """撤销绑定关系"""
    result = family_db.revoke_bond(bond_id)
    return jsonify(result)


@app.route("/api/family/bond/delete/<bond_id>", methods=["DELETE"])
def delete_bond(bond_id):
    """删除绑定关系"""
    result = family_db.delete_bond(bond_id)
    return jsonify(result)


@app.route("/api/family/bonds/parent/<parent_id>", methods=["GET"])
def get_parent_bonds(parent_id):
    """获取父母的所有绑定关系"""
    result = family_db.get_parent_bonds(parent_id)
    return jsonify(result)


@app.route("/api/family/bonds/child/<child_id>", methods=["GET"])
def get_child_bonds(child_id):
    """获取子女的所有绑定关系"""
    result = family_db.get_child_bonds(child_id)
    return jsonify(result)


@app.route("/api/family/bond/<bond_id>", methods=["GET"])
def get_bond(bond_id):
    """获取单个绑定关系详情"""
    result = family_db.get_bond(bond_id)
    return jsonify(result)


# ==================== 授权管理 API ====================

@app.route("/api/family/permissions/<bond_id>", methods=["GET"])
def get_permissions(bond_id):
    """获取绑定关系的所有权限设置"""
    result = family_db.get_permissions(bond_id)
    return jsonify(result)


@app.route("/api/family/permissions/<bond_id>", methods=["POST"])
def update_permissions(bond_id):
    """批量更新权限设置"""
    data = request.get_json(force=True)
    for permission_type, enabled in data.items():
        family_db.update_permission(bond_id, permission_type, 1 if enabled else 0)
    return jsonify({"ok": True})


@app.route("/api/family/permissions/<bond_id>/<permission_type>", methods=["PUT"])
def update_single_permission(bond_id, permission_type):
    """更新单个权限"""
    data = request.get_json(force=True)
    enabled = data.get("enabled", True)
    result = family_db.update_permission(bond_id, permission_type, 1 if enabled else 0)
    return jsonify(result)


# ==================== 通知订阅 API ====================

@app.route("/api/family/notifications/<bond_id>", methods=["GET"])
def get_notifications(bond_id):
    """获取绑定关系的所有通知订阅"""
    result = family_db.get_notifications(bond_id)
    return jsonify(result)


@app.route("/api/family/notifications/<bond_id>", methods=["POST"])
def update_notifications(bond_id):
    """批量更新通知订阅"""
    data = request.get_json(force=True)
    for notification_type, enabled in data.items():
        family_db.update_notification(bond_id, notification_type, 1 if enabled else 0)
    return jsonify({"ok": True})


@app.route("/api/family/notifications/<bond_id>/<notification_type>", methods=["PUT"])
def update_single_notification(bond_id, notification_type):
    """更新单个通知订阅"""
    data = request.get_json(force=True)
    enabled = data.get("enabled", True)
    result = family_db.update_notification(bond_id, notification_type, 1 if enabled else 0)
    return jsonify(result)


# ==================== 数据访问验证 API ====================

@app.route("/api/family/validate/<child_id>/<parent_id>/<permission_type>", methods=["GET"])
def validate_access(child_id, parent_id, permission_type):
    """验证子女是否有权限访问父母的数据"""
    result = family_db.validate_access(child_id, parent_id, permission_type)
    return jsonify(result)


# ==================== 子女端查看父母数据 API ====================

@app.route("/api/family/parent/<parent_id>/health-summary", methods=["GET"])
def get_parent_health_summary(parent_id):
    """子女查看父母的健康数据摘要（需要验证权限）"""
    child_id = request.args.get("child_id", "default")
    
    # 验证权限
    result = family_db.validate_access(child_id, parent_id, "blood_pressure")
    if not result["allowed"]:
        return jsonify({"ok": False, "error": "无权访问该数据"})
    
    days = request.args.get("days", 7, type=int)
    summary = memory_store.get_health_summary(parent_id, days)
    profile = memory_store.get_profile(parent_id)
    
    return jsonify({
        "ok": True,
        "data": {
            "parentName": profile.get("name", "父母"),
            "summary": summary
        }
    })


@app.route("/api/family/parent/<parent_id>/records/<record_type>", methods=["GET"])
def get_parent_records(parent_id, record_type):
    """子女查看父母的特定类型健康记录"""
    child_id = request.args.get("child_id", "default")
    
    # 根据记录类型验证相应权限
    permission_map = {
        "bp": "blood_pressure",
        "bs": "blood_sugar",
        "bg": "blood_sugar",
        "med": "medication",
        "weight": "weight"
    }
    permission_type = permission_map.get(record_type, record_type)
    
    result = family_db.validate_access(child_id, parent_id, permission_type)
    if not result["allowed"]:
        return jsonify({"ok": False, "error": "无权访问该数据"})
    
    days = request.args.get("days", 7, type=int)
    records = memory_store.query_records(parent_id, record_type, days)
    
    return jsonify({"ok": True, "data": records})


@app.route("/api/family/parent/<parent_id>/alerts", methods=["GET"])
def get_parent_alerts(parent_id):
    """子女查看父母的告警记录（需要验证权限）"""
    child_id = request.args.get("child_id", "default")
    
    # 验证紧急情况权限
    result = family_db.validate_access(child_id, parent_id, "emergency")
    if not result["allowed"]:
        return jsonify({"ok": False, "error": "无权访问该数据"})
    
    alerts = memory_store.get_alerts(parent_id)
    
    return jsonify({"ok": True, "data": alerts})


# ==================== 天气服务 API ====================
@app.route("/api/weather/current", methods=["GET"])
def get_current_weather():
    city = request.args.get('city', '101280101')
    data = weather_service.fetch_weather(city)
    return jsonify({"ok": True, "data": data})


@app.route("/api/weather/forecast", methods=["GET"])
def get_weather_forecast():
    city = request.args.get('city', '101280101')
    data = weather_service.fetch_forecast(city)
    return jsonify({"ok": True, "data": data})


@app.route("/api/weather/advisory", methods=["GET"])
def get_weather_advisory():
    user_id = request.args.get('user_id', 'default')
    data = weather_service.get_health_advisory(user_id)
    return jsonify({"ok": True, "data": data})


@app.route("/api/weather/alerts", methods=["GET"])
def get_weather_alerts():
    alerts = weather_service.check_weather_alerts()
    return jsonify({"ok": True, "data": alerts})


if __name__ == "__main__":
    print("=" * 50)
    print("  银发健康助手 - 记忆后端服务")
    print("  http://localhost:5001/api/health")
    print("  http://localhost:5001/api/weather/current")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5001, debug=True)
