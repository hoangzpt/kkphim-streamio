/**
 * BoundedCache: Bộ nhớ đệm giới hạn dung lượng và có thời gian sống (TTL)
 * Tự động giải phóng phần tử cũ nhất khi vượt quá maxSize (FIFO/LRU eviction)
 * Ngăn ngừa rò rỉ bộ nhớ (Memory Leak) trên Vercel Serverless warm instances.
 */
class BoundedCache {
  constructor(maxSize = 500, ttlMs = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Kiểm tra TTL
    if (Date.now() - entry.time > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.data;
  }

  set(key, data, customTtlMs) {
    // Nếu key đã tồn tại, xóa trước để cập nhật thứ tự (LRU-like)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Đã đầy bộ nhớ: xóa phần tử lâu nhất (phần tử đầu tiên trong Map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      time: Date.now(),
      ttl: customTtlMs || this.ttlMs,
    });
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

module.exports = { BoundedCache };
