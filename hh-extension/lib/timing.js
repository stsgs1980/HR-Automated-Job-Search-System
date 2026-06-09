/**
 * Human-like Timing Module
 * =========================
 * Портировано из Python: hh-bot/src/hh/anti_detect.py
 *
 * МЕТОДИКА:
 * Используем гауссово распределение для delay между действиями,
 * чтобы паттерн автоматизации не детектировался как бот.
 *
 * Расширение работает в реальном браузере пользователя, поэтому риск
 * детекции минимален. Однако при массовых откликах (auto-mode)
 * человеческие тайминги критичны — hh.ru может анализировать
 * интервалы между действиями на стороне сервера.
 *
 * ПАРАМЕТРЫ (из anti_detect.py):
 * - gaussian_mean: 10.0s (средний delay между действиями)
 * - gaussian_stddev: 4.0s (разброс)
 * - reading_pause: 5-12s (имитация чтения вакансии)
 * - long_pause_every: 5 действий (длинная пауза)
 * - long_pause_duration: 30s (собирается, "думает")
 * - typing_delay: 30-120ms на символ
 */

const TIMING_CONFIG = {
  gaussianMean: 10.0,
  gaussianStddev: 4.0,
  readingPauseMin: 5.0,
  readingPauseMax: 12.0,
  longPauseEvery: 5,
  longPauseDuration: 30.0,
  typingDelayMin: 0.03,
  typingDelayMax: 0.12
};

/**
 * Box-Muller transform для гауссового распределения.
 * @param {number} mean
 * @param {number} stddev
 * @returns {number} случайное значение, clamped >= 2.0s
 */
export function gaussianRandom(mean = TIMING_CONFIG.gaussianMean, stddev = TIMING_CONFIG.gaussianStddev) {
  let u1 = Math.random();
  let u2 = Math.random();
  // Защита от edge cases
  u1 = Math.max(1e-10, Math.min(1 - 1e-10, u1));
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return Math.max(2.0, z * stddev + mean);
}

/**
 * Рандомный delay с гауссовым распределением.
 * @returns {Promise<void>}
 */
export function randomDelay() {
  const delay = gaussianRandom();
  return new Promise(resolve => setTimeout(resolve, delay * 1000));
}

/**
 * Имитация чтения вакансии (5-12 секунд).
 * Вызывается перед каждым откликом.
 */
export function simulateReading() {
  const min = TIMING_CONFIG.readingPauseMin;
  const max = TIMING_CONFIG.readingPauseMax;
  const delay = min + Math.random() * (max - min);
  return new Promise(resolve => setTimeout(resolve, delay * 1000));
}

/**
 * Длинная пауза (сбор, размышление).
 * Вызывается каждые N действий.
 */
export function simulateLongPause() {
  const base = TIMING_CONFIG.longPauseDuration;
  const noise = (Math.random() - 0.5) * 10; // ±5s
  const delay = Math.max(20, base + noise);
  return new Promise(resolve => setTimeout(resolve, delay * 1000));
}

/**
 * Имитация набора текста символ за символом.
 *
 * МЕТОДИКА: вставляем текст посимвольно с рандомной задержкой,
 * чтобы серверные логи показывали pattern живого человека.
 *
 * @param {HTMLInputElement|HTMLTextAreaElement} el - элемент ввода
 * @param {string} text - текст для ввода
 * @returns {Promise<void>}
 */
export async function simulateTyping(el, text) {
  if (!el || typeof text !== 'string') return;

  for (const char of text) {
    // Append character
    const currentValue = el.value || '';
    el.value = currentValue + char;
    el.dispatchEvent(new Event('input', { bubbles: true }));

    // Delay between keystrokes
    const min = TIMING_CONFIG.typingDelayMin;
    const max = TIMING_CONFIG.typingDelayMax;
    const delay = min + Math.random() * (max - min);
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
  }
}

/**
 * Контроллер пакетных действий — вставляет длинную паузу каждые N откликов.
 *
 * МЕТОДИКА ВЕРИФИКАЦИИ:
 * - Счётчик хранится в chrome.storage (переживает перезагрузку страницы)
 * - Сбрасывается в полночь (новый день = новый лимит)
 */
export class BatchTimingController {
  constructor() {
    this.actionCount = 0;
    this.batchSize = TIMING_CONFIG.longPauseEvery;
  }

  /**
   * Вызывается между откликами.
   * Возвращает Promise с нужным delay.
   */
  async betweenApplications() {
    this.actionCount++;

    // Каждые batchSize действий — длинная пауза
    if (this.actionCount % this.batchSize === 0) {
      console.debug(`[Timing] Long pause after ${this.actionCount} actions`);
      await simulateLongPause();
      return;
    }

    // Обычный delay между действиями
    await randomDelay();
  }

  reset() {
    this.actionCount = 0;
  }
}
