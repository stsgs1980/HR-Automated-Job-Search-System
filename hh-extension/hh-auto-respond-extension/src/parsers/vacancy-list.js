/**
 * PARSER: VACANCY LIST
 * ======================
 * Parses vacancy cards from hh.ru search results page (/search/vacancy)
 * and main page (/) recommended vacancies + "Vacancy of the Day".
 * Computes match score if active resume is available.
 */

import { findAllElements, findElement } from '../lib/selectors.js';
import { safeGetText, safeGetAttr, extractVacancyId, validateVacancyData, createLogger } from '../lib/anti-hallucination.js';
import { getBlacklistedCompanies, getAppliedVacancies } from '../lib/storage.js';
import { computeMatchScore } from '../lib/match-scorer.js';
import { parseExperienceString } from '../lib/parse-experience.js';

const parserLog = createLogger('Parser');

/**
 * Find title link element within a vacancy card.
 * Tries standard data-qa selectors first, then falls back to any <a>
 * linking to /vacancy/ (needed on main page where data-qa may differ).
 */
function findTitleLink(card) {
  // Standard selectors: data-qa="serp-item__title" or "vacancy-serp__vacancy-title"
  const titleEl = findElement('vacancyTitleLink', card);
  if (titleEl) return titleEl;

  // Fallback: find any <a> inside card that links to a vacancy detail page
  const links = card.querySelectorAll('a[href*="/vacancy/"]');
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    if (/\/vacancy\/\d+/.test(href)) return link;
  }

  return null;
}

/**
 * Parse vacancy cards from search results or main page.
 * @param {Object|null} resume — active resume for match scoring (optional)
 * @returns {Promise<Object[]>}
 */
export async function parseVacanciesFromPage(resume) {
  const cards = findAllElements('vacancyCard');
  parserLog.info('Found ' + cards.length + ' vacancy cards');
  if (cards.length === 0) return [];

  const vacancies = [];
  let appliedIds = [], blacklisted = [];
  try {
    appliedIds = await getAppliedVacancies();
    blacklisted = await getBlacklistedCompanies();
  } catch (e) {}

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const titleEl = findTitleLink(card);
    const title = safeGetText(titleEl);
    if (!title) continue;
    const url = safeGetAttr(titleEl, 'href', '');
    const id = extractVacancyId(url.startsWith('/') ? 'https://hh.ru' + url : url);
    if (!id) continue;

    const company = safeGetText(findElement('vacancyCompany', card));
    const salary = safeGetText(findElement('vacancySalary', card), '');
    const location = safeGetText(findElement('vacancyLocation', card), '');
    const experience = safeGetText(findElement('vacancyExperience', card), '');

    const tagEls = card.querySelectorAll('.bloko-tag__text, [data-qa="bloko-tag"]');
    const skills = [];
    tagEls.forEach(el => { const t = (el.textContent || '').trim(); if (t && t.length < 50) skills.push(t); });

    const replyBtn = findElement('replyButton', card);
    const hasReply = replyBtn !== null;

    const vacancy = {
      id, title: title.trim(), company: (company || '').trim(),
      salary: salary || 'Не указана', location: (location || '').trim(),
      experience: parseExperienceString((experience || '').trim()), skills,
      url: url.startsWith('/') ? 'https://hh.ru' + url : url,
      hasReply, status: 'new', parsedAt: new Date().toISOString(),
      matchScore: null
    };

    const validation = validateVacancyData(vacancy);
    if (!validation.valid) { parserLog.warn('Card #' + i + ' invalid: ' + validation.errors.join(', ')); continue; }

    if (appliedIds.includes(vacancy.id)) vacancy.status = 'applied';
    if (blacklisted.includes(vacancy.company)) vacancy.status = 'blacklisted';

    // Compute match score if resume available
    if (resume) {
      try {
        const score = computeMatchScore(resume, vacancy);
        vacancy.matchScore = score.total;
      } catch (e) {}
    }

    vacancies.push(vacancy);
  }

  // Sort by match score (highest first), new vacancies before applied/blacklisted
  vacancies.sort((a, b) => {
    const scoreA = a.matchScore != null ? a.matchScore : -1;
    const scoreB = b.matchScore != null ? b.matchScore : -1;
    if (scoreB !== scoreA) return scoreB - scoreA;
    if (a.status === 'new' && b.status !== 'new') return -1;
    if (b.status === 'new' && a.status !== 'new') return 1;
    return 0;
  });

  parserLog.info('Parsed ' + vacancies.length + '/' + cards.length + ' valid vacancies');
  return vacancies;
}

