/**
 * PARSER: VACANCY LIST
 * ======================
 * Parses vacancy cards from hh.ru search results page (/search/vacancy).
 * Computes match score if active resume is available.
 */

import { findAllElements, findElement } from '../lib/selectors.js';
import { safeGetText, safeGetAttr, extractVacancyId, validateVacancyData, createLogger } from '../lib/anti-hallucination.js';
import { getBlacklistedCompanies, getAppliedVacancies } from '../lib/storage.js';
import { computeMatchScore } from '../lib/match-scorer.js';

const parserLog = createLogger('Parser');

/**
 * Parse vacancy cards from search results page.
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
    const titleEl = findElement('vacancyTitleLink', card);
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
 * Parse experience requirement string into structured format.
 * Input:  "1–3 года", "Более 6 лет", "Нет опыта", "3 года"
 * Output: { raw: "1–3 года", min: 1, max: 3 }
 */
function parseExperienceString(raw) {
  if (!raw) return { raw: '', min: null, max: null };

  const text = raw.toLowerCase().trim();

  // "Нет опыта" / "Не требуется" / "Без опыта"
  if (/нет\s*опыт|не\s*требу|без\s*опыт/.test(text)) {
    return { raw, min: 0, max: 0 };
  }

  // "Более N лет" / "От N лет" / "Свыше N лет"
  const moreMatch = text.match(/(?:более|от|свыше)\s+(\d+)/);
  if (moreMatch) {
    return { raw, min: parseInt(moreMatch[1], 10), max: null };
  }

  // "N–M лет" / "N-M лет" / "N — M лет" (range)
  const rangeMatch = text.match(/(\d+)\s*[–—\-\s]+\s*(\d+)/);
  if (rangeMatch) {
    return { raw, min: parseInt(rangeMatch[1], 10), max: parseInt(rangeMatch[2], 10) };
  }

  // "N лет" / "N год" (exact)
  const exactMatch = text.match(/(\d+)\s*(?:год|лет)/);
  if (exactMatch) {
    return { raw, min: parseInt(exactMatch[1], 10), max: null };
  }

  // Couldn't parse — return raw string for scorer fallback
  return { raw, min: null, max: null };
}
