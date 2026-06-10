import { applyFontSize } from './utils.js';

const API_BASE = 'http://localhost:5001/api';
const CURRENT_CHILD_ID = "default_child";

let chartInstance = null;
let rangeDays = 7;
let currentTab = 'bp';
let selectedParentId = null;
let boundParents = [];

applyFontSize();

function formatDate(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTime(timestamp) {
  if (!timestamp) return '未知时间';
  const d = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
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

function getStatusClass(status) {
  switch (status) {
    case '危险': return 'status-danger';
    case '偏高': return 'status-high';
    case '偏低': return 'status-low';
    default: return 'status-normal';
  }
}

async function loadKeyStats() {
  if (!selectedParentId) {
    showNoParentSelected();
    return;
  }

  try {
    const [bpRes, bsRes, weightRes] = await Promise.all([
      fetch(`${API_BASE}/family/parent/${selectedParentId}/records/bp?days=30&child_id=${CURRENT_CHILD_ID}`),
      fetch(`${API_BASE}/family/parent/${selectedParentId}/records/bs?days=30&child_id=${CURRENT_CHILD_ID}`),
      fetch(`${API_BASE}/family/parent/${selectedParentId}/records/weight?days=30&child_id=${CURRENT_CHILD_ID}`)
    ]);

    const bpData = bpRes.ok ? await bpRes.json() : { ok: false };
    const bsData = bsRes.ok ? await bsRes.json() : { ok: false };
    const weightData = weightRes.ok ? await weightRes.json() : { ok: false };

    const bpRecords = bpData.ok && bpData.data ? bpData.data : [];
    const bsRecords = bsData.ok && bsData.data ? bsData.data : [];
    const weightRecords = weightData.ok && weightData.data ? weightData.data : [];

    if (bpRecords && bpRecords.length > 0) {
      bpRecords.sort((a, b) => new Date(b.time) - new Date(a.time));
      const latest = bpRecords[0];
      document.getElementById('latestBp').textContent = `${latest.systolic}/${latest.diastolic}`;
      const status = assessBP(latest.systolic, latest.diastolic);
      const el = document.getElementById('bpStatus');
      el.textContent = status;
      el.className = `key-stat-card__status key-stat-card__status--${statusClass(status)}`;
    }

    if (bsRecords && bsRecords.length > 0) {
      bsRecords.sort((a, b) => new Date(b.time) - new Date(a.time));
      const latest = bsRecords[0];
      document.getElementById('latestBs').textContent = latest.value;
      const status = assessBS(latest.value, latest.type);
      const el = document.getElementById('bsStatus');
      el.textContent = status;
      el.className = `key-stat-card__status key-stat-card__status--${statusClass(status)}`;
    }

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

async function loadDetailData(type) {
  if (!selectedParentId) {
    showNoParentSelected();
    return;
  }

  const recordsList = document.getElementById('recordsList');
  const chartSection = document.getElementById('chartSection');

  if (type === 'medication') {
    chartSection.style.display = 'none';
    await loadMedicationList(recordsList);
    return;
  }

  chartSection.style.display = '';
  recordsList.innerHTML = '<div class="loading" style="display:flex;"><div class="loading-spinner"></div><div class="loading-text">正在加载...</div></div>';

  try {
    const recordTypeMap = { bp: 'bp', bs: 'bs', weight: 'weight' };
    const apiType = recordTypeMap[type];
    
    const res = await fetch(`${API_BASE}/family/parent/${selectedParentId}/records/${apiType}?days=${rangeDays}&child_id=${CURRENT_CHILD_ID}`);
    const data = res.ok ? await res.json() : { ok: false };
    
    const records = data.ok && data.data ? data.data : [];
    renderChart(type, records);
    renderRecordsList(type, records);
  } catch (e) {
    recordsList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">加载失败，请稍后重试</div>';
    console.error('加载记录失败:', e);
  }
}

async function loadMedicationList(container) {
  if (!selectedParentId) return;
  
  try {
    const res = await fetch(`${API_BASE}/family/parent/${selectedParentId}/records/med?days=30&child_id=${CURRENT_CHILD_ID}`);
    const data = res.ok ? await res.json() : { ok: false };
    const meds = data.ok && data.data ? data.data : [];
    
    const medArr = Array.isArray(meds) ? meds : [];
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
      const c = chart.ctx;
      c.save();
      c.font = 'bold 24px sans-serif';
      c.fillStyle = '#333';
      c.textAlign = 'center';
      c.textBaseline = 'bottom';
      chart.data.datasets.forEach((dataset, i) => {
        const meta = chart.getDatasetMeta(i);
        meta.data.forEach((point, j) => {
          const value = dataset.data[j];
          if (value != null) {
            if (j === 0 || j === meta.data.length - 1 || j % Math.ceil(meta.data.length / 5) === 0) {
              c.fillText(value, point.x, point.y - pointRadius - 15);
            }
          }
        });
      });
      c.restore();
    }
  };
  const commonOpts = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 40, right: 100, bottom: 10, left: 80 } },
    plugins: {
      legend: { position: 'right', labels: { color: '#333', font: { size: fontSize, weight: 'bold' }, padding: 15, usePointStyle: true, pointStyle: 'circle' } },
      tooltip: { titleFont: { size: fontSize }, bodyFont: { size: fontSize } }
    },
    scales: {
      x: { grid: { color: '#F5F5F5' }, ticks: { color: '#555', font: { size: 34 } } },
      y: { grid: { color: '#F5F5F5' }, ticks: { color: '#555', font: { size: 34 }, padding: 20 } }
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
      options: { ...commonOpts, scales: { ...commonOpts.scales, y: { ...commonOpts.scales.y, title: { display: true, text: '血压 (mmHg)', color: '#555', font: { size: 34 }, padding: 100 } } } }
    });
  } else if (type === 'bs') {
    chartInstance = new Chart(ctx, {
      type: 'line',
      plugins: [datalabelPlugin],
      data: { labels, datasets: [{ label: '血糖', data: sorted.map(r => r.value), borderColor: '#A08060', backgroundColor: 'rgba(160,128,96,0.1)', tension: 0.4, fill: true, pointRadius }] },
      options: { ...commonOpts, scales: { ...commonOpts.scales, y: { ...commonOpts.scales.y, title: { display: true, text: '血糖 (mmol/L)', color: '#555', font: { size: 34 }, padding: 100 } } } }
    });
  } else if (type === 'weight') {
    chartInstance = new Chart(ctx, {
      type: 'line',
      plugins: [datalabelPlugin],
      data: { labels, datasets: [{ label: '体重', data: sorted.map(r => r.value), borderColor: '#8B5A2B', backgroundColor: 'rgba(139,90,43,0.1)', tension: 0.4, fill: true, pointRadius }] },
      options: { ...commonOpts, scales: { ...commonOpts.scales, y: { ...commonOpts.scales.y, title: { display: true, text: '体重 (kg)', color: '#555', font: { size: 34 }, padding: 100 } } } }
    });
  }
}

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
    }
  });
  html += '</div>';
  el.innerHTML = html;
}