/**
 * Parse "Vacancy of the Day" cards from hh.ru main page.
 * These have a different DOM structure: title, compensation, company are siblings,
 * not nested inside a single card container.
 *
 * @param {Object|null} resume — active resume for match scoring (optional)
 * @returns {Promise<Object[]>}
 */
export async function parseVacanciesOfTheDay(resume) {
  const titleEls = findAllElements('vacancyOfTheDayTitle');
  parserLog.info('Found ' + titleEls.length + ' "Vacancy of the Day" items');
  if (titleEls.length === 0) return [];

  const vacancies = [];
  let appliedIds = [], blacklisted = [];
  try {
    appliedIds = await getAppliedVacancies();
    blacklisted = await getBlacklistedCompanies();
  } catch (e) {}

  for (let i = 0; i < titleEls.length; i++) {
    const titleEl = titleEls[i];
    const title = (titleEl.textContent || '').trim();
    if (!title) continue;

    // Walk up to find the common parent container for this "vacancy of the day" block
    // The title, compensation, and company are typically siblings inside a wrapper
    const container = titleEl.closest('div[class]') || titleEl.parentElement;
    if (!container) continue;

    // Try to find compensation and company near the title
    const compEl = container.querySelector('[data-qa="vacancy_of_the_day_compensation"]')
      || container.parentElement?.querySelector('[data-qa="vacancy_of_the_day_compensation"]');
    const compEl2 = compEl || titleEl.parentElement?.querySelector('[data-qa="vacancy_of_the_day_compensation"]');

    const companyEl = container.querySelector('[data-qa="vacancy_of_the_day_company"]')
      || container.parentElement?.querySelector('[data-qa="vacancy_of_the_day_company"]');
    const companyEl2 = companyEl || titleEl.parentElement?.querySelector('[data-qa="vacancy_of_the_day_company"]');

    const salary = compEl2 ? (compEl2.textContent || '').trim() : 'Не указана';
    const company = companyEl2 ? (companyEl2.textContent || '').trim() : '';

    // Try to find the apply link to extract vacancy URL/ID
    const replyEl = container.querySelector('[data-qa="vacancy-response-link-top-again"]')
      || container.parentElement?.querySelector('[data-qa="vacancy-response-link-top-again"]');
    const replyLink = replyEl?.closest('a') || replyEl;
    const url = safeGetAttr(replyLink, 'href', '') || '';
    const id = extractVacancyId(url.startsWith('/') ? 'https://hh.ru' + url : url);

    // If we can't extract ID from reply link, try to find any vacancy link nearby
    const vacancyId = id || (() => {
      const parentBlock = titleEl.closest('[class*="vacancy-of-the-day"]')
        || titleEl.closest('section') || container.parentElement;
      if (!parentBlock) return '';
      const link = parentBlock.querySelector('a[href*="/vacancy/"]');
      if (!link) return '';
      const href = link.getAttribute('href') || '';
      return extractVacancyId(href.startsWith('/') ? 'https://hh.ru' + href : href) || '';
    })();

    if (!vacancyId) {
      parserLog.warn('VotD #' + i + ': could not extract vacancy ID — skipping');
      continue;
    }

    const vacancy = {
      id: vacancyId, title, company,
      salary: salary || 'Не указана', location: '',
      experience: '', skills: [],
      url: url.startsWith('/') ? 'https://hh.ru' + url : url || 'https://hh.ru/vacancy/' + vacancyId,
      hasReply: !!replyEl, status: 'new', source: 'votd',
      parsedAt: new Date().toISOString(), matchScore: null
    };

    if (appliedIds.includes(vacancy.id)) vacancy.status = 'applied';
    if (blacklisted.includes(vacancy.company)) vacancy.status = 'blacklisted';

    if (resume) {
      try {
        const score = computeMatchScore(resume, vacancy);
        vacancy.matchScore = score.total;
      } catch (e) {}
    }

    vacancies.push(vacancy);
  }

  parserLog.info('Parsed ' + vacancies.length + '/' + titleEls.length + ' "Vacancy of the Day" items');
  return vacancies;
}
