import { MemoryService } from './intent/memoryService.js';
import { alertService } from './intent/alertService.js';
import { applyFontSize } from './utils.js';

const CURRENT_USER_ID = "default";
const memoryService = new MemoryService(CURRENT_USER_ID);

applyFontSize();

function safeFormatDate(timeStr) {
  if (!timeStr) return '';
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) {
    if (typeof timeStr === 'string') return timeStr;
    return '';
  }
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getTypeLabel(type) {
  switch (type) {
    case 'med': case 'medication': return '用药';
    case 'bp': case 'blood_pressure': return '血压';
    case 'bs': case 'blood_sugar': return '血糖';
    case 'temp': case 'temperature': return '体温';
    default: return '提醒';
  }
}

function getTypeIcon(type) {
  switch (type) {
    case 'med': case 'medication': return '💊';
    case 'bp': case 'blood_pressure': return '🩺';
    case 'bs': case 'blood_sugar': return '🩸';
    case 'temp': case 'temperature': return '🌡️';
    default: return '⏰';
  }
}

function getTypeColor(type) {
  switch (type) {
    case 'med': case 'medication': return '#10b981';
    case 'bp': case 'blood_pressure': return '#ef4444';
    case 'bs': case 'blood_sugar': return '#f59e0b';
    case 'temp': case 'temperature': return '#3b82f6';
    default: return 'var(--primary-color)';
  }
}

function buildReminderMessage(r) {
  if (r.message && r.message.trim() && r.message !== '提醒' && r.message !== '提醒提醒') return r.message;
  if (r.title && r.title.trim()) return r.title;
  if (r.description && r.description.trim()) return r.description;

  const typeLabel = getTypeLabel(r.type);
  const timeStr = r.time || '';
  const drugName = translateDrugName(r.drugName || r.medicine || '');
  const freq = translateFrequency(r.frequency || '');

  if (drugName) {
    return `${timeStr ? timeStr + ' ' : ''}服用${drugName}`;
  }

  if (r.type === 'bp' || r.type === 'blood_pressure' || typeLabel === '血压') {
    return `${timeStr ? timeStr + ' ' : ''}测量血压`;
  }
  if (r.type === 'bs' || r.type === 'blood_sugar' || typeLabel === '血糖') {
    return `${timeStr ? timeStr + ' ' : ''}测量血糖`;
  }
  if (r.type === 'temp' || r.type === 'temperature' || typeLabel === '体温') {
    return `${timeStr ? timeStr + ' ' : ''}测量体温`;
  }

  return `${timeStr ? timeStr + ' ' : ''}${typeLabel}提醒`;
}

function buildScheduleStr(r) {
  const freq = translateFrequency(r.frequency || '');
  const timeStr = r.time || '';
  if (!timeStr && !freq) return '';
  const parts = [];
  if (freq) parts.push(freq);
  if (timeStr) parts.push(timeStr);
  return parts.join(' ');
}

function translateFrequency(freq) {
  if (!freq) return '';
  const f = freq.toLowerCase().trim();
  switch (f) {
    case 'daily': return '每天';
    case 'weekly': return '每周';
    case 'monthly': return '每月';
    case 'once': return '仅一次';
    case 'everyday': return '每天';
    case 'every week': return '每周';
    default: break;
  }
  if (f.startsWith('days_')) {
    const count = f.replace('days_', '');
    return `连续${count}天`;
  }
  if (f.startsWith('weekdays_')) {
    const dayMap = { '0': '周日', '1': '周一', '2': '周二', '3': '周三', '4': '周四', '5': '周五', '6': '周六' };
    const days = f.replace('weekdays_', '').split(',').map(d => dayMap[d] || d).join('、');
    return `每周${days}`;
  }
  return '';
}

function translateDrugName(name) {
  if (!name) return '';
  const n = name.trim();
  const map = {
    'test_drug': '测试药品',
    'aspirin': '阿司匹林',
    'amlodipine': '氨氯地平',
    'metformin': '二甲双胍',
    'nifedipine': '硝苯地平',
    'atorvastatin': '阿托伐他汀',
    'lisinopril': '赖诺普利',
  };
  if (map[n.toLowerCase()]) return map[n.toLowerCase()];
  if (n.includes('_')) return n.replace(/_/g, '');
  return n;
}

