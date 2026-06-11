import { MemoryService } from './intent/memoryService.js';
import { applyFontSize } from './utils.js';

const CURRENT_USER_ID = "default";
const memoryService = new MemoryService(CURRENT_USER_ID);

let chartInstance = null;
let rangeDays = 7;
let currentTab = 'bp';

applyFontSize();

function formatDate(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDose(dose) {
  if (!dose) return '';
  if (typeof dose === 'string') return dose;
  if (typeof dose === 'object') {
    const amount = dose.amount || dose.count || '';
    const unit = dose.unit || '';
    if (amount && unit) return `${amount}${unit}`;
    if (amount) return `${amount}`;
    return '';
  }
  return String(dose);
}

function assessBP(s, d) {
  if (s >= 180 || d >= 110) return '危险';
  if (s >= 140 || d >= 90) return '偏高';
  if ((s >= 130 && s < 140) || (d >= 80 && d < 90)) return '正常偏高';
  if (s < 90 || d < 60) return '偏低';
  return '正常';
}

function assessBS(v, t) {
  const n = parseFloat(v);
  if (t === 'fasting') {
    if (n >= 7.0) return '偏高';
    if (n >= 6.1) return '正常偏高';
    if (n < 3.9) return '偏低';
    return '正常';
  }
  if (n >= 11.1) return '偏高';
  if (n >= 7.8) return '正常偏高';
  if (n < 3.9) return '偏低';
  return '正常';
}

function statusClass(s) {
  if (s === '危险') return 'danger';
  if (s === '偏高' || s === '偏低') return 'warning';
  return 'normal';
}

// 加载所有关键指标
async function loadKeyStats() {
  try {
    const [bpRecords, bsRecords, weightRecords] = await Promise.all([
      memoryService.queryBloodPressure(30),
      memoryService.queryBloodSugar(30),
      memoryService.queryWeight(30),
    ]);

    // 血压
    if (bpRecords && bpRecords.length > 0) {
      bpRecords.sort((a, b) => new Date(b.time) - new Date(a.time));
      const latest = bpRecords[0];
      document.getElementById('latestBp').textContent = `${latest.systolic}/${latest.diastolic}`;
      const status = assessBP(latest.systolic, latest.diastolic);
      const el = document.getElementById('bpStatus');
      el.textContent = status;
      el.className = `key-stat-card__status key-stat-card__status--${statusClass(status)}`;
    }

    // 血糖
    if (bsRecords && bsRecords.length > 0) {
      bsRecords.sort((a, b) => new Date(b.time) - new Date(a.time));
      const latest = bsRecords[0];
      document.getElementById('latestBs').textContent = latest.value;
      const status = assessBS(latest.value, latest.type);
      const el = document.getElementById('bsStatus');
      el.textContent = status;
      el.className = `key-stat-card__status key-stat-card__status--${statusClass(status)}`;
    }

    // 体重
    if (weightRecords && weightRecords.length > 0) {
      weightRecords.sort((a, b) => new Date(b.time) - new Date(a.time));
      const latest = weightRecords[0];
      document.getElementById('latestWeight').textContent = latest.value;
      const el = document.getElementById('weightStatus');
      el.textContent = '正常';
      el.className = 'key-stat-card__status key-stat-card__status--normal';
    }
  } catch (e) {
    console.error('加载关键指标失败:', e);
  }
}

// 加载详细数据（图表+列表）
async function loadDetailData(type) {
  const recordsList = document.getElementById('recordsList');
  const chartSection = document.getElementById('chartSection');

  // 设置加载状态
  recordsList.innerHTML = '<div class="loading" style="display:flex;"><div class="loading-spinner"></div><div class="loading-text">正在加载...</div></div>';

  if (type === 'medication') {
    chartSection.style.display = 'none';
    await loadMedicationList(recordsList);
    return;
  }

  if (type === 'exercise' || type === 'diet') {
    chartSection.style.display = 'none';
    try {
      let records = [];
      if (type === 'exercise') records = await memoryService.queryExercises(rangeDays);
      else records = await memoryService.queryDiet(rangeDays);
      if (!Array.isArray(records)) records = [];
      renderRecordsList(type, records);
    } catch (e) {
      recordsList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">加载失败，请稍后重试</div>';
      console.error('加载记录失败:', e);
    }
    return;
  }

  chartSection.style.display = '';

  try {
    let records = [];
    if (type === 'bp') records = await memoryService.queryBloodPressure(rangeDays);
    else if (type === 'bs') records = await memoryService.queryBloodSugar(rangeDays);
    else if (type === 'weight') records = await memoryService.queryWeight(rangeDays);

    // 确保 records 是数组
    if (!Array.isArray(records)) {
      records = [];
      console.warn('数据格式错误，期望数组:', records);
    }

    renderChart(type, records);
    renderRecordsList(type, records);
  } catch (e) {
    recordsList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">加载失败，请稍后重试</div>';
    console.error('加载记录失败:', e);
  }
}

// 加载用药记录
async function loadMedicationList(container) {
  try {
    const meds = await memoryService.queryMedications(30);
    const medArr = Array.isArray(meds) ? meds : (meds && meds.medications) ? meds.medications : [];
    if (medArr.length === 0) {
      container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">暂无用药记录</div>';
      return;
    }
    medArr.sort((a, b) => new Date(b.time || b.createdAt) - new Date(a.time || a.createdAt));
    let html = '<div class="med-records">';
    medArr.forEach(m => {
      const date = new Date(m.time || m.createdAt);
      const timeStr = formatDate(date);
      const doseStr = formatDose(m.dose || m.dosage);
      html += `
        <div class="med-record-item">
          <div class="med-record-icon">💊</div>
          <div class="med-record-info">
            <div class="med-record-name">${m.drugName || m.medicine || '未知药品'}</div>
            <div class="med-record-dose">${doseStr}</div>
          </div>
          <div class="med-record-time">${timeStr}</div>
        </div>
      `;
    });
    html += '</div>';
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">加载用药记录失败</div>';
    console.error('加载用药记录失败:', e);
  }
}

// 渲染图表
function renderChart(type, records) {
  const ctx = document.getElementById('healthChart').getContext('2d');
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  if (!records || records.length < 2) return;

  const sorted = [...records].sort((a, b) => new Date(a.time) - new Date(b.time));
  const labels = sorted.map(r => {
    const d = new Date(r.time);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const fontSize = 38;
  const pointRadius = 10;
  const datalabelPlugin = {
    id: 'datalabels',
    afterDatasetsDraw(chart) {
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = `bold 28px sans-serif`;
      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        meta.data.forEach((point, j) => {
          const value = dataset.data[j];
          if (value != null) {
            ctx.fillText(value, point.x, point.y - pointRadius - 10);
          }
        });
      });
      ctx.restore();
    }
  };
  const commonOpts = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 40, right: 20, bottom: 10, left: 10 } },
    plugins: {
      legend: { position: 'top', labels: { color: '#333', font: { size: fontSize, weight: 'bold' }, padding: 20 } },
      tooltip: { titleFont: { size: fontSize }, bodyFont: { size: fontSize } }
    },
    scales: {
      x: { grid: { color: '#F5F5F5' }, ticks: { color: '#555', font: { size: 34 } } },
      y: { grid: { color: '#F5F5F5' }, ticks: { color: '#555', font: { size: 34 } } }
    }
  };

  if (type === 'bp') {
    chartInstance = new Chart(ctx, {
      type: 'line',
      plugins: [datalabelPlugin],
      data: {
        labels,
        datasets: [
          { label: '收缩压', data: sorted.map(r => r.systolic), borderColor: '#E8A87C', tension: 0.4, pointRadius, pointBackgroundColor: '#E8A87C' },
          { label: '舒张压', data: sorted.map(r => r.diastolic), borderColor: '#7CBA7C', tension: 0.4, pointRadius, pointBackgroundColor: '#7CBA7C' }
        ]
      },
      options: { ...commonOpts, scales: { ...commonOpts.scales, y: { ...commonOpts.scales.y, title: { display: true, text: '血压 (mmHg)', color: '#555', font: { size: 34 } } } } }
    });
  } else if (type === 'bs') {
    chartInstance = new Chart(ctx, {
      type: 'line',
      plugins: [datalabelPlugin],
      data: { labels, datasets: [{ label: '血糖', data: sorted.map(r => r.value), borderColor: '#A08060', backgroundColor: 'rgba(160,128,96,0.1)', tension: 0.4, fill: true, pointRadius }] },
      options: { ...commonOpts, scales: { ...commonOpts.scales, y: { ...commonOpts.scales.y, title: { display: true, text: '血糖 (mmol/L)', color: '#555', font: { size: 34 } } } } }
    });
  } else if (type === 'weight') {
    chartInstance = new Chart(ctx, {
      type: 'line',
      plugins: [datalabelPlugin],
      data: { labels, datasets: [{ label: '体重', data: sorted.map(r => r.value), borderColor: '#8B5A2B', backgroundColor: 'rgba(139,90,43,0.1)', tension: 0.4, fill: true, pointRadius }] },
      options: { ...commonOpts, scales: { ...commonOpts.scales, y: { ...commonOpts.scales.y, title: { display: true, text: '体重 (kg)', color: '#555', font: { size: 34 } } } } }
    });
  }
}

