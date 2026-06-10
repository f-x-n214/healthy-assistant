// 设置页面逻辑

// 返回按钮
document.getElementById('backBtn').addEventListener('click', () => {
  window.location.href = 'profile.html';
});

// 字体大小配置 - 适合银发老人（增大60%）
const fontSizeConfigs = {
  small: {
    xs: '20px',
    sm: '22px',
    base: '24px',
    md: '26px',
    lg: '28px',
    xl: '32px',
    '2xl': '38px',
    '3xl': '44px',
    '4xl': '52px'
  },
  medium: {
    xs: '22px',
    sm: '24px',
    base: '26px',
    md: '28px',
    lg: '30px',
    xl: '34px',
    '2xl': '42px',
    '3xl': '48px',
    '4xl': '58px'
  },
  large: {
    xs: '24px',
    sm: '26px',
    base: '28px',
    md: '30px',
    lg: '32px',
    xl: '36px',
    '2xl': '44px',
    '3xl': '52px',
    '4xl': '64px'
  },
  xlarge: {
    xs: '26px',
    sm: '28px',
    base: '30px',
    md: '32px',
    lg: '34px',
    xl: '40px',
    '2xl': '48px',
    '3xl': '58px',
    '4xl': '70px'
  }
};

// 字体大小设置
const fontBtns = document.querySelectorAll('.font-size-btn');
fontBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    fontBtns.forEach(b => b.classList.remove('font-size-btn--active'));
    btn.classList.add('font-size-btn--active');
    
    const size = btn.getAttribute('data-size');
    const config = fontSizeConfigs[size];
    
    // 更新 CSS 变量
    const root = document.documentElement;
    root.style.setProperty('--font-xs', config.xs);
    root.style.setProperty('--font-sm', config.sm);
    root.style.setProperty('--font-base', config.base);
    root.style.setProperty('--font-md', config.md);
    root.style.setProperty('--font-lg', config.lg);
    root.style.setProperty('--font-xl', config.xl);
    root.style.setProperty('--font-2xl', config['2xl']);
    root.style.setProperty('--font-3xl', config['3xl']);
    root.style.setProperty('--font-4xl', config['4xl']);
    
    // 保存到本地存储
    localStorage.setItem('fontSize', size);
    
    // 提示用户
    const sizeLabels = { small: '小', medium: '中', large: '大', xlarge: '特大' };
    alert(`字体大小已调整为"${sizeLabels[size]}"，页面会立即生效`);
  });
});

// 加载保存的字体大小设置
const savedFontSize = localStorage.getItem('fontSize') || 'medium';
const savedConfig = fontSizeConfigs[savedFontSize];
const root = document.documentElement;
root.style.setProperty('--font-xs', savedConfig.xs);
root.style.setProperty('--font-sm', savedConfig.sm);
root.style.setProperty('--font-base', savedConfig.base);
root.style.setProperty('--font-md', savedConfig.md);
root.style.setProperty('--font-lg', savedConfig.lg);
root.style.setProperty('--font-xl', savedConfig.xl);
root.style.setProperty('--font-2xl', savedConfig['2xl']);
root.style.setProperty('--font-3xl', savedConfig['3xl']);
root.style.setProperty('--font-4xl', savedConfig['4xl']);

// 设置激活的按钮
const activeBtn = document.querySelector(`.font-size-btn[data-size="${savedFontSize}"]`);
if (activeBtn) {
  fontBtns.forEach(b => b.classList.remove('font-size-btn--active'));
  activeBtn.classList.add('font-size-btn--active');
}

// 语速设置
const rateBtns = document.querySelectorAll('.speech-rate-btn');
rateBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    rateBtns.forEach(b => b.classList.remove('speech-rate-btn--active'));
    btn.classList.add('speech-rate-btn--active');
    
    const rate = parseFloat(btn.getAttribute('data-rate'));
    
    // 保存到本地存储
    localStorage.setItem('speechRate', rate);
    
    // 提示用户
    const rateLabels = { '0.6': '慢', '0.9': '中', '1.2': '快', '1.5': '特快' };
    alert(`语速已调整为"${rateLabels[rate]}"`);
  });
});

// 加载保存的语速设置
const savedSpeechRate = parseFloat(localStorage.getItem('speechRate')) || 0.9;
const activeRateBtn = document.querySelector(`.speech-rate-btn[data-rate="${savedSpeechRate}"]`);
if (activeRateBtn) {
  rateBtns.forEach(b => b.classList.remove('speech-rate-btn--active'));
  activeRateBtn.classList.add('speech-rate-btn--active');
}

// 通知提醒开关
const notificationToggle = document.getElementById('notificationToggle');
notificationToggle.addEventListener('click', () => {
  const enabled = notificationToggle.getAttribute('data-enabled') === 'true';
  const newEnabled = !enabled;
  
  notificationToggle.setAttribute('data-enabled', newEnabled);
  notificationToggle.classList.toggle('toggle-switch--on', newEnabled);
  
  // 保存到本地存储
  localStorage.setItem('notificationEnabled', newEnabled);
  
  // 提示用户
  alert(newEnabled ? '通知提醒已开启' : '通知提醒已关闭');
});

// 加载保存的通知设置
const savedNotificationEnabled = localStorage.getItem('notificationEnabled') !== 'false';
notificationToggle.setAttribute('data-enabled', savedNotificationEnabled);
notificationToggle.classList.toggle('toggle-switch--on', savedNotificationEnabled);

// 关于我们点击
document.getElementById('aboutItem').addEventListener('click', () => {
  alert('银发健康助手 v1.0.0\n\n关爱老人健康，让生活更安心\n\n本应用提供健康监测、用药提醒、紧急求助等功能，专为老年人设计的友好界面。');
});