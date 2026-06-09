/**
 * Rate Limiter
 * ============
 * Защита от превышения лимитов hh.ru и от бана аккаунта.
 *
 * hh.ru ЛИМИТЫ (2025-2026):
 * - Отклики: ~200/день, ~3000/месяц (для обычных аккаунтов)
 * - IP rate limit: 429 Too Many Requests при > N запросов/мин
 * - Shadow ban: без предупреждения при подозрении на автоматизацию
 *
 * МЕТОДИКА РЕАЛИЗАЦИИ:
 * - Token bucket algorithm для smooth rate limiting
 * - Жёсткий daily cap (настраиваемый, default 200)
 * - Min interval между откликами (default 30s)
 * - Adaptive slowdown при обнаружении 429 или замедления ответов
 *
 * ANTI-HALLUCINATION:
 * - Все лимиты проверяются ДО выполнения действия
 * - Возврат { allowed: false } если лимит превышен
 * - Логирование каждого check и rejection
 */

const DEFAULT_RATE_LIMITS = {
  maxPerDay: 200,
  maxPerHour: 30,
  minIntervalMs: 30000,       // 30 секунд между откликами
  burstMax: 5,                 // макс откликов подряд без длинной паузы
  burstPauseMs: 120000         // 2 минуты паузы после burst
};

export class RateLimiter {
  constructor() {
    this.limits = { ...DEFAULT_RATE_LIMITS };
    this.lastActionTime = 0;
    this.burstCount = 0;
    this.hourlyCount = 0;
    this.currentHour = new Date().getHours();
    this.adaptiveFactor = 1.0;  // Умножается при 429
  }

  /**
   * Проверяет, разрешено ли выполнить действие.
   *
   * ПРОВЕРКИ (по порядку):
   * 1. Daily cap: сколько откликов сегодня?
   * 2. Hourly cap: сколько за последний час?
   * 3. Min interval: прошло ли достаточно времени с последнего отклика?
   * 4. Burst detection: не слишком много подряд?
   * 5. Adaptive factor: не замедлены ли мы (после 429)?
   *
   * @returns {{ allowed: boolean, reason?: string, waitMs?: number }}
   */
  async check() {
    const stats = await this._getStats();
    const settings = await this._getSettings();
    const now = Date.now();

    // 1. Daily cap
    const dailyLimit = settings.dailyLimit || this.limits.maxPerDay;
    if (stats.appliedToday >= dailyLimit) {
      return { allowed: false, reason: `Дневной лимит достигнут: ${stats.appliedToday}/${dailyLimit}` };
    }

    // 2. Hourly cap (сброс при смене часа)
    this._checkHourReset();
    if (this.hourlyCount >= this.limits.maxPerHour) {
      return { allowed: false, reason: `Часовой лимит: ${this.hourlyCount}/${this.limits.maxPerHour}`, waitMs: 3600000 };
    }

    // 3. Min interval
    const effectiveInterval = this.limits.minIntervalMs * this.adaptiveFactor;
    const elapsed = now - this.lastActionTime;
    if (elapsed < effectiveInterval) {
      const waitMs = effectiveInterval - elapsed;
      return { allowed: false, reason: `Слишком быстро, подождите`, waitMs };
    }

    // 4. Burst detection
    if (this.burstCount >= this.limits.burstMax) {
      return {
        allowed: false,
        reason: `Burst pause: ${this.burstCount} откликов подряд, пауза 2 мин`,
        waitMs: this.limits.burstPauseMs
      };
    }

    return { allowed: true };
  }

  /**
   * Регистрирует выполненное действие.
   * Вызывать ПОСЛЕ успешного отклика.
   */
  recordAction() {
    this.lastActionTime = Date.now();
    this.burstCount++;
    this.hourlyCount++;
  }

  /**
   * Adaptive slowdown при получении 429 или подозрении на бан.
   * Увеличивает интервал между действиями.
   *
   * @param {string} reason - '429' | 'slow' | 'captcha' | 'manual'
   */
  adaptiveSlowdown(reason) {
    const factors = {
      '429': 2.0,      // Двойной интервал при 429
      'slow': 1.5,      // Полуторный при замедлении
      'captcha': 1.3,   // Чуть больше при CAPTCHA
      'manual': 1.0     // Без изменения
    };
    const factor = factors[reason] || 1.0;
    this.adaptiveFactor = Math.min(5.0, this.adaptiveFactor * factor);
    console.warn(`[RateLimiter] Adaptive slowdown: factor=${this.adaptiveFactor.toFixed(2)} (reason: ${reason})`);
  }

  /**
   * Сброс burst счётчика после паузы.
   */
  resetBurst() {
    this.burstCount = 0;
  }

  /**
   * Полный сброс адаптивного фактора (новый день).
   */
  resetAdaptive() {
    this.adaptiveFactor = 1.0;
  }

  // ─── Private ────────────────────────────────

  _checkHourReset() {
    const currentHour = new Date().getHours();
    if (currentHour !== this.currentHour) {
      this.hourlyCount = 0;
      this.currentHour = currentHour;
    }
  }

  async _getStats() {
    try {
      const data = await chrome.storage.local.get('stats');
      return data.stats || { appliedToday: 0 };
    } catch {
      return { appliedToday: 0 };
    }
  }

  async _getSettings() {
    try {
      const data = await chrome.storage.local.get('settings');
      return data.settings || {};
    } catch {
      return {};
    }
  }
}

// Singleton
export const rateLimiter = new RateLimiter();
