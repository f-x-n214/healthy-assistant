/**
 * 记忆系统 - 缓存机制
 * 
 * 缓存策略：
 * - profile / memory: 会话级缓存（整个会话期间有效）
 * - records: 5分钟缓存（平衡性能与实时性）
 * - statistics: 10分钟缓存
 */

const CACHE_TTL = {
  profile: Infinity,          // 会话级缓存
  memory: Infinity,           // 会话级缓存
  records: 30 * 1000,        // 30秒（缩短缓存时间以提高实时性）
  statistics: 10 * 60 * 1000, // 10分钟
  reminders: 2 * 60 * 1000,  // 2分钟
};

export class MemoryCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * 获取缓存数据
   * @param {string} key - 缓存键
   * @param {string} type - 缓存类型 (profile/memory/records/statistics/reminders)
   * @returns {any|null} 缓存数据，过期或不存在返回null
   */
  get(key, type = 'records') {
    const item = this.cache.get(key);
    if (!item) return null;

    const age = Date.now() - item.timestamp;
    const ttl = CACHE_TTL[type] ?? CACHE_TTL.records;

    // 会话级缓存永不过期
    if (ttl === Infinity) return item.data;

    // 超时则清除
    if (age > ttl) {
      this.cache.delete(key);
      return null;
    }

    return item.data;
  }

  /**
   * 设置缓存数据
   * @param {string} key - 缓存键
   * @param {any} data - 缓存数据
   * @param {string} type - 缓存类型
   */
  set(key, data, type = 'records') {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      type,
    });
  }

  /**
   * 使指定缓存失效
   * @param {string} key - 缓存键
   */
  invalidate(key) {
    if (key) {
      this.cache.delete(key);
    }
  }

  /**
   * 使某类缓存全部失效
   * @param {string} type - 缓存类型
   */
  invalidateByType(type) {
    for (const [key, item] of this.cache) {
      if (item.type === type) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清除所有缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  stats() {
    const byType = {};
    for (const [, item] of this.cache) {
      byType[item.type] = (byType[item.type] || 0) + 1;
    }
    return {
      total: this.cache.size,
      byType,
    };
  }
}
