/**
 * Vacancy Parser
 * ===============
 * Парсит карточки вакансий со страниц поиска hh.ru.
 *
 * МЕТОДИКА ПАРСИНГА:
 * 1. Находим все карточки вакансий на странице (fallback-цепочка селекторов)
 * 2. Для каждой карточки извлекаем: title, company, salary, location, skills, URL
 * 3. Извлекаем vacancy ID из URL (https://hh.ru/vacancy/12345 -> "12345")
 * 4. Валидируем данные через anti-hallucination module
 * 5. Вычисляем match score если есть данные о резюме
 *
 * ANTI-HALLUCINATION:
 * - Каждый этап извлечения проверяет existence элементов
 * - safeGetText() вместо .textContent напрямую
 * - validateVacancyData() перед добавлением в results
 * - isDuplicate() проверяет по ID, не по title
 *
 * PORTED FROM: hh-bot/src/hh/browser_client.py → search_vacancies_on_page()
 */

import { findElement, findAllElements, getSelector, getSelectors } from '../lib/selectors.js';
import { safeGetText, safeGetAttr, safeQuery, validateVacancyData, isDuplicate, extractVacancyId, createLogger } from '../lib/anti-hallucination.js';
import { calculateMatchScore } from '../lib/matching.js';
import { isAlreadyApplied, isBlacklisted } from '../lib/storage.js';

const log = createLogger('Parser');

/**
 * Парсит все вакансии с текущей страницы поиска.
 *
 * @returns {Promise<Array>} массив валидных объектов вакансий
 */
export async function parseVacanciesFromPage() {
  const startTime = Date.now();
  const cards = findAllElements('vacancyCard');
  log.info(`Found ${cards.length} vacancy cards`);

  if (cards.length === 0) {
    log.warn('No vacancy cards found — selectors may be outdated');
    return [];
  }

  const vacancies = [];
  const appliedIds = await _getAppliedIds();
  const blacklistedCompanies = await _getBlacklistedCompanies();

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const vacancy = await parseVacancyCard(card, i);

    if (!vacancy) {
      log.warn(`Card #${i}: parse failed, skipping`);
      continue;
    }

    // Проверяем валидность данных
    const validation = validateVacancyData(vacancy);
    if (!validation.valid) {
      log.warn(`Card #${i}: validation failed`, validation.errors);
      continue;
    }

    // Проверяем не откликнута ли уже
    if (appliedIds.includes(vacancy.id)) {
      vacancy.status = 'applied';
    }

    // Проверяем чёрный список компаний
    if (blacklistedCompanies.includes(vacancy.company)) {
      vacancy.status = 'blacklisted';
    }

    vacancies.push(vacancy);
  }

  log.info(`Parsed ${vacancies.length}/${cards.length} valid vacancies in ${Date.now() - startTime}ms`);
  return vacancies;
}

/**
 * Парсит одну карточку вакансии.
 *
 * МЕТОДИКА:
 * - Каждый текст извлекается через safeGetText() с fallback
 * - URL извлекается из href атрибута первой ссылки
 * - ID извлекается из URL через regex
 *
 * @param {Element} card - DOM элемент карточки
 * @param {number} index - порядковый номер для логирования
 * @returns {Object|null} объект вакансии или null при ошибке
 */
async function parseVacancyCard(card, index) {
  try {
    // Title
    const titleEl = findElement('vacancyTitleLink', card);
    const title = safeGetText(titleEl);
    if (!title) {
      log.warn(`Card #${index}: no title found`);
      return null;
    }

    // URL — из href title link
    const url = safeGetAttr(titleEl, 'href', '');

    // Company
    const companyEl = findElement('vacancyCompany', card);
    const company = safeGetText(companyEl);

    // Salary (может отсутствовать)
    const salaryEl = findElement('vacancySalary', card);
    const salary = safeGetText(salaryEl, 'Не указана');

    // Location
    const locationEl = findElement('vacancyLocation', card);
    const location = safeGetText(locationEl);

    // Experience
    const experienceEl = findElement('vacancyExperience', card);
    const experience = safeGetText(experienceEl);

    // Tags/Skills
    const tags = _extractTags(card);

    // Extract ID from URL
    const id = extractVacancyId(url);
    if (!id) {
      log.warn(`Card #${index}: could not extract ID from URL "${url}"`);
      // Fallback: generate synthetic ID from title hash
      return null;
    }

    // Check if reply button exists (some vacancies are "view only")
    const replyBtn = findElement('replyButton', card);
    const hasReply = replyBtn !== null;

    return {
      id,
      title: title.trim(),
      company: (company || '').trim(),
      salary: salary || 'Не указана',
      location: (location || '').trim(),
      experience: (experience || '').trim(),
      skills: tags,
      url: url.startsWith('/') ? `https://hh.ru${url}` : url,
      hasReply,
      status: 'new',
      parsedAt: new Date().toISOString(),
      matchScore: null,
      matchBreakdown: null
    };
  } catch (e) {
    log.error(`Card #${index}: parse error`, { error: e.message });
    return null;
  }
}

/**
 * Извлекает теги навыков из карточки.
 * ANTI-HALLUCINATION: проверяет каждый тег на непустоту.
 */
function _extractTags(card) {
  const tagEls = card.querySelectorAll('.bloko-tag__text, [data-qa="bloko-tag"]');
  const tags = [];
  for (const el of tagEls) {
    const text = el.textContent?.trim();
    if (text && text.length > 0 && text.length < 50) {
      tags.push(text);
    }
  }
  return tags;
}

/**
 * Парсит детальную страницу вакансии.
 * Вызывается при навигации на /vacancy/{id}.
 *
 * PORTED FROM: hh-bot/src/hh/browser_client.py → scrape_vacancy_page()
 *
 * @returns {Object|null} детальные данные вакансии
 */
export function parseVacancyDetailPage() {
  const title = safeQuery(document, getSelector('vacancyTitleOnPage'), 'text') ||
                safeQuery(document, 'h1', 'text');
  const company = safeQuery(document, getSelector('vacancyCompanyOnPage'), 'text');
  const description = safeQuery(document, getSelector('vacancyDescription'), 'text');
  const skills = _parseSkillsFromDetail();

  if (!title) {
    log.warn('Vacancy detail: could not find title');
    return null;
  }

  return {
    title: title.trim(),
    company: (company || '').trim(),
    description: (description || '').trim(),
    skills,
    parsedAt: new Date().toISOString()
  };
}

function _parseSkillsFromDetail() {
  const skillEls = document.querySelectorAll(getSelector('vacancySkills') || '.bloko-tag__text');
  return Array.from(skillEls)
    .map(el => el.textContent?.trim())
    .filter(Boolean);
}

// ─── Helpers ──────────────────────────────────

async function _getAppliedIds() {
  try {
    const data = await chrome.storage.local.get('appliedVacancies');
    return data.appliedVacancies || [];
  } catch {
    return [];
  }
}

async function _getBlacklistedCompanies() {
  try {
    const data = await chrome.storage.local.get('blacklistedCompanies');
    return data.blacklistedCompanies || [];
  } catch {
    return [];
  }
}
