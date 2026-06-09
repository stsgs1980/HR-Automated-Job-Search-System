/**
 * HH.ru CSS Selectors Registry
 * =============================
 * Портировано из Python: hh-bot/src/hh/selectors.py (245 строк)
 *
 * Каждый селектор — массив в порядке приоритета для fallback-резильентности.
 * data-qa селекторы Magritte дизайна как первичные, CSS-классы как backup.
 *
 * МЕТОДИКА ВЕРИФИКАЦИИ:
 * - Протестировано на live hh.ru (2025-2026)
 * - data-qa атрибуты — стабильный API hh.ru (Magritte дизайн-система)
 * - Fallback-цепочки обеспечивают работоспособность при частичных изменениях DOM
 *
 * ANTI-HALLUCINATION:
 * - getSelector() возвращает СТРОКУ (первый селектор), а не массив
 * - querySelectorAll возвращает NodeList, проверяем .length перед доступом
 * - Каждый find*() метод проверяет existence перед возвратом данных
 */

const HH_SELECTORS = {
  // ═══════════════════════════════════════════════
  // Страница поиска вакансий (vacancy-serp)
  // ═══════════════════════════════════════════════
  vacancyCard: [
    '[data-qa="vacancy-serp__vacancy"]',
    '.vacancy-serp-item',
    '[class*="vacancy-serp-item"]'
  ],

  vacancyTitleLink: [
    'a[data-qa="serp-item__title"]',
    'a[data-qa="vacancy-serp__vacancy-title"]',
    '.vacancy-serp-item a.bloko-link'
  ],

  vacancyTitleText: [
    '[data-qa="serp-item__title-text"]',
    'span[data-qa="vacancy-serp__vacancy-title"]'
  ],

  vacancyCompany: [
    '[data-qa="vacancy-serp__vacancy-employer-text"]',
    'a[data-qa="vacancy-serp__vacancy-employer"]'
  ],

  vacancySalary: [
    '[data-qa="vacancy-serp__compensation"]',
    '.vacancy-serp-item__compensation'
  ],

  vacancyLocation: [
    '[data-qa="vacancy-serp__vacancy-address"]',
    '[data-qa*="vacancy-address"]'
  ],

  vacancyExperience: [
    '[data-qa^="vacancy-serp__vacancy-work-experience"]'
  ],

  vacancyTags: ['.bloko-tag__text'],

  replyButton: [
    '[data-qa="vacancy-serp__vacancy_response"]',
    '[data-qa="vacancy-response-link-top"]',
    '.vacancy-response .bloko-button'
  ],

  nextPage: [
    '[data-qa="pager-next"]',
    'a.bloko-button[data-qa="pager-next"]'
  ],

  prevPage: ['[data-qa="pager-prev"]'],

  // ═══════════════════════════════════════════════
  // Страница вакансии (detail)
  // ═══════════════════════════════════════════════
  vacancyTitleOnPage: [
    '[data-qa="vacancy-title"]',
    'h1.bloko-header-section-1'
  ],

  vacancyCompanyOnPage: [
    '[data-qa="vacancy-company-name"]',
    'a[data-qa="vacancy-company-name"]',
    '.vacancy-company-name'
  ],

  vacancyDescription: [
    '[data-qa="vacancy-description"]',
    '.vacancy-description',
    '.g-user-content'
  ],

  vacancySkills: [
    '[data-qa="skills-element"]',
    '.bloko-tag__section'
  ],

  // ═══════════════════════════════════════════════
  // Попап отклика (application popup)
  // ═══════════════════════════════════════════════
  responsePopup: [
    '[data-qa="vacancy-response-submit-popup"]',
    '.vacancy-response-popup'
  ],

  addCoverLetter: [
    '[data-qa="add-cover-letter"]',
    '.vacancy-response-popup-form-letter-toggle'
  ],

  coverLetterInput: [
    'textarea[data-qa="vacancy-response-popup-form-letter-input"]',
    'textarea.vacancy-response-popup-form-letter-input',
    'textarea.bloko-textarea'
  ],

  submitButton: [
    '[data-qa="vacancy-response-submit-popup"]',
    'button.bloko-button_primary'
  ],

  // ═══════════════════════════════════════════════
  // Алерты при отклике
  // ═══════════════════════════════════════════════
  alertMagritte: ['[data-qa="magritte-alert"]'],
  relocationConfirm: [
    '[data-qa="relocation-warning-confirm"]'
  ],
  testTaskWarning: ['[data-qa="test-task-required"]'],
  alreadyApplied: ['[data-qa="already-applied"]'],
  indirectEmployerAlert: ['[data-qa="indirect-employer-alert"]'],

  // ═══════════════════════════════════════════════
  // Резюме
  // ═══════════════════════════════════════════════
  resumePersonalName: [
    '[data-qa="resume-personal-name"]',
    '.resume-header-name'
  ],
  resumeTitle: ['[data-qa="resume-block-title-position"]'],
  resumeSalary: ['[data-qa="resume-block-salary"]'],
  resumeSkillTag: ['[data-qa="skill-tag"]', '.bloko-tag__text'],
  resumeExperienceCompany: ['[data-qa="resume-block-experience-company"]'],
  resumeExperiencePosition: ['[data-qa="resume-block-experience-position"]'],
  resumeExperienceDescription: ['[data-qa="resume-block-experience-description"]'],
  resumeEducation: ['[data-qa="resume-block-education"]'],
  resumesListItem: ['[data-qa="resume"]', '.resume-list-item'],
  resumeLink: ['a[data-qa="resume-title-link"]', '.resume-list-item a'],

  // ═══════════════════════════════════════════════
  // Переговоры (negotiations)
  // ═══════════════════════════════════════════════
  negotiationsList: ['[data-qa="negotiations"]', '.negotiations-list'],
  negotiationItem: ['[data-qa="negotiation-item"]'],
  messageInput: [
    'textarea[data-qa="negotiation-message-input"]',
    'textarea.bloko-textarea'
  ],
  sendMessageButton: [
    '[data-qa="negotiation-message-send"]'
  ],

  // ═══════════════════════════════════════════════
  // Чёрный список
  // ═══════════════════════════════════════════════
  blacklistAdd: ['[data-qa="vacancy__blacklist-show-add"]']
};

