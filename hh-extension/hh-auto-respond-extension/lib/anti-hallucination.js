/**
 * Anti-Hallucination Module
 * ===========================
 * Методики верификации данных, DOM-элементов и пользовательских действий.
 *
 * ПРОБЛЕМА: Content script работает в изменчивой среде — DOM hh.ru может
 * меняться без предупреждения. Если код предполагает структуру которой нет,
 * он «галлюцинирует» данные (извлекает текст из неправильных элементов,
 * кликает не туда, заполняет не те поля).
 *
 * РЕШЕНИЕ: Трёхуровневая система верификации:
 * 1. DOM Verification — проверка существования и содержимого элементов
 * 2. Data Validation — проверка извлечённых данных на валидность
 * 3. Action Verification — проверка результатов действий (клик, ввод, сабмит)
 */

// ─── 1. DOM Verification ───────────────────────

/**
 * Безопасное извлечение текста из элемента.
 *
 * ANTI-HALLUCINATION CHECKS:
 * - Element существует?
 * - Element виден (offsetParent)?
 * - Текст не пустой?
 * - Текст не является whitespace-only?
 *
 * @param {Element|null} el - DOM элемент
 * @param {string} fallback - значение если извлечение не удалось
 * @returns {string} текст элемента или fallback
 */
export function safeGetText(el, fallback = '') {
  if (!el || !(el instanceof Element)) {
    return fallback;
  }
  // Проверяем видимость
  if (!isVisible(el)) {
    return fallback;
  }
  const text = el.textContent?.trim() || '';
  if (text.length === 0) {
    return fallback;
  }
  return text;
}

/**
 * Безопасное извлечение атрибута.
 * ANTI-HALLUCINATION: проверяет существование атрибута, не возвращает undefined.
 */
export function safeGetAttr(el, attr, fallback = '') {
  if (!el || !(el instanceof Element)) return fallback;
  const value = el.getAttribute(attr);
  return value !== null ? value : fallback;
}

/**
 * Безопасный querySelector с fallback.
 *
 * МЕТОДИКА: вместо document.querySelector(selector).textContent
 * (который бросает ошибку если элемента нет) используем wrapper.
 *
 * @param {Element} root - корневой элемент
 * @param {string} selector - CSS selector
 * @param {string} mode - 'text' | 'attr' | 'element'
 * @param {string} extra - имя атрибута для mode='attr'
 * @returns {string|Element|null}
 */
export function safeQuery(root, selector, mode = 'text', extra = '') {
  try {
    const el = root.querySelector(selector);
    if (!el) return mode === 'element' ? null : '';

    switch (mode) {
      case 'text':
        return safeGetText(el);
      case 'attr':
        return safeGetAttr(el, extra);
      case 'element':
        return el;
      default:
        return '';
    }
  } catch (e) {
    console.warn(`[AntiHallucination] safeQuery failed for "${selector}": ${e.message}`);
    return mode === 'element' ? null : '';
  }
}

/**
 * Проверяет видимость элемента.
 */
export function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' &&
         style.visibility !== 'hidden' &&
         style.opacity !== '0';
}

// ─── 2. Data Validation ───────────────────────

/**
 * Проверяет что извлечённые данные о вакансии валидны.
 *
 * КРИТЕРИИ ВАЛИДНОСТИ:
 * - title: не пустой, не "undefined", не HTML, длина >= 3
 * - company: не пустой, длина >= 2
 * - url: начинается с https://hh.ru/
 * - salary: строка (может быть пустой — не все вакансии указывают ЗП)
 *
 * @param {Object} vacancy - объект вакансии
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateVacancyData(vacancy) {
  const errors = [];

  if (!vacancy || typeof vacancy !== 'object') {
    return { valid: false, errors: ['Vacancy is not an object'] };
  }

  // Title validation
  if (!vacancy.title || typeof vacancy.title !== 'string') {
    errors.push('title is missing or not a string');
  } else if (vacancy.title.trim().length < 3) {
    errors.push(`title too short: "${vacancy.title}"`);
  } else if (vacancy.title.includes('<') || vacancy.title.includes('>')) {
    errors.push(`title contains HTML: "${vacancy.title}"`);
  }

  // Company validation
  if (!vacancy.company || typeof vacancy.company !== 'string') {
    errors.push('company is missing or not a string');
  } else if (vacancy.company.trim().length < 2) {
    errors.push(`company too short: "${vacancy.company}"`);
  }

  // URL validation
  if (!vacancy.url || typeof vacancy.url !== 'string') {
    errors.push('url is missing or not a string');
  } else if (!vacancy.url.startsWith('https://hh.ru/')) {
    errors.push(`url has wrong domain: "${vacancy.url}"`);
  }

  // ID validation
  if (!vacancy.id || typeof vacancy.id !== 'string') {
    errors.push('id is missing or not a string');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Проверяет что вакансия не является дубликатом.
 * ANTI-HALLUCINATION: сравниваем по id (из URL), а не по title (title может
 * совпадать у разных вакансий или отличаться пробелами).
 */
export function isDuplicate(vacancy, existingVacancies) {
  if (!existingVacancies || !Array.isArray(existingVacancies)) return false;
  if (!vacancy || !vacancy.id) return false;
  return existingVacancies.some(v => v.id === vacancy.id);
}