async function loadParentProfile(parent) {
  const profile = parent.profile || {};
  const name = parent.child_label || profile.name || '父母';
  const age = profile.age ? `${profile.age}岁` : '';
  const conditions = profile.conditions || profile.chronicDiseases || [];
  const condStr = conditions.length > 0 ? conditions.join('、') : '';
  document.getElementById('parentSubtitle').textContent = `查看${name}的健康数据${age ? ' - ' + age : ''}${condStr ? ' | ' + condStr : ''}`;
}

function updateUrgentBanner() {
  const banner = document.getElementById('urgentBanner');
  banner.innerHTML = '';
}

async function generateAdvice() {
  if (!selectedParentId) return;
  
  const adviceList = document.getElementById('adviceList');
  const advices = [];
  
  try {
    const [bpRes, bsRes, medRes] = await Promise.all([
      fetch(`${API_BASE}/family/parent/${selectedParentId}/records/bp?days=7&child_id=${CURRENT_CHILD_ID}`),
      fetch(`${API_BASE}/family/parent/${selectedParentId}/records/bs?days=7&child_id=${CURRENT_CHILD_ID}`),
      fetch(`${API_BASE}/family/parent/${selectedParentId}/records/med?days=30&child_id=${CURRENT_CHILD_ID}`)
    ]);
    
    const bpData = bpRes.ok ? await bpRes.json() : { ok: false };
    const bsData = bsRes.ok ? await bsRes.json() : { ok: false };
    const medData = medRes.ok ? await medRes.json() : { ok: false };
    
    const bpRecords = bpData.ok && bpData.data ? bpData.data : [];
    const bsRecords = bsData.ok && bsData.data ? bsData.data : [];
    const medRecords = medData.ok && medData.data ? medData.data : [];
    
    const systolics = bpRecords.map(r => r.systolic).filter(v => v);
    const diastolics = bpRecords.map(r => r.diastolic).filter(v => v);
    const avgSys = systolics.length ? Math.round(systolics.reduce((a, b) => a + b, 0) / systolics.length) : 0;
    const avgDia = diastolics.length ? Math.round(diastolics.reduce((a, b) => a + b, 0) / diastolics.length) : 0;

    if (avgSys > 0) {
      const bpStatus = assessBP(avgSys, avgDia);
      if (bpStatus === '危险' || bpStatus === '偏高') {
        advices.push({ icon: '⚠️', title: '血压偏高提醒', text: `父母最近血压平均值为${avgSys}/${avgDia} mmHg，处于${bpStatus}状态，建议关注饮食清淡，减少盐分摄入，必要时就医。`, level: 'warn' });
      } else if (bpStatus === '正常偏高') {
        advices.push({ icon: '💡', title: '血压正常偏高', text: `父母最近血压平均值为${avgSys}/${avgDia} mmHg，略偏高，建议适当控制饮食。`, level: 'info' });
      } else if (bpStatus === '偏低') {
        advices.push({ icon: '⚠️', title: '血压偏低提醒', text: `父母最近血压平均值为${avgSys}/${avgDia} mmHg，偏低，注意起身慢缓，避免头晕跌倒。`, level: 'warn' });
      } else {
        advices.push({ icon: '✅', title: '血压正常', text: `父母最近血压平均值为${avgSys}/${avgDia} mmHg，保持良好状态。`, level: 'good' });
      }
    }

    const bsValues = bsRecords.map(r => r.value).filter(v => v);
    const avgBs = bsValues.length ? (bsValues.reduce((a, b) => parseFloat(a) + parseFloat(b), 0) / bsValues.length).toFixed(1) : 0;
    if (avgBs > 0) {
      const bsStatus = assessBS(avgBs);
      if (bsStatus === '偏高') {
        advices.push({ icon: '⚠️', title: '血糖偏高提醒', text: `父母最近血糖平均值为${avgBs} mmol/L，偏高，建议控制碳水化合物摄入，定期监测。`, level: 'warn' });
      } else if (bsStatus === '正常偏高') {
        advices.push({ icon: '💡', title: '血糖略偏高', text: `父母最近血糖平均值为${avgBs} mmol/L，略偏高，建议适当控制甜食和主食。`, level: 'info' });
      } else if (bsStatus === '偏低') {
        advices.push({ icon: '⚠️', title: '血糖偏低提醒', text: `父母最近血糖平均值为${avgBs} mmol/L，偏低，注意规律进餐。`, level: 'warn' });
      } else {
        advices.push({ icon: '✅', title: '血糖正常', text: `父母最近血糖平均值为${avgBs} mmol/L，控制良好。`, level: 'good' });
      }
    }

    if (medRecords.length >= 14) {
      advices.push({ icon: '✅', title: '用药规律', text: `父母本月用药${medRecords.length}次，记录完整。`, level: 'good' });
    } else if (medRecords.length > 0) {
      advices.push({ icon: '💡', title: '用药偏少', text: `父母本月仅记录${medRecords.length}次用药，建议督促按时服药。`, level: 'info' });
    }

    advices.push({ icon: '💪', title: '运动建议', text: '建议每周进行3-4次散步或太极等温和运动，每次30分钟左右。', level: 'info' });

    if (avgSys === 0 && avgBs == 0 && medRecords.length === 0) {
      advices.length = 0;
      advices.push({ icon: '📋', title: '暂无数据', text: '暂无健康数据记录，请鼓励父母多与助手交流健康情况。', level: 'info' });
    }

    let html = '';
    advices.forEach(a => {
      html += `<div class="advice-item-child advice-item-child--${a.level}"><div class="advice-item-child__icon">${a.icon}</div><div class="advice-item-child__content"><div class="advice-item-child__title">${a.title}</div><div class="advice-item-child__text">${a.text}</div></div></div>`;
    });
    adviceList.innerHTML = html;
  } catch (e) {
    console.error('生成建议失败:', e);
    adviceList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">生成建议失败</div>';
  }
}

