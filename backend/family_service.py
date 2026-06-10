import sqlite3
import os
import uuid
from datetime import datetime

class FamilyDB:
    def __init__(self, db_path="family.db"):
        self.db_path = os.path.join(os.path.dirname(__file__), "data", db_path)
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        """初始化数据库表"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            
            # 家庭成员绑定关系表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS family_bonds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    parent_id TEXT NOT NULL,
                    child_id TEXT DEFAULT '',
                    relationship TEXT NOT NULL,
                    child_label TEXT,
                    phone TEXT,
                    status TEXT DEFAULT 'pending',
                    invite_code TEXT UNIQUE,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    accepted_at TEXT,
                    revoked_at TEXT
                )
            ''')
            
            # 授权权限表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS family_permissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bond_id INTEGER,
                    permission_type TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(bond_id) REFERENCES family_bonds(id) ON DELETE CASCADE
                )
            ''')
            
            # 通知订阅表
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS family_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bond_id INTEGER,
                    notification_type TEXT NOT NULL,
                    enabled INTEGER DEFAULT 1,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY(bond_id) REFERENCES family_bonds(id) ON DELETE CASCADE
                )
            ''')
            
            conn.commit()

    def create_bond_request(self, parent_id, relationship, child_label=None, phone=None):
        """创建绑定请求（父母端发起）"""
        invite_code = str(uuid.uuid4())[:8].upper()
        
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO family_bonds 
                (parent_id, child_id, relationship, child_label, phone, status, invite_code, created_at)
                VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
            ''', (parent_id, "", relationship, child_label, phone, invite_code, datetime.now().isoformat()))
            
            conn.commit()
            return {"ok": True, "invite_code": invite_code, "bond_id": cursor.lastrowid}

    def accept_bond_request(self, invite_code, child_id):
        """接受绑定请求（子女端）"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM family_bonds WHERE invite_code = ? AND status = 'pending'
            ''', (invite_code,))
            
            bond = cursor.fetchone()
            if not bond:
                return {"ok": False, "error": "邀请码无效或已过期"}
            
            bond_id, parent_id, _, relationship, child_label, phone, status, _, created_at, _, _ = bond
            
            # 检查是否已存在相同的绑定关系
            cursor.execute('''
                SELECT id FROM family_bonds 
                WHERE parent_id = ? AND child_id = ? AND status = 'accepted'
            ''', (parent_id, child_id))
            
            if cursor.fetchone():
                return {"ok": False, "error": "已存在相同的绑定关系"}
            
            # 更新绑定状态
            cursor.execute('''
                UPDATE family_bonds 
                SET child_id = ?, status = 'accepted', accepted_at = ?
                WHERE id = ?
            ''', (child_id, datetime.now().isoformat(), bond_id))
            
            # 创建默认权限
            default_permissions = ['medication', 'blood_pressure', 'blood_sugar', 'weight', 'emergency']
            for perm in default_permissions:
                cursor.execute('''
                    INSERT INTO family_permissions (bond_id, permission_type, enabled)
                    VALUES (?, ?, 1)
                ''', (bond_id, perm))
            
            # 创建默认通知订阅
            default_notifications = ['medication_reminder', 'missed_medication', 'health_alert', 'emergency']
            for notify in default_notifications:
                cursor.execute('''
                    INSERT INTO family_notifications (bond_id, notification_type, enabled)
                    VALUES (?, ?, 1)
                ''', (bond_id, notify))
            
            conn.commit()
            
            return {
                "ok": True,
                "bond_id": bond_id,
                "parent_id": parent_id,
                "relationship": relationship,
                "child_label": child_label
            }

    def reject_bond_request(self, invite_code):
        """拒绝绑定请求"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE family_bonds SET status = 'rejected' WHERE invite_code = ? AND status = 'pending'
            ''', (invite_code,))
            conn.commit()
            return {"ok": True, "updated": cursor.rowcount > 0}

    def revoke_bond(self, bond_id):
        """撤销绑定关系"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE family_bonds SET status = 'revoked', revoked_at = ? WHERE id = ?
            ''', (datetime.now().isoformat(), bond_id))
            conn.commit()
            return {"ok": True, "updated": cursor.rowcount > 0}

    def get_parent_bonds(self, parent_id):
        """获取父母的所有绑定关系"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM family_bonds WHERE parent_id = ? ORDER BY created_at DESC
            ''', (parent_id,))
            
            columns = [desc[0] for desc in cursor.description]
            bonds = [dict(zip(columns, row)) for row in cursor.fetchall()]
            return {"ok": True, "data": bonds}

    def get_child_bonds(self, child_id):
        """获取子女的所有绑定关系"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM family_bonds WHERE child_id = ? AND status = 'accepted' ORDER BY accepted_at DESC
            ''', (child_id,))
            
            columns = [desc[0] for desc in cursor.description]
            bonds = [dict(zip(columns, row)) for row in cursor.fetchall()]
            return {"ok": True, "data": bonds}

    def get_bond(self, bond_id):
        """获取单个绑定关系"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT * FROM family_bonds WHERE id = ?
            ''', (bond_id,))
            
            row = cursor.fetchone()
            if not row:
                return {"ok": False, "error": "绑定关系不存在"}
            
            columns = [desc[0] for desc in cursor.description]
            return {"ok": True, "data": dict(zip(columns, row))}

    def update_permission(self, bond_id, permission_type, enabled):
        """更新权限设置"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE family_permissions 
                SET enabled = ? 
                WHERE bond_id = ? AND permission_type = ?
            ''', (enabled, bond_id, permission_type))
            
            if cursor.rowcount == 0:
                # 如果不存在，创建新权限
                cursor.execute('''
                    INSERT INTO family_permissions (bond_id, permission_type, enabled)
                    VALUES (?, ?, ?)
                ''', (bond_id, permission_type, enabled))
            
            conn.commit()
            return {"ok": True}

    def get_permissions(self, bond_id):
        """获取绑定关系的所有权限"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT permission_type, enabled FROM family_permissions WHERE bond_id = ?
            ''', (bond_id,))
            
            permissions = {}
            for perm_type, enabled in cursor.fetchall():
                permissions[perm_type] = bool(enabled)
            
            return {"ok": True, "data": permissions}

    def update_notification(self, bond_id, notification_type, enabled):
        """更新通知订阅设置"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE family_notifications 
                SET enabled = ? 
                WHERE bond_id = ? AND notification_type = ?
            ''', (enabled, bond_id, notification_type))
            
            if cursor.rowcount == 0:
                cursor.execute('''
                    INSERT INTO family_notifications (bond_id, notification_type, enabled)
                    VALUES (?, ?, ?)
                ''', (bond_id, notification_type, enabled))
            
            conn.commit()
            return {"ok": True}

    def get_notifications(self, bond_id):
        """获取绑定关系的所有通知订阅"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT notification_type, enabled FROM family_notifications WHERE bond_id = ?
            ''', (bond_id,))
            
            notifications = {}
            for notify_type, enabled in cursor.fetchall():
                notifications[notify_type] = bool(enabled)
            
            return {"ok": True, "data": notifications}

    def validate_access(self, child_id, parent_id, permission_type):
        """验证子女是否有权限访问父母的数据"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT p.enabled 
                FROM family_bonds b
                JOIN family_permissions p ON b.id = p.bond_id
                WHERE b.parent_id = ? AND b.child_id = ? 
                  AND b.status = 'accepted' AND p.permission_type = ?
            ''', (parent_id, child_id, permission_type))
            
            row = cursor.fetchone()
            if row and row[0] == 1:
                return {"ok": True, "allowed": True}
            return {"ok": True, "allowed": False}

    def delete_bond(self, bond_id):
        """删除绑定关系（级联删除权限和通知）"""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute('DELETE FROM family_bonds WHERE id = ?', (bond_id,))
            conn.commit()
            return {"ok": True, "deleted": cursor.rowcount > 0}
