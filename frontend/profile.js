// 我的页面逻辑

import { applyFontSize } from './utils.js';

// 应用字体大小设置
applyFontSize();

// 导航函数
window.navigateTo = function(page) {
  switch (page) {
    case 'home':
      window.location.href = 'index.html';
      break;
    case 'records':
      window.location.href = 'records.html';
      break;
    case 'messages':
      window.location.href = 'reminders.html';
      break;
    case 'profile':
      window.location.href = 'profile.html';
      break;
    case 'settings':
      window.location.href = 'settings.html';
      break;
  }
};

// 点击行内直接编辑（替换为input，不用prompt）
window.editField = function(fieldId, label) {
  const el = document.getElementById(fieldId);
  if (el.querySelector('input')) return; // 已在编辑中
  const currentValue = el.textContent;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue;
  input.style.cssText = 'font-size:inherit; color:inherit; background:#fff; border:2px solid #5C6BC0; border-radius:8px; padding:6px 12px; width:100%; min-height:44px; outline:none;';
  input.placeholder = `请输入${label}`;
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();
  const finish = () => {
    const newValue = input.value.trim() || currentValue;
    el.textContent = newValue;
    if (fieldId === 'emergencyContactName') {
      localStorage.setItem('emergencyContactName', newValue);
    } else if (fieldId === 'emergencyContactPhone') {
      localStorage.setItem('emergencyContact', newValue);
    }
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
};

// 加载保存的紧急联系人信息
function loadEmergencyContact() {
  const savedName = localStorage.getItem('emergencyContactName');
  const savedPhone = localStorage.getItem('emergencyContact');
  
  if (savedName) {
    document.getElementById('emergencyContactName').textContent = savedName;
  }
  if (savedPhone) {
    document.getElementById('emergencyContactPhone').textContent = savedPhone;
  }
}

// 使用帮助
document.getElementById('helpItem').addEventListener('click', () => {
  alert('使用帮助\n\n1. 首页：智能问答和快捷功能\n2. 健康档案：查看健康数据和用药记录\n3. 消息提醒：查看设置的提醒\n4. 我的：个人信息和设置\n\n如有疑问，请联系客服。');
});

// 意见反馈
document.getElementById('feedbackItem').addEventListener('click', () => {
  const feedback = prompt('请输入您的意见或建议：');
  if (feedback) {
    alert('感谢您的反馈！我们会认真处理。');
  }
});

// 关于我们
document.getElementById('aboutItem').addEventListener('click', () => {
  alert('银发健康助手 v1.0.0\n\n关爱老人健康，让生活更安心\n\n本应用提供健康监测、用药提醒、紧急求助等功能，专为老年人设计的友好界面。');
});

// 紧急求助弹窗功能
window.showEmergencyModal = function() {
  document.getElementById('emergencyModal').classList.add('emergency-modal--show');
  document.body.style.overflow = 'hidden';
};

window.hideEmergencyModal = function() {
  document.getElementById('emergencyModal').classList.remove('emergency-modal--show');
  document.body.style.overflow = '';
};

// 拨打紧急联系人
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

// 页面加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
  loadEmergencyContact();
});