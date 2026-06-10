/**
 * 语音播报服务 - TTSService
 * 
 * 功能：
 * - 使用浏览器原生 Web Speech API 进行语音播报
 * - 支持智能自动播报判断（告警、用药提醒、天气预警、情绪关怀）
 * - 支持手动点击播报
 * - 播报状态管理和页面离开时自动停止
 */

// 智能播报关键词配置
const TTS_KEYWORDS = {
  // 告警通知关键词
  alert: ['血压偏高', '血压异常', '血糖异常', '告警', '就医', '危险', '偏高', '偏低', '紧急'],
  
  // 用药提醒关键词
  medication: ['吃药时间', '提醒您', '别忘了', '该吃药', '用药', '服药', '药量', '漏服'],
  
  // 天气预警关键词
  weather: ['高温', '寒冷', '暴雨', '预警', '台风', '雷电', '冰雹', '暴雪', '大风'],
  
  // 情绪关怀关键词
  emotion: ['关心', '陪您', '理解', '别怕', '我在', '陪着', '心疼', '难过', '孤独']
};

// 紧急告警关键词（需要特殊处理）
const EMERGENCY_KEYWORDS = ['立即就医', '拨打120', '危险', '紧急'];

class TTSService {
  constructor() {
    this.synth = window.speechSynthesis;
    this.speaking = false;
    this.paused = false;
    this.autoplayEnabled = localStorage.getItem('tts_autoplay') !== 'false'; // 默认开启
    this.currentUtterance = null;
    this.speakingMessageId = null; // 当前正在播报的消息ID
    
    // 获取控制条元素
    this.controlBar = null;
    this.pauseBtn = null;
    this.resumeBtn = null;
    
    // 初始化
    this._init();
  }