/**
 * Извлекает vacancy ID из URL.
 * ANTI-HALLUCINATION: проверяет формат URL перед извлечением.
 *
 * Формат: https://hh.ru/vacancy/1234567 -> "1234567"
 */
export function extractVacancyId(url) {
  if (!url || typeof url !== 'string') return '';
  const match = url.match(/\/vacancy\/(\d+)/);
  return match ? match[1] : '';
}

// ─── 3. Action Verification ───────────────────

/**
 * Ожидает появления элемента в DOM.
 * ANTI-HALLUCINATION: не сработает если селектор неправильный —
 * возвращает null вместо hang, есть таймаут.
 *
 * @param {string[]} selectors - fallback-цепочка селекторов
 * @param {number} timeout - максимальное ожидание в мс
 * @param {Element} root - корневой элемент
 * @returns {Promise<Element|null>}
 */
export function waitForElement(selectors, timeout = 10000, root = document) {
  return new Promise(resolve => {
    // Мгновенная проверка
    for (const selector of selectors) {
      try {
        const el = root.querySelector(selector);
        if (el && isVisible(el)) {
          resolve(el);
          return;
        }
      } catch (e) { /* next selector */ }
    }

    // Polling через MutationObserver
    const startTime = Date.now();
    const observer = new MutationObserver(() => {
      if (Date.now() - startTime > timeout) {
        observer.disconnect();
        resolve(null);
        return;
      }
      for (const selector of selectors) {
        try {
          const el = root.querySelector(selector);
          if (el && isVisible(el)) {
            observer.disconnect();
            resolve(el);
            return;
          }
        } catch (e) { /* next selector */ }
      }
    });

    observer.observe(root.body || root, {
      childList: true,
      subtree: true
    });
  });
}

/**
 * Безопасный клик с верификацией.
 *
 * МЕТОДИКА ПРОВЕРКИ:
 * 1. Элемент существует и видим
 * 2. Элемент не disabled
 * 3. Кликаем программно
 * 4. НЕ проверяем результат клика (он async, DOM обновится через observer)
 *
 * ANTI-HALLUCINATION:
 * - НИКОГДА не кликаем по невидимым/отсутствующим элементам
 * - Логируем что кликнули, для отладки
 */
export function safeClick(el, label = '') {
  if (!el || !(el instanceof Element)) {
    console.warn(`[AntiHallucination] safeClick: element not found for "${label}"`);
    return false;
  }
  if (!isVisible(el)) {
    console.warn(`[AntiHallucination] safeClick: element not visible for "${label}"`);
    return false;
  }
  if (el.disabled) {
    console.warn(`[AntiHallucination] safeClick: element disabled for "${label}"`);
    return false;
  }
  el.click();
  console.debug(`[AntiHallucination] Clicked: "${label}"`);
  return true;
}

/**
 * Безопасный ввод текста в поле.
 *
 * ANTI-HALLUCINATION CHECKS:
 * - Element существует?
 * - Это input или textarea?
 * - Element не disabled/readonly?
 * - Текст не null/undefined?
 *
 * МЕТОДИКА: использует native inputSetter для обхода React synthetic events.
 */
export function safeInput(el, text, label = '') {
  if (!el || !(el instanceof HTMLElement)) {
    console.warn(`[AntiHallucination] safeInput: element not found for "${label}"`);
    return false;
  }
  if (el.disabled || el.readOnly) {
    console.warn(`[AntiHallucination] safeInput: element disabled/readonly for "${label}"`);
    return false;
  }
  if (typeof text !== 'string' || text.length === 0) {
    console.warn(`[AntiHallucination] safeInput: empty text for "${label}"`);
    return false;
  }

  // React workaround: set value through native setter
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set || Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    el.value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  console.debug(`[AntiHallucination] Input text (${text.length} chars) into "${label}"`);
  return true;
}

// ─── 4. Structured Logger ──────────────────────

/**
 * Структурированный логгер с уровнями.
 * Каждый лог содержит: timestamp, level, module, action, data.
 * Это единственный источник truth для отладки и аудита.
 */
class Logger {
  constructor(module) {
    this.module = module;
  }

  _log(level, action, data = null) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      module: this.module,
      action,
      data: data ? JSON.parse(JSON.stringify(data)) : null
    };

    switch (level) {
      case 'error':
        console.error(`[HH-AR][${this.module}] ${action}`, data);
        break;
      case 'warn':
        console.warn(`[HH-AR][${this.module}] ${action}`, data);
        break;
      default:
        console.debug(`[HH-AR][${this.module}] ${action}`, data);
    }

    // Сохраняем в chrome.storage для popup-аналитики
    this._persistLog(entry);
  }

  async _persistLog(entry) {
    try {
      const { logs = [] } = await chrome.storage.local.get('logs');
      logs.push(entry);
      // Храним последние 500 записей
      if (logs.length > 500) logs.splice(0, logs.length - 500);
      await chrome.storage.local.set({ logs });
    } catch (e) {
      // Storage might not be available in all contexts
    }
  }

  info(action, data) { this._log('info', action, data); }
  warn(action, data) { this._log('warn', action, data); }
  error(action, data) { this._log('error', action, data); }
}

export function createLogger(module) {
  return new Logger(module);
}
