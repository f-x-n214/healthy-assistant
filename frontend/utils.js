/**
 * 工具函数 - 字体大小设置
 */

// 字体大小配置 - 适合银发老人（增大60%）
export const fontSizeConfigs = {
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

// 应用字体大小设置
export function applyFontSize() {
  const savedFontSize = localStorage.getItem('fontSize') || 'medium';
  const config = fontSizeConfigs[savedFontSize];
  
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
}