  _init() {
    // 监听页面离开事件
    window.addEventListener('beforeunload', () => this.stop());
    window.addEventListener('pagehide', () => this.stop());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stop();
      }
    });
    
    // 延迟获取DOM元素（等待页面加载）
    setTimeout(() => {
      this.controlBar = document.getElementById('ttsControlBar');
      this.pauseBtn = document.getElementById('ttsPauseBtn');
      this.resumeBtn = document.getElementById('ttsResumeBtn');
    }, 100);
  }

  /**
   * 显示悬浮控制条
   */
  _showControlBar() {
    if (!this.controlBar) {
      this.controlBar = document.getElementById('ttsControlBar');
    }
    if (this.controlBar) {
      this.controlBar.classList.remove('tts-control-bar--hide');
      this.controlBar.style.display = 'block';
    }
  }

  /**
   * 隐藏悬浮控制条
   */
  _hideControlBar() {
    if (!this.controlBar) {
      this.controlBar = document.getElementById('ttsControlBar');
    }
    if (this.controlBar) {
      this.controlBar.classList.add('tts-control-bar--hide');
      setTimeout(() => {
        this.controlBar.style.display = 'none';
        this.controlBar.classList.remove('tts-control-bar--hide');
      }, 300);
    }
  }

  /**
   * 切换暂停/继续按钮显示
   */
  _togglePauseResumeButtons(showResume) {
    if (!this.pauseBtn) this.pauseBtn = document.getElementById('ttsPauseBtn');
    if (!this.resumeBtn) this.resumeBtn = document.getElementById('ttsResumeBtn');
    
    if (this.pauseBtn && this.resumeBtn) {
      this.pauseBtn.style.display = showResume ? 'none' : 'flex';
      this.resumeBtn.style.display = showResume ? 'flex' : 'none';
    }
  }

  /**
   * 判断文本是否应该自动播报
   * @param {string} text - 消息文本
   * @returns {object} - { shouldPlay: boolean, reason: string }
   */
  shouldAutoPlay(text) {
    if (!text || typeof text !== 'string') {
      return { shouldPlay: false, reason: 'empty' };
    }

    // 检查各类关键词
    for (const [type, keywords] of Object.entries(TTS_KEYWORDS)) {
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return { 
            shouldPlay: true, 
            reason: type,
            message: this._getTypeMessage(type)
          };
        }
      }
    }

    return { shouldPlay: false, reason: 'normal' };
  }

  /**
   * 判断文本是否包含紧急告警关键词
   * @param {string} text - 消息文本
   * @returns {boolean}
   */
  isEmergency(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }
    for (const keyword of EMERGENCY_KEYWORDS) {
      if (text.includes(keyword)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 播放紧急提示音
   */
  _playEmergencyBeep() {
    try {
      // 创建一个简短的提示音
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      console.error('[TTS] 播放提示音失败:', e);
    }
  }

  /**
   * 触发子女端提醒（模拟）
   */
  _notifyChildren(text) {
    try {
      // 这里可以调用后端 API 来通知子女端
      console.log('[TTS] 触发子女端提醒:', text);
      
      // 模拟发送通知请求
      fetch('/api/notify-children', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: text,
          type: 'emergency',
          timestamp: new Date().toISOString()
        })
      }).catch(e => {
        // 如果后端不可用，忽略错误
        console.log('[TTS] 子女端提醒接口不可用，已跳过');
      });
    } catch (e) {
      console.error('[TTS] 触发子女端提醒失败:', e);
    }
  }

  _getTypeMessage(type) {
    const messages = {
      alert: '检测到告警通知',
      medication: '检测到用药提醒',
      weather: '检测到天气预警',
      emotion: '检测到情绪关怀'
    };
    return messages[type] || '';
  }

  /**
   * 获取当前自动播报开关状态
   */
  isAutoplayEnabled() {
    return this.autoplayEnabled;
  }

  /**
   * 切换自动播报开关
   */
  toggleAutoplay() {
    this.autoplayEnabled = !this.autoplayEnabled;
    localStorage.setItem('tts_autoplay', this.autoplayEnabled);
    return this.autoplayEnabled;
  }

  /**
   * 设置自动播报开关
   */
  setAutoplay(enabled) {
    this.autoplayEnabled = enabled;
    localStorage.setItem('tts_autoplay', enabled);
  }

  /**
   * 播报文本
   * @param {string} text - 要播报的文本
   * @param {string} messageId - 消息ID（用于标记正在播报的消息）
   */
  speak(text, messageId = null) {
    if (!text) return;
    
    // 停止当前播报
    this.stop();
    
    // 判断是否为紧急告警
    const isEmergency = this.isEmergency(text);
    
    // 如果是紧急告警，先播放提示音并触发子女端提醒
    if (isEmergency) {
      this._playEmergencyBeep();
      this._notifyChildren(text);
    }
    
    // 创建语音合成对象
    const utterance = new SpeechSynthesisUtterance(text);
    
    // 设置语音参数
    utterance.lang = 'zh-CN'; // 中文
    // 从本地存储获取语速设置，默认为0.9（适合老年人的较慢语速）
    utterance.rate = parseFloat(localStorage.getItem('speechRate')) || 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // 记录当前播报信息（用于暂停后继续）
    this._currentText = text;
    this._currentMessageId = messageId;
    // 记录是否需要重复播报
    this._needsRepeat = isEmergency;
    this._repeatMessageId = messageId;
    this._repeatText = text;
    
    // 事件处理
    utterance.onstart = () => {
      this.speaking = true;
      this.paused = false;
      this.speakingMessageId = messageId;
      this._updateSpeakingState(messageId, true);
      // 显示悬浮控制条
      this._showControlBar();
      // 显示暂停按钮，隐藏继续按钮
      this._togglePauseResumeButtons(false);
    };
    
    utterance.onend = () => {
      // 如果是紧急告警且需要重复播报
      if (this._needsRepeat) {
        this._needsRepeat = false;
        // 延迟1秒后重复播报
        setTimeout(() => {
          if (!this.speaking) {
            // 使用相同的消息ID进行重复播报
            this._speakOnce(this._repeatText, this._repeatMessageId);
          }
        }, 1000);
      } else {
        this.speaking = false;
        this.paused = false;
        this.speakingMessageId = null;
        this._updateSpeakingState(messageId, false);
        // 隐藏悬浮控制条
        this._hideControlBar();
      }
    };
    
    utterance.onerror = (event) => {
      console.error('[TTS] 播报失败:', event.error);
      this.speaking = false;
      this.paused = false;
      this.speakingMessageId = null;
      this._updateSpeakingState(messageId, false);
      // 隐藏悬浮控制条
      this._hideControlBar();
    };
    
    this.currentUtterance = utterance;
    
    // 开始播报
    try {
      this.synth.speak(utterance);
    } catch (e) {
      console.error('[TTS] 启动播报失败:', e);
    }
  }

  /**
   * 单次播报（用于重复播报）
   * @param {string} text - 要播报的文本
   * @param {string} messageId - 消息ID
   */
  _speakOnce(text, messageId = null) {
    if (!text) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.lang = 'zh-CN';
    utterance.rate = parseFloat(localStorage.getItem('speechRate')) || 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = () => {
      this.speaking = true;
      this.paused = false;
      this.speakingMessageId = messageId;
      this._updateSpeakingState(messageId, true);
      // 显示悬浮控制条
      this._showControlBar();
      // 显示暂停按钮，隐藏继续按钮
      this._togglePauseResumeButtons(false);
    };
    
    utterance.onend = () => {
      this.speaking = false;
      this.paused = false;
      this.speakingMessageId = null;
      this._updateSpeakingState(messageId, false);
      this._hideControlBar();
    };
    
    utterance.onerror = (event) => {
      console.error('[TTS] 重复播报失败:', event.error);
      this.speaking = false;
      this.paused = false;
      this.speakingMessageId = null;
      this._updateSpeakingState(messageId, false);
      this._hideControlBar();
    };
    
    this.currentUtterance = utterance;
    
    try {
      this.synth.speak(utterance);
    } catch (e) {
      console.error('[TTS] 启动重复播报失败:', e);
    }
  }

  /**
   * 停止当前播报
   */
  stop() {
    if (this.synth && (this.synth.speaking || this.synth.paused)) {
      this.synth.cancel();
    }
    this.speaking = false;
    this.paused = false;
    const prevMessageId = this.speakingMessageId;
    this.speakingMessageId = null;
    this._updateSpeakingState(prevMessageId, false);
    // 隐藏悬浮控制条
    this._hideControlBar();
  }

  /**
   * 暂停播报
   */
  pause() {
    if (this.synth && this.synth.speaking) {
      try {
        this.synth.pause();
        this.paused = true;
        // 显示继续按钮，隐藏暂停按钮
        this._togglePauseResumeButtons(true);
      } catch (e) {
        console.error('[TTS] 暂停失败:', e);
      }
    }
  }

  /**
   * 继续播报
   */
  resume() {
    if (this.paused) {
      try {
        // 尝试使用native resume
        if (this.synth && this.synth.paused) {
          this.synth.resume();
          this.paused = false;
          this._togglePauseResumeButtons(false);
        } else {
          // 如果native resume失败，重新开始播报当前消息
          this._restartCurrentSpeech();
        }
      } catch (e) {
        console.error('[TTS] 继续失败，尝试重新开始:', e);
        this._restartCurrentSpeech();
      }
    }
  }

  /**
   * 重新开始当前播报
   */
  _restartCurrentSpeech() {
    if (this._currentText && !this.speaking) {
      this.speak(this._currentText, this._currentMessageId);
      this.paused = false;
      this._togglePauseResumeButtons(false);
    }
  }

  /**
   * 更新播报状态UI
   */
  _updateSpeakingState(messageId, isSpeaking) {
    if (!messageId) return;
    
    const speakerIcon = document.querySelector(`[data-message-id="${messageId}"] .tts-speaker`);
    if (speakerIcon) {
      if (isSpeaking) {
        speakerIcon.classList.add('tts-speaker--speaking');
        speakerIcon.textContent = '🔊';
      } else {
        speakerIcon.classList.remove('tts-speaker--speaking');
        speakerIcon.textContent = '🔈';
      }
    }
  }

  /**
   * 获取可用的语音列表
   */
  getVoices() {
    return new Promise((resolve) => {
      let voices = this.synth.getVoices();
      if (voices.length > 0) {
        // 过滤中文语音
        const chineseVoices = voices.filter(v => v.lang.includes('zh'));
        resolve(chineseVoices.length > 0 ? chineseVoices : voices);
      } else {
        // 语音列表可能尚未加载，等待一下
        setTimeout(() => {
          voices = this.synth.getVoices();
          const chineseVoices = voices.filter(v => v.lang.includes('zh'));
          resolve(chineseVoices.length > 0 ? chineseVoices : voices);
        }, 100);
      }
    });
  }
}

// 创建全局实例
const ttsService = new TTSService();

// 暴露到全局作用域，供 HTML onclick 使用
window.ttsService = ttsService;

export { TTSService, ttsService, TTS_KEYWORDS };
