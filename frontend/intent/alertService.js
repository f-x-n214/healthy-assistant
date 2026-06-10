/**
 * 异常检测告警服务
 * 检测健康数据异常、症状异常、行为异常等，并生成告警通知
 */

export class AlertService {
  constructor() {
    this.alerts = [];
    this.STORAGE_KEY = 'health_alerts';
    this.API_BASE = 'http://localhost:5001/api';
    this.userId = 'default';
  }

  setUserId(userId) {
    this.userId = userId;
  }

  /**
   * 保存告警到本地存储
   */
  saveAlert(alert) {
    const alerts = this.getAllAlerts();
    alerts.push(alert);
    const recentAlerts = alerts.slice(-100);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentAlerts));
    this.alerts = recentAlerts;
    this._syncToBackend(alert);
  }

  async _syncToBackend(alert) {
    try {
      await fetch(`${this.API_BASE}/memory/alerts/${this.userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert)
      });
    } catch (e) {
      console.warn('[AlertService] 后端同步失败:', e);
    }
  }

  async getAllAlertsFromBackend() {
    try {
      const res = await fetch(`${this.API_BASE}/memory/alerts/${this.userId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.data || [];
    } catch (e) {
      console.warn('[AlertService] 从后端获取告警失败:', e);
      return this.getAllAlerts();
    }
  }

  /**
   * 获取所有告警
   */
  getAllAlerts() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  /**
   * 获取指定时间之后的新告警
   */
  getNewAlerts(sinceTime) {
    const allAlerts = this.getAllAlerts();
    return allAlerts.filter(alert => {
      const alertTime = new Date(alert.time).getTime();
      return alertTime > sinceTime;
    });
  }

  /**
   * 清除所有告警
   */
  clearAlerts() {
    localStorage.removeItem(this.STORAGE_KEY);
    this.alerts = [];
  }

  /**
   * 检测血压异常
   */
  detectBloodPressureAlert(systolic, diastolic, time) {
    const alerts = [];
    
    if (systolic >= 180 || diastolic >= 120) {
      alerts.push({
        id: this.generateId(),
        type: 'health.bp_crisis',
        title: '高血压危象',
        message: `检测到高血压危象：${systolic}/${diastolic} mmHg，请立即联系医生或拨打急救电话！`,
        severity: 'URGENT',
        time: time,
        data: { systolic, diastolic }
      });
    } else if (systolic >= 140 || diastolic >= 90) {
      alerts.push({
        id: this.generateId(),
        type: 'health.bp_high',
        title: '血压偏高',
        message: `血压偏高：${systolic}/${diastolic} mmHg，请注意休息，避免情绪激动。`,
        severity: 'WARN',
        time: time,
        data: { systolic, diastolic }
      });
    } else if (systolic < 90 || diastolic < 60) {
      alerts.push({
        id: this.generateId(),
        type: 'health.bp_low',
        title: '血压偏低',
        message: `血压偏低：${systolic}/${diastolic} mmHg，起身时请放慢动作。`,
        severity: 'INFO',
        time: time,
        data: { systolic, diastolic }
      });
    }
    
    return alerts;
  }

  /**
   * 检测血糖异常
   */
  detectBloodSugarAlert(value, type, time) {
    const alerts = [];
    const numValue = parseFloat(value);
    
    if (type === 'fasting') {
      if (numValue >= 11.1) {
        alerts.push({
          id: this.generateId(),
          type: 'health.bs_crisis',
          title: '血糖危急值',
          message: `空腹血糖极高：${numValue} mmol/L，请立即联系医生！`,
          severity: 'URGENT',
          time: time,
          data: { value: numValue, type }
        });
      } else if (numValue >= 7.0) {
        alerts.push({
          id: this.generateId(),
          type: 'health.bs_high',
          title: '血糖偏高',
          message: `空腹血糖偏高：${numValue} mmol/L，请注意饮食控制。`,
          severity: 'WARN',
          time: time,
          data: { value: numValue, type }
        });
      } else if (numValue < 3.9) {
        alerts.push({
          id: this.generateId(),
          type: 'health.bs_low',
          title: '血糖偏低',
          message: `血糖偏低：${numValue} mmol/L，请及时补充糖分。`,
          severity: 'WARN',
          time: time,
          data: { value: numValue, type }
        });
      }
    } else {
      if (numValue >= 16.7) {
        alerts.push({
          id: this.generateId(),
          type: 'health.bs_crisis',
          title: '血糖危急值',
          message: `血糖极高：${numValue} mmol/L，请立即联系医生！`,
          severity: 'URGENT',
          time: time,
          data: { value: numValue, type }
        });
      } else if (numValue >= 11.1) {
        alerts.push({
          id: this.generateId(),
          type: 'health.bs_high',
          title: '血糖偏高',
          message: `血糖偏高：${numValue} mmol/L。`,
          severity: 'WARN',
          time: time,
          data: { value: numValue, type }
        });
      }
    }
    
    return alerts;
  }

  /**
   * 检测体温（65岁以上老人发热分级）
   * 低热：37.3～38.0℃
   * 中度发热：38.1～39.0℃
   * 高烧（高热）：≥39.0℃
   * 超高热：≥41.0℃
   */
  detectFever(text) {
    // 匹配数字温度（支持多种格式：37度、37.5度、37°C、37.5°C、体温38度等）
    const tempPatterns = [
      /(\d{1,2}(?:\.\d)?)\s*[度℃cC]/,
      /体温\s*(\d{1,2}(?:\.\d)?)/,
      /发烧\s*(\d{1,2}(?:\.\d)?)/,
      /发热\s*(\d{1,2}(?:\.\d)?)/,
      /体温是\s*(\d{1,2}(?:\.\d)?)/,
      /体温为\s*(\d{1,2}(?:\.\d)?)/,
      /(\d{1,2}(?:\.\d)?)\s*摄氏度/,
      /烧到\s*(\d{1,2}(?:\.\d)?)/
    ];
    
    let temperature = null;
    for (const pattern of tempPatterns) {
      const match = text.match(pattern);
      if (match) {
        temperature = parseFloat(match[1]);
        break;
      }
    }
    
    // 如果检测到数字温度
    if (temperature !== null && temperature >= 37.3) {
      if (temperature >= 41.0) {
        return {
          title: '超高热',
          message: `检测到超高热：${temperature}℃！这是非常危险的情况，请立即拨打急救电话！`,
          severity: 'URGENT',
          temperature: temperature
        };
      } else if (temperature >= 39.0) {
        return {
          title: '高烧',
          message: `检测到高烧：${temperature}℃，请立即联系医生！`,
          severity: 'URGENT',
          temperature: temperature
        };
      } else if (temperature >= 38.1) {
        return {
          title: '中度发热',
          message: `检测到中度发热：${temperature}℃，请注意休息并监测体温变化。`,
          severity: 'WARN',
          temperature: temperature
        };
      } else if (temperature >= 37.3) {
        return {
          title: '低热',
          message: `检测到低热：${temperature}℃，请多喝水，注意休息。`,
          severity: 'WARN',
          temperature: temperature
        };
      }
    }
    
    // 如果没有数字但有发烧相关关键词
    const feverKeywords = ['高烧', '发烧', '发热', '体温很高', '感觉很热', '浑身发烫',
                          '身体发烫', '脸发烫', '发冷发热', '有点发烧', '有点热',
                          '体温升高', '感觉发烧', '好像发烧了'];
    if (feverKeywords.some(keyword => text.includes(keyword))) {
      return {
        title: '发烧',
        message: '检测到发烧症状，请测量体温并注意休息。如果体温持续升高，请联系医生。',
        severity: 'WARN',
        temperature: null
      };
    }
    
    return null;
  }

  /**
   * 通用异常检测方法（综合检测所有异常类型）
   */
  detectAllAlerts(text, time) {
    const alerts = [];
    const lowerText = text.toLowerCase();
    
    console.log(`[AlertService] 开始检测异常，输入文本: "${text}"`);
    
    // 检测体温异常
    const feverAlert = this.detectFever(lowerText);
    if (feverAlert) {
      console.log(`[AlertService] 检测到体温异常: ${feverAlert.title}`);
      // 确保体温告警有id
      feverAlert.id = this.generateId();
      feverAlert.time = time;
      feverAlert.source = 'text_detection';
      alerts.push(feverAlert);
    }
    
    // 检测症状异常
    const symptomAlerts = this.detectSymptomAlert(lowerText, time);
    if (symptomAlerts.length > 0) {
      console.log(`[AlertService] 检测到${symptomAlerts.length}个症状异常: ${symptomAlerts.map(a => a.title).join(', ')}`);
    }
    alerts.push(...symptomAlerts);
    
    // 检测行为异常
    const behaviorAlerts = this.detectBehaviorAlert(lowerText, time);
    if (behaviorAlerts.length > 0) {
      console.log(`[AlertService] 检测到${behaviorAlerts.length}个行为异常: ${behaviorAlerts.map(a => a.title).join(', ')}`);
    }
    alerts.push(...behaviorAlerts);
    
    // 确保所有告警都有必要的属性
    alerts.forEach(alert => {
      if (!alert.id) alert.id = this.generateId();
      if (!alert.time) alert.time = time;
      if (!alert.source) alert.source = 'text_detection';
    });
    
    console.log(`[AlertService] 检测完成，共发现${alerts.length}个异常`);
    return alerts;
  }

  /**
   * 检测症状异常（紧急医疗信号）
   */
  detectSymptomAlert(text, time) {
    const alerts = [];
    const lowerText = text.toLowerCase();
    
    // 中风征兆 - 最高优先级
    const strokeKeywords = ['口齿不清', '说不清话', '一侧无力', '口角歪斜', '手脚麻木', 
                           '言语不清', '说话不清楚', '半身不遂', '手脚不听使唤', '面瘫',
                           '半边身子麻', '半侧身体无力', '说话含糊', '言语障碍', '肢体麻木',
                           '面部麻木', '流口水', '嘴歪', '舌头发硬', '走路不稳', '站立不稳',
                           '半边发麻', '半身发麻', '半身麻木', '手脚发麻', '手臂发麻',
                           '腿脚发麻', '脸麻', '舌头麻', '突然不能说话', '说话不流利'];
    if (strokeKeywords.some(keyword => lowerText.includes(keyword))) {
      alerts.push({
        id: this.generateId(),
        type: 'symptom.stroke',
        title: '中风征兆',
        message: '检测到可能的中风征兆，请立即拨打急救电话！症状包括：口齿不清、一侧无力、口角歪斜等。',
        severity: 'URGENT',
        time: time,
        data: { text }
      });
    }
    
    // 心脏问题
    const heartKeywords = ['胸痛', '胸闷', '心慌', '心悸', '心跳过快', '心律不齐', 
                          '心肌梗死', '心绞痛', '心脏疼', '胸口痛', '心跳加速',
                          '心跳不规律', '胸闷憋气', '心前区疼痛', '心跳过慢', '心慌气短',
                          '心脏难受', '胸口发闷', '心脏压迫感', '心脏不舒服', '心闷',
                          '左胸疼痛', '胸口压迫', '心跳异常', '心慌慌', '心悸不安'];
    if (heartKeywords.some(keyword => lowerText.includes(keyword))) {
      alerts.push({
        id: this.generateId(),
        type: 'symptom.heart',
        title: '心脏问题',
        message: '检测到心脏相关症状：胸痛、胸闷、心慌等，请立即联系医生或就医！',
        severity: 'URGENT',
        time: time,
        data: { text }
      });
    }
    
    // 呼吸问题
    const breathKeywords = ['呼吸困难', '喘不上气', '胸闷气短', '喘不过气', '窒息', '气短',
                           '呼吸急促', '喘息', '上气不接下气', '胸闷', '呼吸费力',
                           '感觉喘', '喘鸣', '呼吸不畅', '胸口发闷', '喉咙发紧',
                           '喘着粗气', '呼吸声大', '呼吸很费力', '感觉喘不过气',
                           '呼吸难受', '呼吸异常', '憋得慌', '上气不接下气', '呼吸困难'];
    if (breathKeywords.some(keyword => lowerText.includes(keyword))) {
      alerts.push({
        id: this.generateId(),
        type: 'symptom.breath',
        title: '呼吸问题',
        message: '检测到呼吸困难症状，请保持冷静，立即联系医生！',
        severity: 'URGENT',
        time: time,
        data: { text }
      });
    }
    
    // 意识问题（只检测严重症状）
    const consciousnessKeywords = ['意识模糊', '昏迷', '失去意识', '神志不清', '嗜睡', '昏睡',
                                  '精神恍惚'];
    const severeConsciousnessPatterns = [/突然晕倒/, /突然昏倒/, /突然失去意识/, /突然感觉头晕/];
    const hasConsciousnessIssue = consciousnessKeywords.some(keyword => lowerText.includes(keyword)) ||
                                  severeConsciousnessPatterns.some(pattern => pattern.test(lowerText));
    if (hasConsciousnessIssue) {
      alerts.push({
        id: this.generateId(),
        type: 'symptom.consciousness',
        title: '意识问题',
        message: '检测到意识相关症状，请坐下休息并联系家人。',
        severity: 'URGENT',
        time: time,
        data: { text }
      });
    }
    
    // 出血问题 - 支持口语化表达（如"吐了好多血"、"咳出来血"等）
    const bleedingKeywords = ['大量出血', '呕血', '黑便', '吐血', '便血', '鼻出血',
                             '出血不止', '伤口流血', '流鼻血', '牙龈出血', '皮下出血',
                             '尿血', '阴道出血', '咯血', '吐血块', '大便发黑',
                             '血便', '流血不止', '伤口渗血', '大便带血', '便中带血',
                             '呕血', '咳血', '痰中带血', '牙龈出血不止'];
    const bleedingPatterns = [/吐[了得]?.*血/, /咳[了得]?.*血/, /呕[了得]?.*血/,
                              /流[了得]?.*血/, /出血/, /血[水液]/, /带血/, /便血/];
    const hasBleeding = bleedingKeywords.some(keyword => lowerText.includes(keyword)) ||
                        bleedingPatterns.some(pattern => pattern.test(lowerText));
    if (hasBleeding) {
      alerts.push({
        id: this.generateId(),
        type: 'symptom.bleeding',
        title: '出血问题',
        message: '检测到出血相关症状，请立即就医！',
        severity: 'URGENT',
        time: time,
        data: { text }
      });
    }
    
    // 严重疼痛
    const painKeywords = ['剧烈疼痛', '剧痛', '无法忍受的疼痛', '痛得厉害', '疼死了',
                         '疼得受不了', '尖锐疼痛', '撕裂痛', '刀割样痛', '绞痛',
                         '烧灼痛', '持续性疼痛', '一阵阵剧痛', '疼得要命', '非常痛',
                         '极度疼痛', '剧烈难忍', '钻心的疼', '疼得直不起腰', '肚子剧痛',
                         '痛的直不起腰', '痛得直不起腰', '疼的直不起腰', '痛不欲生',
                         '无法忍受', '受不了了', '疼的厉害', '痛得受不了', '疼痛难忍'];
    if (painKeywords.some(keyword => lowerText.includes(keyword))) {
      alerts.push({
        id: this.generateId(),
        type: 'symptom.severe_pain',
        title: '严重疼痛',
        message: '检测到严重疼痛症状，请立即联系医生！',
        severity: 'URGENT',
        time: time,
        data: { text }
      });
    }
    
    // 呕吐 - 如果伴随出血则升级为紧急
    const vomitingKeywords = ['呕吐', '恶心', '想吐', '反胃', '吐了', '呕吐物',
                             '反酸', '烧心', '胃不舒服', '想吐酸水', '频繁呕吐',
                             '呕吐不止', '吐出来', '恶心想吐', '胃部不适'];
    const hasVomiting = vomitingKeywords.some(keyword => lowerText.includes(keyword));
    const hasBloodWithVomit = hasVomiting && (hasBleeding || /血/.test(lowerText));
    if (hasVomiting) {
      if (hasBloodWithVomit) {
        alerts.push({
          id: this.generateId(),
          type: 'symptom.vomiting_blood',
          title: '呕血紧急',
          message: '检测到呕吐伴随出血，这是消化道出血的紧急征兆，请立即拨打120急救电话！',
          severity: 'URGENT',
          time: time,
          data: { text }
        });
      } else {
        alerts.push({
          id: this.generateId(),
          type: 'symptom.vomiting',
          title: '呕吐',
          message: '检测到呕吐症状，请保持水分摄入。如果呕吐频繁或带血，请立即就医！',
          severity: 'WARN',
          time: time,
          data: { text }
        });
      }
    }
    
    // 腹泻（只检测明显的腹泻症状）
    const diarrheaKeywords = ['腹泻', '拉肚子', '水样便', '频繁排便', '大便稀',
                             '拉稀', '腹泻不止', '频繁拉肚子', '上吐下泻',
                             '连续拉肚子', '多次腹泻'];
    const severeDiarrheaPattern = /拉了?\s*(\d+)\s*次/;
    const match = lowerText.match(severeDiarrheaPattern);
    const hasSevereDiarrhea = match && Number(match[1]) >= 3; // 至少拉了3次才告警
    
    const hasDiarrheaKeyword = diarrheaKeywords.some(keyword => lowerText.includes(keyword));
    
    if (hasDiarrheaKeyword || hasSevereDiarrhea) {
      alerts.push({
        id: this.generateId(),
        type: 'symptom.diarrhea',
        title: '腹泻',
        message: '检测到腹泻症状，请补充水分和电解质。如果持续腹泻或便中带血，请就医！',
        severity: 'WARN',
        time: time,
        data: { text }
      });
    }
    
    return alerts;
  }

  /**
   * 检测行为异常
   */
  detectBehaviorAlert(text, time) {
    const alerts = [];
    const lowerText = text.toLowerCase();
    
    // 自伤风险 - 需要拦截
    if (lowerText.includes('自杀') || lowerText.includes('想死') || 
        lowerText.includes('不想活了') || lowerText.includes('活不下去')) {
      alerts.push({
        id: this.generateId(),
        type: 'behavior.self_harm',
        title: '自伤风险',
        message: '检测到自伤风险倾向，请立即联系家人或心理援助热线！',
        severity: 'BLOCK',
        time: time,
        data: { text }
      });
    }
    
    // 用药调整风险
    if (lowerText.includes('加量') || lowerText.includes('减量') ||
        lowerText.includes('停药') || lowerText.includes('换药')) {
      alerts.push({
        id: this.generateId(),
        type: 'behavior.med_change',
        title: '用药调整风险',
        message: '检测到用药调整意图：加量、减量、停药或换药。请咨询医生后再做决定！',
        severity: 'WARN',
        time: time,
        data: { text }
      });
    }
    
    // 运动风险
    if (lowerText.includes('空腹运动') || lowerText.includes('高强度运动')) {
      alerts.push({
        id: this.generateId(),
        type: 'behavior.exercise_risk',
        title: '运动风险',
        message: '检测到可能的运动风险：空腹运动或高强度运动。请根据身体状况适量运动。',
        severity: 'WARN',
        time: time,
        data: { text }
      });
    }
    
    // 饮食风险（结合高血压等慢性病）
    if (lowerText.includes('肥肉') || lowerText.includes('油炸') ||
        lowerText.includes('咸菜') || lowerText.includes('奶油蛋糕')) {
      alerts.push({
        id: this.generateId(),
        type: 'behavior.diet_risk',
        title: '饮食风险',
        message: '检测到可能影响健康的饮食：高油、高盐食物。请注意饮食健康。',
        severity: 'INFO',
        time: time,
        data: { text }
      });
    }
    
    return alerts;
  }

  /**
   * 检测用药依从性异常
   */
  detectMedicationAlert(records, currentTime) {
    const alerts = [];
    
    if (!records || records.length === 0) return alerts;
    
    // 检查最近用药记录
    const recentRecords = records.slice(-7); // 最近7天记录
    
    // 检查是否有漏服趋势
    const daysWithMedication = new Set();
    recentRecords.forEach(record => {
      const date = new Date(record.time).toDateString();
      daysWithMedication.add(date);
    });
    
    // 如果最近7天内服药天数少于4天，可能存在漏服问题
    if (daysWithMedication.size < 4) {
      alerts.push({
        id: this.generateId(),
        type: 'medication.missed',
        title: '用药依从性提醒',
        message: `最近7天内仅在${daysWithMedication.size}天服药，请注意按时服药！`,
        severity: 'WARN',
        time: currentTime,
        data: { daysCount: daysWithMedication.size }
      });
    }
    
    return alerts;
  }

  /**
   * 检测血压趋势异常
   */
  detectBpTrendAlert(records) {
    const alerts = [];
    
    if (!records || records.length < 5) return alerts;
    
    // 取最近5条记录
    const recentRecords = records.slice(-5).sort((a, b) => new Date(a.time) - new Date(b.time));
    
    // 检查持续上升趋势
    let risingCount = 0;
    for (let i = 1; i < recentRecords.length; i++) {
      const prev = recentRecords[i - 1];
      const curr = recentRecords[i];
      if (curr.systolic > prev.systolic) {
        risingCount++;
      }
    }
    
    // 如果连续上升趋势明显
    if (risingCount >= 4) {
      const firstSystolic = recentRecords[0].systolic;
      const lastSystolic = recentRecords[recentRecords.length - 1].systolic;
      const increase = lastSystolic - firstSystolic;
      
      alerts.push({
        id: this.generateId(),
        type: 'trend.bp_rise',
        title: '血压持续上升',
        message: `检测到血压持续上升趋势，近5次测量中收缩压上升了${increase} mmHg，请关注并咨询医生。`,
        severity: 'WARN',
        time: recentRecords[recentRecords.length - 1].time,
        data: { increase, count: risingCount }
      });
    }
    
    // 检查波动过大
    const systolics = recentRecords.map(r => r.systolic);
    const maxSystolic = Math.max(...systolics);
    const minSystolic = Math.min(...systolics);
    const fluctuation = maxSystolic - minSystolic;
    
    if (fluctuation > 20) {
      alerts.push({
        id: this.generateId(),
        type: 'trend.bp_fluctuation',
        title: '血压波动过大',
        message: `检测到血压波动较大，日间收缩压波动${fluctuation} mmHg，请注意观察并保持情绪稳定。`,
        severity: 'INFO',
        time: recentRecords[recentRecords.length - 1].time,
        data: { fluctuation }
      });
    }
    
    return alerts;
  }

  /**
   * 获取告警严重程度标签颜色
   */
  getSeverityClass(severity) {
    switch (severity) {
      case 'URGENT': return 'alert-urgent';
      case 'BLOCK': return 'alert-block';
      case 'WARN': return 'alert-warn';
      case 'INFO': return 'alert-info';
      default: return 'alert-info';
    }
  }

  /**
   * 获取告警严重程度中文描述
   */
  getSeverityText(severity) {
    switch (severity) {
      case 'URGENT': return '紧急';
      case 'BLOCK': return '阻断';
      case 'WARN': return '警告';
      case 'INFO': return '提示';
      default: return '提示';
    }
  }

  /**
   * 生成唯一ID
   */
  generateId() {
    return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export const alertService = new AlertService();