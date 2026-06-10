/**
 * 语音识别服务 - 支持普通话语音输入
 * 使用 Web Speech API 实现
 */

class VoiceService {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.onResultCallback = null;
    this.onErrorCallback = null;
    this.onStartCallback = null;
    this.onEndCallback = null;
    this.onListeningCallback = null;

    this.init();
  }

  /**
   * 初始化语音识别
   */
  init() {
    if (!this.isSupported()) {
      console.warn('[语音服务] 当前浏览器不支持语音识别功能');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();

    // 配置语音识别参数
    this.recognition.lang = 'zh-CN'; // 设置为中文普通话
    this.recognition.continuous = false; // 不连续识别，一次说话一次结果
    this.recognition.interimResults = true; // 返回临时结果
    this.recognition.maxAlternatives = 1; // 只返回最可能的识别结果

    this.setupEventListeners();
  }

  /**
   * 检查浏览器是否支持语音识别
   */
  isSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    if (!this.recognition) return;

    // 开始识别
    this.recognition.onstart = () => {
      this.isListening = true;
      console.log('[语音服务] 开始语音识别');
      if (this.onStartCallback) {
        this.onStartCallback();
      }
    };

    // 识别中（临时结果）
    this.recognition.onresult = (event) => {
      const results = event.results;
      if (results.length > 0) {
        const result = results[results.length - 1];
        const transcript = result[0].transcript;
        const isFinal = result.isFinal;

        console.log(`[语音服务] 识别中: ${transcript} (最终: ${isFinal})`);

        if (this.onListeningCallback) {
          this.onListeningCallback(transcript, isFinal);
        }

        if (isFinal && this.onResultCallback) {
          this.onResultCallback(transcript);
        }
      }
    };

    // 识别错误
    this.recognition.onerror = (event) => {
      console.error('[语音服务] 识别错误:', event.error);
      this.isListening = false;

      let errorMessage = '语音识别出错';
      switch (event.error) {
        case 'no-speech':
          errorMessage = '没有检测到语音，请重试';
          break;
        case 'audio-capture':
          errorMessage = '无法访问麦克风，请检查设备';
          break;
        case 'not-allowed':
          errorMessage = '麦克风权限被拒绝，请在浏览器设置中允许';
          break;
        case 'network':
          errorMessage = '网络错误，请检查网络连接';
          break;
        case 'aborted':
          errorMessage = '识别已取消';
          break;
        default:
          errorMessage = `识别错误: ${event.error}`;
      }

      if (this.onErrorCallback) {
        this.onErrorCallback(errorMessage);
      }
    };

    // 识别结束
    this.recognition.onend = () => {
      this.isListening = false;
      console.log('[语音服务] 语音识别结束');
      if (this.onEndCallback) {
        this.onEndCallback();
      }
    };
  }

  /**
   * 开始语音识别
   */
  start() {
    if (!this.recognition) {
      if (this.onErrorCallback) {
        this.onErrorCallback('您的浏览器不支持语音识别功能');
      }
      return false;
    }

    if (this.isListening) {
      console.log('[语音服务] 已经在识别中');
      return true;
    }

    try {
      this.recognition.start();
      return true;
    } catch (error) {
      console.error('[语音服务] 启动失败:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback('启动语音识别失败，请重试');
      }
      return false;
    }
  }

  /**
   * 停止语音识别
   */
  stop() {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
        return true;
      } catch (error) {
        console.error('[语音服务] 停止失败:', error);
        return false;
      }
    }
    return false;
  }

  /**
   * 切换语音识别状态
   */
  toggle() {
    if (this.isListening) {
      this.stop();
      return false;
    } else {
      return this.start();
    }
  }

  /**
   * 设置识别结果回调
   */
  onResult(callback) {
    this.onResultCallback = callback;
    return this;
  }

  /**
   * 设置错误回调
   */
  onError(callback) {
    this.onErrorCallback = callback;
    return this;
  }

  /**
   * 设置开始识别回调
   */
  onStart(callback) {
    this.onStartCallback = callback;
    return this;
  }

  /**
   * 设置结束识别回调
   */
  onEnd(callback) {
    this.onEndCallback = callback;
    return this;
  }

  /**
   * 设置识别中回调（实时显示临时结果）
   */
  onListening(callback) {
    this.onListeningCallback = callback;
    return this;
  }

  /**
   * 获取当前识别状态
   */
  getState() {
    return {
      isListening: this.isListening,
      isSupported: this.isSupported()
    };
  }
}

// 创建单例实例
const voiceService = new VoiceService();

export { VoiceService, voiceService };