// 渲染记录列表
function renderRecordsList(type, records) {
  const el = document.getElementById('recordsList');
  if (!records || records.length === 0) {
    el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">暂无记录</div>';
    return;
  }
  records.sort((a, b) => new Date(b.time) - new Date(a.time));
  let html = '<div class="record-records">';
  records.forEach(r => {
    const timeStr = formatDate(new Date(r.time));
    if (type === 'bp') {
      const status = assessBP(r.systolic, r.diastolic);
      html += `<div class="record-item"><div class="record-item__time">${timeStr}</div><div class="record-item__value">${r.systolic}/${r.diastolic} <span class="record-item__unit">mmHg</span></div><div class="record-item__status record-item__status--${statusClass(status)}">${status}</div></div>`;
    } else if (type === 'bs') {
      const status = assessBS(r.value, r.type);
      const typeLabel = r.type === 'fasting' ? '(空腹)' : r.type === 'postprandial' ? '(餐后)' : '';
      html += `<div class="record-item"><div class="record-item__time">${timeStr} ${typeLabel}</div><div class="record-item__value">${r.value} <span class="record-item__unit">mmol/L</span></div><div class="record-item__status record-item__status--${statusClass(status)}">${status}</div></div>`;
    } else if (type === 'weight') {
      html += `<div class="record-item"><div class="record-item__time">${timeStr}</div><div class="record-item__value">${r.value} <span class="record-item__unit">kg</span></div><div class="record-item__status record-item__status--normal">正常</div></div>`;
    } else if (type === 'exercise') {
      const dur = r.duration ? `${r.duration}${r.durationUnit || '分钟'}` : '';
      const feeling = r.feeling ? ` · ${r.feeling}` : '';
      html += `<div class="record-item"><div class="record-item__time">${timeStr}</div><div class="record-item__value">${r.action || '运动'}${dur ? ` ${dur}` : ''}</div><div class="record-item__status record-item__status--normal">${feeling || '已记录'}</div></div>`;
    } else if (type === 'diet') {
      const foods = Array.isArray(r.foods) && r.foods.length > 0 ? r.foods.join('、') : '（未记录具体食物）';
      const meal = r.meal ? `${r.meal} · ` : '';
      const amount = r.amount ? `（${r.amount}）` : '';
      html += `<div class="record-item"><div class="record-item__time">${timeStr}</div><div class="record-item__value">${meal}${foods}${amount}</div><div class="record-item__status record-item__status--normal">饮食</div></div>`;
    }
  });
  html += '</div>';
  el.innerHTML = html;
}