async function loadReminders() {
  const listEl = document.getElementById('reminderList');
  const closedEl = document.getElementById('closedList');
  const closedCount = document.getElementById('closedCount');
  const activeCount = document.getElementById('activeCount');

  try {
    const data = await memoryService.loadReminders();
    const reminders = data.reminders || [];

    const active = reminders.filter(r => r.active !== false && r.enabled !== false);
    const closed = reminders.filter(r => r.active === false || r.enabled === false);

    activeCount.textContent = `(${active.length})`;

    if (active.length === 0) {
      listEl.innerHTML = `
        <div class="reminder-empty">
          <div class="reminder-empty__icon">📋</div>
          <div class="reminder-empty__text">暂无开启的提醒</div>
          <div class="reminder-empty__hint">您可以对助手说"提醒我每天早上8点吃降压药"来添加提醒</div>
        </div>
      `;
    } else {
      listEl.innerHTML = active.map(r => renderReminderCard(r, false)).join('');
    }

    closedCount.textContent = `(${closed.length})`;
    if (closed.length === 0) {
      closedEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:var(--font-md);">暂无</div>';
    } else {
      closedEl.innerHTML = closed.map(r => renderReminderCard(r, true)).join('');
    }

    bindReminderEvents();

  } catch (e) {
    listEl.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">加载提醒失败，请稍后重试</div>';
    console.error('加载提醒失败:', e);
  }
}

function renderReminderCard(r, isClosed) {
  const typeIcon = getTypeIcon(r.type);
  const typeLabel = getTypeLabel(r.type);
  const typeColor = getTypeColor(r.type);
  const message = buildReminderMessage(r);
  const scheduleStr = buildScheduleStr(r);
  const timeStr = safeFormatDate(r.createdAt);
  const rid = r.id || '';

  return `
    <div class="reminder-card ${isClosed ? 'reminder-card--closed' : ''}" style="border-left: 5px solid ${typeColor};">
      <div class="reminder-card__icon">${typeIcon}</div>
      <div class="reminder-card__content">
        <div class="reminder-card__type" style="color:${typeColor};">${typeLabel}提醒</div>
        <div class="reminder-card__message">${message}</div>
        ${scheduleStr ? `<div class="reminder-card__schedule">⏰ ${scheduleStr}</div>` : ''}
        ${timeStr ? `<div class="reminder-card__time">创建于 ${timeStr}</div>` : ''}
      </div>
      <div class="reminder-card__actions">
        ${!isClosed ? `
          <label class="reminder-switch" title="开关提醒">
            <input type="checkbox" class="reminder-toggle" data-id="${rid}" checked>
            <span class="reminder-switch__slider"></span>
          </label>
        ` : `
          <button class="reminder-reopen" data-id="${rid}" title="重新开启">
            <span class="material-icons">play_arrow</span>
          </button>
        `}
        <button class="reminder-edit" data-id="${rid}" title="编辑提醒">
          <span class="material-icons">edit</span>
        </button>
        <button class="reminder-delete" data-id="${rid}" title="删除提醒">
          <span class="material-icons">delete</span>
        </button>
      </div>
    </div>
  `;
}

function bindReminderEvents() {
  document.querySelectorAll('.reminder-toggle').forEach(toggle => {
    toggle.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const active = e.target.checked;
      try {
        await memoryService.toggleReminder(id, active);
        loadReminders();
      } catch (err) {
        console.error('切换提醒失败:', err);
        e.target.checked = !active;
      }
    });
  });

  document.querySelectorAll('.reminder-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('确定删除这条提醒吗？')) {
        try {
          await memoryService.removeReminder(id);
          loadReminders();
        } catch (err) {
          console.error('删除提醒失败:', err);
        }
      }
    });
  });

  document.querySelectorAll('.reminder-reopen').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      try {
        await memoryService.toggleReminder(id, true);
        loadReminders();
      } catch (err) {
        console.error('重新开启失败:', err);
      }
    });
  });

  document.querySelectorAll('.reminder-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.currentTarget.dataset.id;
      showEditModal(id);
    });
  });
}

