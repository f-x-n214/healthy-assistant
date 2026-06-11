from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from memory_service import MemoryStore
from reminder_engine import ReminderEngine
from family_service import FamilyDB
from weather_service import weather_service
import os
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "frontend"))

try:
    from dotenv import load_dotenv

    load_dotenv(os.path.join(BASE_DIR, "..", ".env"))
    load_dotenv(os.path.join(BASE_DIR, ".env"))
except ImportError:
    pass

DASHSCOPE_API_KEY = os.environ.get("DASHSCOPE_API_KEY") or os.environ.get("LLM_API_KEY", "")
DASHSCOPE_ENDPOINT = os.environ.get(
    "DASHSCOPE_ENDPOINT",
    "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
)
DASHSCOPE_MODEL = os.environ.get("DASHSCOPE_MODEL", "qwen-plus")

_default_cors = (
    "http://localhost:63342,http://localhost:8080,"
    "http://127.0.0.1:63342,http://127.0.0.1:8080,http://localhost:5001"
)
_cors_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", _default_cors).split(",")
    if o.strip()
]

app = Flask(__name__, static_folder=None)
CORS(
    app,
    origins=_cors_origins,
    supports_credentials=True,
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Origin", "Accept"],
)

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
def _weather_location_from_request():
    """支持 location（推荐）、city（兼容旧参数）、经纬度 lat+lon"""
    location = request.args.get("location") or request.args.get("city")
    lat = request.args.get("lat")
    lon = request.args.get("lon")
    if not location and lat and lon:
        location = f"{lon},{lat}"
    return location


@app.route("/api/weather/current", methods=["GET"])
def get_current_weather():
    data = weather_service.fetch_weather(_weather_location_from_request())
    return jsonify({"ok": True, "data": data})


@app.route("/api/weather/forecast", methods=["GET"])
def get_weather_forecast():
    data = weather_service.fetch_forecast(_weather_location_from_request())
    return jsonify({"ok": True, "data": data})


@app.route("/api/weather/advisory", methods=["GET"])
def get_weather_advisory():
    user_id = request.args.get("user_id", "default")
    data = weather_service.get_health_advisory(user_id, _weather_location_from_request())
    return jsonify({"ok": True, "data": data})


@app.route("/api/weather/alerts", methods=["GET"])
def get_weather_alerts():
    alerts = weather_service.check_weather_alerts(_weather_location_from_request())
    return jsonify({"ok": True, "data": alerts})


# ==================== 大模型代理（API Key 仅存服务端） ====================
@app.route("/api/llm/config", methods=["GET"])
def llm_config():
    return jsonify({
        "ok": True,
        "configured": bool(DASHSCOPE_API_KEY),
        "model": DASHSCOPE_MODEL,
        "endpoint": DASHSCOPE_ENDPOINT.split("/")[2] if DASHSCOPE_ENDPOINT else "",
    })


@app.route("/api/llm/chat", methods=["POST"])
def llm_chat_proxy():
    if not DASHSCOPE_API_KEY:
        return jsonify({
            "ok": False,
            "error": "DASHSCOPE_API_KEY 未配置，请在项目根目录创建 .env 文件（参考 .env.example）",
        }), 500

    body = request.get_json(force=True)
    payload = {
        "model": body.get("model", DASHSCOPE_MODEL),
        "messages": body.get("messages", []),
        "temperature": body.get("temperature", 0.2),
        "max_tokens": body.get("max_tokens", 300),
    }

    try:
        resp = requests.post(
            DASHSCOPE_ENDPOINT,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {DASHSCOPE_API_KEY}",
            },
            json=payload,
            timeout=90,
        )
    except requests.RequestException as e:
        return jsonify({"ok": False, "error": f"LLM 请求失败: {e}"}), 502

    if not resp.ok:
        try:
            err_body = resp.json()
            err_obj = err_body.get("error", err_body)
            msg = err_obj.get("message", resp.text) if isinstance(err_obj, dict) else resp.text
        except ValueError:
            msg = resp.text
        return jsonify({"ok": False, "error": msg}), resp.status_code

    return jsonify(resp.json())


# ==================== 前端静态资源（Render 一体部署） ====================
@app.route("/")
def serve_index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:filepath>")
def serve_frontend(filepath):
    if filepath.startswith("api/"):
        return jsonify({"ok": False, "error": "not found"}), 404

    safe_path = os.path.normpath(filepath)
    if safe_path.startswith("..") or os.path.isabs(safe_path):
        return jsonify({"ok": False, "error": "forbidden"}), 403

    file_on_disk = os.path.join(FRONTEND_DIR, safe_path)
    # Flask send_from_directory 在 Windows 上需要正斜杠路径
    serve_path = safe_path.replace("\\", "/")

    if os.path.isfile(file_on_disk):
        return send_from_directory(FRONTEND_DIR, serve_path)

    html_path = file_on_disk + ".html"
    if os.path.isfile(html_path):
        return send_from_directory(FRONTEND_DIR, serve_path + ".html")

    return send_from_directory(FRONTEND_DIR, "index.html")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    print("=" * 50)
    print("  银发健康助手")
    print(f"  前端+后端: http://localhost:{port}")
    print(f"  API 健康检查: http://localhost:{port}/api/health")
    if DASHSCOPE_API_KEY:
        print(f"  大模型: {DASHSCOPE_MODEL} @ {DASHSCOPE_ENDPOINT}")
    else:
        print("  大模型: 未配置（请在 .env 中设置 DASHSCOPE_API_KEY）")
    qweather_key = os.environ.get("QWEATHER_API_KEY", "")
    qweather_host = os.environ.get("QWEATHER_API_HOST", "")
    if qweather_key:
        print(f"  天气: 和风天气 @ {qweather_host or 'devapi.qweather.com'}")
    else:
        print("  天气: 未配置和风 Key（将使用模拟天气）")
    print("=" * 50)
    app.run(host="0.0.0.0", port=port, debug=debug)