// 导航
window.navigateTo = function(page) {
  const map = { home: 'index.html', records: 'records.html', messages: 'reminders.html', profile: 'profile.html' };
  if (map[page]) window.location.href = map[page];
};

window.showEmergencyModal = function() {
  document.getElementById('emergencyModal').classList.add('emergency-modal--show');
  document.body.style.overflow = 'hidden';
};
window.hideEmergencyModal = function() {
  document.getElementById('emergencyModal').classList.remove('emergency-modal--show');
  document.body.style.overflow = '';
};
window.callEmergencyContact = function() {
  // 优先从家庭成员中获取紧急联系人
  const familyContacts = JSON.parse(localStorage.getItem('familyContacts') || '[]');
  
  // 如果有绑定的子女，优先使用第一个子女的电话
  if (familyContacts.length > 0 && familyContacts[0].phone) {
    const phone = familyContacts[0].phone.replace(/\s/g, '');
    makePhoneCall(phone, familyContacts[0].name);
  } else {
    // 否则使用手动设置的紧急联系人
    const emergencyContact = localStorage.getItem('emergencyContact') || '13800138000';
    const emergencyContactName = localStorage.getItem('emergencyContactName') || '紧急联系人';
    makePhoneCall(emergencyContact, emergencyContactName);
  }
  hideEmergencyModal();
};

// 实际拨打电话
function makePhoneCall(phone, name) {
  const cleanPhone = phone.replace(/[^\d+]/g, '');
  
  if (!cleanPhone) {
    alert('紧急联系人电话号码未设置！\n\n请先在个人中心设置紧急联系人。');
    return;
  }
  
  const telUrl = `tel:${cleanPhone}`;
  const link = document.createElement('a');
  link.href = telUrl;
  link.style.display = 'none';
  document.body.appendChild(link);
  
  if (confirm(`确定要拨打紧急联系人 ${name || '联系人'} 的电话吗？\n\n电话号码：${phone}`)) {
    link.click();
  }
  
  document.body.removeChild(link);
}
;

// 页面加载
document.addEventListener('DOMContentLoaded', async () => {
  // 进入健康档案页时刷新记录缓存，确保刚录入的数据能显示
  memoryService.cache.invalidateByType('records');
  loadKeyStats();
  loadDetailData(currentTab);

  document.querySelectorAll('.records-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.records-tab').forEach(t => t.classList.remove('records-tab--active'));
      tab.classList.add('records-tab--active');
      currentTab = tab.getAttribute('data-tab');
      loadDetailData(currentTab);
    });
  });

  document.querySelectorAll('.chart-range-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-range-tab').forEach(b => b.classList.remove('chart-range-tab--active'));
      btn.classList.add('chart-range-tab--active');
      rangeDays = parseInt(btn.getAttribute('data-days'), 10);
      loadDetailData(currentTab);
    });
  });
});