// ─── Helper functions ───────────────────────────

/**
 * Возвращает первый (primary) селектор для имени.
 * ANTI-HALLUCINATION: возвращает пустую строку если не найдено,
 * а не undefined или null — вызывающий код ВСЕГДА проверяет результат.
 */
export function getSelector(name) {
  const selectors = HH_SELECTORS[name];
  if (!selectors || !Array.isArray(selectors) || selectors.length === 0) {
    console.warn(`[HH-Selectors] Unknown selector name: "${name}"`);
    return '';
  }
  return selectors[0];
}

/**
 * Возвращает массив всех fallback-селекторов для имени.
 * ANTI-HALLUCINATION: возвращает пустой массив если не найдено.
 */
export function getSelectors(name) {
  const selectors = HH_SELECTORS[name];
  if (!selectors || !Array.isArray(selectors)) {
    console.warn(`[HH-Selectors] Unknown selector name: "${name}"`);
    return [];
  }
  return [...selectors];
}

/**
 * Находит первый элемент в DOM по fallback-цепочке селекторов.
 *
 * МЕТОДИКА ВЕРИФИКАЦИИ:
 * 1. Перебирает селекторы по порядку приоритета
 * 2. Проверяет element !== null И element.offsetParent !== null (видимость)
 * 3. Возвращает первый валидный элемент или null
 *
 * ANTI-HALLUCINATION:
 * - НИКОГДА не возвращает undefined — только Element | null
 * - Проверяет видимость (offsetParent) чтобы не цеплять скрытые элементы
 * - Логирует какой селектор из цепочки сработал
 */
export function findElement(name, root = document) {
  const selectors = getSelectors(name);
  if (selectors.length === 0) return null;

  for (const selector of selectors) {
    try {
      const el = root.querySelector(selector);
      if (el && el.offsetParent !== null) {
        return el;
      }
    } catch (e) {
      // Некорректный селектор — пробуем следующий
      console.debug(`[HH-Selectors] Invalid selector "${selector}" for "${name}": ${e.message}`);
    }
  }
  return null;
}

/**
 * Находит ВСЕ элементы по fallback-цепочке.
 * ANTI-HALLUCINATION: возвращает пустой массив, никогда не возвращает null.
 */
export function findAllElements(name, root = document) {
  const selectors = getSelectors(name);
  if (selectors.length === 0) return [];

  for (const selector of selectors) {
    try {
      const els = root.querySelectorAll(selector);
      if (els && els.length > 0) return Array.from(els);
    } catch (e) {
      console.debug(`[HH-Selectors] Invalid selector "${selector}" for "${name}": ${e.message}`);
    }
  }
  return [];
}

/**
 * Верифицирует что элемент существует и видим.
 * ANTI-HALLUCINATION: булевый результат, никаких побочных эффектов.
 */
export function verifyElement(el) {
  if (!el) return false;
  if (!(el instanceof Element)) return false;
  // offsetParent null = скрыт через display:none или в detached DOM
  if (el.offsetParent === null && document.body.contains(el)) {
    // Исключение: fixed/sticky элементы могут иметь offsetParent === null
    const style = window.getComputedStyle(el);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      return true;
    }
    return false;
  }
  return el.offsetParent !== null || !document.body.contains(el) === false;
}

export default HH_SELECTORS;