function showEditModal(reminderId) {
  const existing = document.getElementById('editModal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'editModal';
  modal.className = 'edit-modal';
  modal.innerHTML = `
    <div class="edit-modal__overlay" onclick="document.getElementById('editModal').remove()"></div>
    <div class="edit-modal__content">
      <div class="edit-modal__title">编辑提醒</div>
      <div class="edit-modal__field">
        <label>提醒内容</label>
        <input type="text" id="editMessage" class="edit-modal__input" placeholder="如：服用降压药">
      </div>
      <div class="edit-modal__field">
        <label>提醒时间</label>
        <input type="time" id="editTime" class="edit-modal__input">
      </div>
      <div class="edit-modal__field">
        <label>药名（用药提醒时）</label>
        <input type="text" id="editDrugName" class="edit-modal__input" placeholder="如：降压药">
      </div>
      <div class="edit-modal__field">
        <label>重复频率</label>
        <div class="edit-freq-options" id="editFreqOptions">
          <button class="edit-freq-btn" data-freq="daily">每天</button>
          <button class="edit-freq-btn" data-freq="once">仅一次</button>
          <button class="edit-freq-btn" data-freq="weekly">每周</button>
          <button class="edit-freq-btn" data-freq="custom">自定义</button>
        </div>
      </div>
      <div class="edit-modal__field" id="editDaysGroup" style="display:none;">
        <label>选择哪几天</label>
        <div class="edit-days-options" id="editDaysOptions">
          <button class="edit-day-btn" data-day="1">周一</button>
          <button class="edit-day-btn" data-day="2">周二</button>
          <button class="edit-day-btn" data-day="3">周三</button>
          <button class="edit-day-btn" data-day="4">周四</button>
          <button class="edit-day-btn" data-day="5">周五</button>
          <button class="edit-day-btn" data-day="6">周六</button>
          <button class="edit-day-btn" data-day="0">周日</button>
        </div>
      </div>
      <div class="edit-modal__field" id="editDaysCountGroup" style="display:none;">
        <label>连续提醒天数</label>
        <input type="number" id="editDaysCount" class="edit-modal__input" min="1" max="365" placeholder="如：7（提醒7天）">
      </div>
      <div class="edit-modal__actions">
        <button class="edit-modal__cancel" onclick="document.getElementById('editModal').remove()">取消</button>
        <button class="edit-modal__save" id="editSaveBtn">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  let selectedFreq = '';
  let selectedDays = new Set();

  const freqBtns = modal.querySelectorAll('.edit-freq-btn');
  const daysGroup = modal.querySelector('#editDaysGroup');
  const daysCountGroup = modal.querySelector('#editDaysCountGroup');
  const dayBtns = modal.querySelectorAll('.edit-day-btn');

  freqBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      freqBtns.forEach(b => b.classList.remove('edit-freq-btn--active'));
      btn.classList.add('edit-freq-btn--active');
      selectedFreq = btn.dataset.freq;
      daysGroup.style.display = selectedFreq === 'weekly' ? '' : 'none';
      daysCountGroup.style.display = selectedFreq === 'custom' ? '' : 'none';
    });
  });

  dayBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const day = btn.dataset.day;
      if (selectedDays.has(day)) {
        selectedDays.delete(day);
        btn.classList.remove('edit-day-btn--active');
      } else {
        selectedDays.add(day);
        btn.classList.add('edit-day-btn--active');
      }
    });
  });

  (async () => {
    try {
      const data = await memoryService.loadReminders();
      const r = (data.reminders || []).find(r => r.id === reminderId);
      if (!r) return;

      document.getElementById('editMessage').value = r.message || buildReminderMessage(r);
      document.getElementById('editTime').value = r.time || '';
      document.getElementById('editDrugName').value = r.drugName || r.medicine || '';

      const freq = r.frequency || '';
      if (freq) {
        const matchingBtn = modal.querySelector(`.edit-freq-btn[data-freq="${freq}"]`);
        if (matchingBtn) {
          matchingBtn.click();
        } else if (freq.startsWith('days_')) {
          modal.querySelector('.edit-freq-btn[data-freq="custom"]').click();
          document.getElementById('editDaysCount').value = freq.replace('days_', '');
        } else if (freq.startsWith('weekdays_')) {
          modal.querySelector('.edit-freq-btn[data-freq="weekly"]').click();
          const days = freq.replace('weekdays_', '').split(',');
          days.forEach(d => {
            const dayBtn = modal.querySelector(`.edit-day-btn[data-day="${d}"]`);
            if (dayBtn) dayBtn.click();
          });
        }
      }

      document.getElementById('editSaveBtn').addEventListener('click', async () => {
        const newMsg = document.getElementById('editMessage').value.trim();
        const newTime = document.getElementById('editTime').value;
        const newDrug = document.getElementById('editDrugName').value.trim();

        if (selectedFreq === 'weekly' && selectedDays.size === 0) {
          alert('请选择每周的具体星期几');
          return;
        }

        let newFreq = selectedFreq;
        if (selectedFreq === 'weekly' && selectedDays.size > 0) {
          newFreq = 'weekdays_' + Array.from(selectedDays).sort().join(',');
        } else if (selectedFreq === 'custom') {
          const count = document.getElementById('editDaysCount').value;
          if (count && parseInt(count) > 0) {
            newFreq = 'days_' + count;
          }
        }

        try {
          const allData = await memoryService.loadReminders();
          const reminder = (allData.reminders || []).find(r => r.id === reminderId);
          if (reminder) {
            if (newMsg) reminder.message = newMsg;
            if (newTime) reminder.time = newTime;
            if (newDrug) reminder.drugName = newDrug;
            if (newFreq) reminder.frequency = newFreq;
            await memoryService.updateReminders(allData);
            modal.remove();
            loadReminders();
          }
        } catch (err) {
          console.error('保存失败:', err);
        }
      });
    } catch (err) {
      console.error('加载提醒数据失败:', err);
    }
  })();
}

function loadAlerts() {
  const alertListEl = document.getElementById('alertList');
  const alerts = alertService.getAllAlerts();
  const recent = alerts
    .filter(a => Date.now() - new Date(a.time).getTime() < 7 * 24 * 60 * 60 * 1000)
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 5);

  if (recent.length === 0) {
    alertListEl.innerHTML = `
      <div class="reminder-empty">
        <div class="reminder-empty__icon">✅</div>
        <div class="reminder-empty__text">近期健康指标正常</div>
      </div>
    `;
    return;
  }

  alertListEl.innerHTML = recent.map(a => {
    const icon = a.severity === 'URGENT' || a.severity === 'BLOCK' ? '🚨' : a.severity === 'WARN' ? '⚠️' : 'ℹ️';
    const level = a.severity === 'URGENT' || a.severity === 'BLOCK' ? 'urgent' : a.severity === 'WARN' ? 'warn' : 'info';
    const time = safeFormatDate(a.time);
    const msg = (a.message || '').replace(/null/g, '未知');
    return `
      <div class="alert-item-child alert-item-child--${level}">
        <div class="alert-item-child__icon">${icon}</div>
        <div class="alert-item-child__content">
          <div class="alert-item-child__title">${a.title || '健康异常'}</div>
          <div class="alert-item-child__message">${msg}</div>
          <div class="alert-item-child__time">${time}</div>
        </div>
      </div>
    `;
  }).join('');
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadReminders();
  loadAlerts();

  document.getElementById('refreshBtn').addEventListener('click', loadReminders);

  const closedHeader = document.getElementById('closedHeader');
  const closedList = document.getElementById('closedList');
  const closedArrow = document.getElementById('closedArrow');
  let closedExpanded = false;

  closedHeader.addEventListener('click', () => {
    closedExpanded = !closedExpanded;
    closedList.style.display = closedExpanded ? '' : 'none';
    closedArrow.textContent = closedExpanded ? 'expand_less' : 'expand_more';
  });
});