async function loadAlerts() {
  const alertsList = document.getElementById('alertsList');
  const viewAllBtn = document.getElementById('viewAllAlerts');
  
  if (!selectedParentId) {
    alertsList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">请先选择父母</div>';
    viewAllBtn.style.display = 'none';
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/family/parent/${selectedParentId}/alerts?child_id=${CURRENT_CHILD_ID}`);
    const data = res.ok ? await res.json() : { ok: false };
    
    if (data.ok && data.data && data.data.length > 0) {
      const alerts = data.data.sort((a, b) => (b.time || b.timestamp || 0) - (a.time || a.timestamp || 0));
      const showAlerts = alerts.slice(0, 3); // 只显示最近3条
      
      alertsList.innerHTML = showAlerts.map(alert => `
        <div class="alert-item">
          <div class="alert-item__header">
            <span class="alert-item__icon">${getAlertIcon(alert.severity)}</span>
            <span class="alert-item__title">${alert.title || '告警'}</span>
            <span class="alert-item__time">${formatTime(alert.time || alert.timestamp)}</span>
          </div>
          <div class="alert-item__message">${alert.message}</div>
        </div>
      `).join('');
      
      // 如果有更多告警，显示"查看全部"按钮
      if (alerts.length > 3) {
        viewAllBtn.style.display = 'flex';
      } else {
        viewAllBtn.style.display = 'none';
      }
    } else {
      alertsList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">✅ 暂无告警记录</div>';
      viewAllBtn.style.display = 'none';
    }
  } catch (e) {
    console.error('加载告警失败:', e);
    alertsList.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">加载告警失败，请稍后重试</div>';
    viewAllBtn.style.display = 'none';
  }
}

// 暴露到全局作用域，供HTML onclick调用
window.viewAllAlerts = function() {
  window.location.href = `alerts.html?parent_id=${selectedParentId}`;
}

function getAlertIcon(severity) {
  switch (severity) {
    case 'URGENT': return '🚨';
    case 'BLOCK': return '⛔';
    case 'WARN': return '⚠️';
    default: return 'ℹ️';
  }
}

function getAlertTypeLabel(type) {
  const labels = {
    'blood_pressure_high': '血压偏高',
    'blood_pressure_low': '血压偏低',
    'blood_sugar_high': '血糖偏高',
    'blood_sugar_low': '血糖偏低',
    'weight_abnormal': '体重异常',
    'missed_medication': '漏服提醒',
    'emergency': '紧急情况',
    'health_alert': '健康告警',
    'symptom.bleeding': '出血问题',
    'symptom.vomiting_blood': '呕血紧急',
    'symptom.consciousness': '意识问题',
    'symptom.heart': '心脏问题'
  };
  return labels[type] || type || '健康告警';
}

async function loadBoundParents() {
  try {
    const res = await fetch(`${API_BASE}/family/bonds/child/${CURRENT_CHILD_ID}`);
    const data = res.ok ? await res.json() : { ok: false };
    
    if (data.ok && data.data) {
      boundParents = data.data.filter(b => b.status === 'accepted');
      
      const parentSelectorSection = document.getElementById('parentSelectorSection');
      const parentList = document.getElementById('parentList');
      
      if (boundParents.length > 0) {
        parentSelectorSection.style.display = '';
        
        const relationLabels = {
          son: '儿子',
          daughter: '女儿',
          spouse: '配偶',
          child: '子女',
          grandson: '孙子/外孙',
          granddaughter: '孙女/外孙女'
        };
        
        parentList.innerHTML = boundParents.map(parent => {
          const isSelected = parent.parent_id === selectedParentId;
          return `
            <div class="parent-card ${isSelected ? 'parent-card--active' : ''}" onclick="selectParent('${parent.parent_id}', ${JSON.stringify(parent).replace(/"/g, '&quot;')})">
              <div class="parent-card__icon">👴</div>
              <div class="parent-card__info">
                <div class="parent-card__name">${parent.child_label || relationLabels[parent.relationship] || '父母'}</div>
                <div class="parent-card__status">已绑定</div>
              </div>
              ${isSelected ? '<span class="material-icons" style="color:var(--primary-color);">check_circle</span>' : ''}
            </div>
          `;
        }).join('');
        
        if (!selectedParentId && boundParents.length > 0) {
          selectParent(boundParents[0].parent_id, boundParents[0]);
        }
      } else {
        parentSelectorSection.style.display = 'none';
      }
    }
  } catch (e) {
    console.error('加载绑定列表失败:', e);
  }
}

function selectParent(parentId, parent) {
  selectedParentId = parentId;
  loadBoundParents();
  loadParentProfile(parent);
  loadKeyStats();
  loadDetailData(currentTab);
  generateAdvice();
  loadAlerts();
}

function showNoParentSelected() {
  document.getElementById('latestBp').textContent = '--/--';
  document.getElementById('bpStatus').textContent = '请先选择父母';
  document.getElementById('latestBs').textContent = '--';
  document.getElementById('bsStatus').textContent = '请先选择父母';
  document.getElementById('latestWeight').textContent = '--';
  document.getElementById('weightStatus').textContent = '请先选择父母';
  document.getElementById('recordsList').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">请先选择父母</div>';
  document.getElementById('alertsList').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">请先选择父母</div>';
  document.getElementById('adviceList').innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:var(--font-lg);">请先选择父母</div>';
}

window.showBindModal = function() {
  const modal = document.getElementById('bindModal');
  modal.style.display = 'block';
  setTimeout(() => modal.classList.add('emergency-modal--show'), 10);
  document.body.style.overflow = 'hidden';
}

window.hideBindModal = function() {
  const modal = document.getElementById('bindModal');
  modal.classList.remove('emergency-modal--show');
  setTimeout(() => modal.style.display = 'none', 300);
  document.body.style.overflow = '';
}

window.submitBind = async function() {
  const inviteCodeInput = document.getElementById('inviteCodeInput');
  const inviteCode = inviteCodeInput.value.trim().toUpperCase();
  
  if (!inviteCode) {
    alert('请输入邀请码');
    return;
  }
  
  try {
    const res = await fetch(`${API_BASE}/family/bond/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: inviteCode, child_id: CURRENT_CHILD_ID })
    });
    
    const data = await res.json();
    
    if (data.ok) {
      alert('绑定成功！');
      hideBindModal();
      inviteCodeInput.value = '';
      await loadBoundParents();
    } else {
      alert('绑定失败：' + (data.error || '无效的邀请码'));
    }
  } catch (e) {
    console.error('绑定失败:', e);
    alert('绑定失败，请检查网络连接');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadBoundParents();
  
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
