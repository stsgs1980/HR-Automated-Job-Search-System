/**
 * Storage Module
 * ==============
 * Единый интерфейс для chrome.storage.local.
 *
 * МЕТОДИКА:
 * - Все данные хранятся локально (chrome.storage.local)
 * - Нет серверного бэкенда — расширение полностью автономно
 * - IndexedDB для больших данных (история откликов, логи)
 * - chrome.storage для настроек и счётчиков
 *
 * СХЕМА ХРАНИЛИЩА:
 * {
 *   settings: AppSettings,
 *   stats: DailyStats,
 *   appliedVacancies: string[],   // ID вакансий
 *   skippedVacancies: string[],  // ID вакансий
 *   blacklistedCompanies: string[],
 *   templates: CoverLetterTemplate[],
 *   dailyResetDate: string        // "YYYY-MM-DD"
 * }
 */

const STORAGE_KEYS = {
  SETTINGS: 'settings',
  STATS: 'stats',
  APPLIED: 'appliedVacancies',
  SKIPPED: 'skippedVacancies',
  BLACKLIST: 'blacklistedCompanies',
  TEMPLATES: 'templates',
  DAILY_RESET: 'dailyResetDate',
  LOGS: 'logs'
};

// ─── Default Settings ──────────────────────────

const DEFAULT_SETTINGS = {
  mode: 'manual',           // 'manual' | 'semi-auto' | 'auto'
  dailyLimit: 200,           // Макс откликов в день (hh.ru лимит ~200/день)
  minMatchScore: 60,         // Минимальный match score для auto-отклика
  letterTone: 'formal',     // 'confident' | 'friendly' | 'formal'
  searchInterval: 300,       // Интервал авто-поиска (сек)
  autoScroll: true,          // Авто-скролл страницы поиска
  showMatchScore: true,      // Показывать match score на карточках
  confirmBeforeApply: true,  // Подтверждение перед откликом
  coverLetterTemplate: ''    // Шаблон сопроводительного письма
};

const DEFAULT_STATS = {
  totalApplied: 0,
  appliedToday: 0,
  interviewInvites: 0,
  responsesReceived: 0,
  skipsToday: 0,
  errorsToday: 0,
  lastActivity: null
};

// ─── Public API ───────────────────────────────

/**
 * Получает значение из storage.
 * ANTI-HALLUCINATION: возвращает defaultValue если ключа нет или значение невалидно.
 */
export async function getSetting(key) {
  try {
    const data = await chrome.storage.local.get(key);
    const value = data[key];
    if (value === undefined || value === null) {
      return DEFAULT_SETTINGS[key] ?? null;
    }
    return value;
  } catch (e) {
    console.error(`[Storage] Error reading key "${key}": ${e.message}`);
    return DEFAULT_SETTINGS[key] ?? null;
  }
}

/**
 * Сохраняет значение в storage.
 */
export async function setSetting(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (e) {
    console.error(`[Storage] Error writing key "${key}": ${e.message}`);
  }
}

/**
 * Получает все настройки с defaults.
 */
export async function getAllSettings() {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Сохраняет все настройки.
 */
export async function saveAllSettings(settings) {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: { ...DEFAULT_SETTINGS, ...settings }
    });
  } catch (e) {
    console.error('[Storage] Error saving settings:', e.message);
  }
}

/**
 * Получает статистику.
 */
export async function getStats() {
  try {
    await checkDailyReset();
    const data = await chrome.storage.local.get(STORAGE_KEYS.STATS);
    return { ...DEFAULT_STATS, ...(data.stats || {}) };
  } catch (e) {
    return { ...DEFAULT_STATS };
  }
}

/**
 * Инкрементирует счётчик откликов за сегодня.
 * МЕТОДИКА: проверяет dailyLimit перед инкрементом.
 * @returns {{ allowed: boolean, remaining: number }}
 */
export async function incrementApplied() {
  const stats = await getStats();
  const settings = await getAllSettings();

  if (stats.appliedToday >= settings.dailyLimit) {
    return { allowed: false, remaining: 0 };
  }

  stats.appliedToday++;
  stats.totalApplied++;
  stats.lastActivity = new Date().toISOString();

  await chrome.storage.local.set({ [STORAGE_KEYS.STATS]: stats });
  return { allowed: true, remaining: settings.dailyLimit - stats.appliedToday };
}

/**
 * Проверяет, был ли уже отклик на эту вакансию.
 * ANTI-HALLUCINATION: проверяем по ID (из URL), а не по title.
 */
export async function isAlreadyApplied(vacancyId) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.APPLIED);
  const applied = data[STORAGE_KEYS.APPLIED] || [];
  return applied.includes(vacancyId);
}

/**
 * Записывает ID откликнутой вакансии.
 */
export async function markAsApplied(vacancyId) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.APPLIED);
  const applied = data[STORAGE_KEYS.APPLIED] || [];
  if (!applied.includes(vacancyId)) {
    applied.push(vacancyId);
    await chrome.storage.local.set({ [STORAGE_KEYS.APPLIED]: applied });
  }
}

/**
 * Добавляет компанию в чёрный список.
 */
export async function addToBlacklist(companyName) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.BLACKLIST);
  const list = data[STORAGE_KEYS.BLACKLIST] || [];
  if (!list.includes(companyName)) {
    list.push(companyName);
    await chrome.storage.local.set({ [STORAGE_KEYS.BLACKLIST]: list });
  }
}

/**
 * Проверяет, в чёрном ли списке компания.
 */
export async function isBlacklisted(companyName) {
  const data = await chrome.storage.local.get(STORAGE_KEYS.BLACKLIST);
  const list = data[STORAGE_KEYS.BLACKLIST] || [];
  return list.includes(companyName);
}

// ─── Daily Reset ───────────────────────────────

/**
 * Сбрасывает дневные счётчики в полночь.
 * МЕТОДИКА: сравниваем дату последнего сброса с текущей.
 */
async function checkDailyReset() {
  const data = await chrome.storage.local.get(STORAGE_KEYS.DAILY_RESET);
  const lastReset = data[STORAGE_KEYS.DAILY_RESET] || '';
  const today = new Date().toISOString().split('T')[0];

  if (lastReset !== today) {
    const statsData = await chrome.storage.local.get(STORAGE_KEYS.STATS);
    const stats = statsData[STORAGE_KEYS.STATS] || DEFAULT_STATS;
    stats.appliedToday = 0;
    stats.skipsToday = 0;
    stats.errorsToday = 0;
    await chrome.storage.local.set({
      [STORAGE_KEYS.STATS]: stats,
      [STORAGE_KEYS.DAILY_RESET]: today
    });
    console.info('[Storage] Daily counters reset');
  }
}

export { STORAGE_KEYS, DEFAULT_SETTINGS, DEFAULT_STATS };
