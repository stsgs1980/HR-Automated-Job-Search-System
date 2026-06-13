/**
 * PARSER: VACANCY DETAIL — Orchestrator
 * ========================================
 * Parses a single vacancy detail page (/vacancy/{id}).
 * Thin orchestrator — delegates to focused modules:
 *   - vacancy-detail-skills.js  — multi-strategy skill extraction
 *   - vacancy-detail-parsers.js — salary, experience, description
 *
 * v1.9.19.0
 */

import { findElement } from '../lib/selectors.js';
import { safeGetText, safeGetAttr, createLogger } from '../lib/anti-hallucination.js';
import { parseKeySkills } from './vacancy-detail-skills.js';
import { parseSalary, parseExperience, parseDescription } from './vacancy-detail-parsers.js';

const vacLog = createLogger('VacDetail');

/**
 * Parse the current vacancy detail page.
 * Returns a structured vacancy object or null on failure.
 */
export function parseVacancyDetail() {
  const t0 = performance.now();
  const path = window.location.pathname;
  const idMatch = path.match(/\/vacancy\/(\d+)/);
  if (!idMatch) {
    vacLog.warn('Not a vacancy page: ' + path);
    return null;
  }

  const vacancy = {
    id: idMatch[1],
    url: window.location.href.split('?')[0].split('#')[0],
    title: '',
    company: '',
    companyUrl: '',
    salary: { raw: '', min: null, max: null, currency: 'RUB', period: 'month', net: true },
    location: '',
    experience: { raw: '', min: null, max: null },
    employment: '',
    schedule: '',
    keySkills: [],
    derivedSkills: [],
    _skillsSource: 'none',
    description: { text: '', html: '', headings: [], sections: {} },
    hiringFormat: '',
    isRemote: false,
    hasApplyButton: false,
    parsedAt: new Date().toISOString(),
    source: 'detail',
  };

  // Title
  const titleEl = findElement('vacancyTitleOnPage');
  vacancy.title = safeGetText(titleEl, '').trim();
  if (!vacancy.title) {
    const h1 = document.querySelector('h1');
    if (h1) vacancy.title = (h1.textContent || '').trim();
  }

  // Company
  const companyEl = findElement('vacancyCompanyOnPage');
  vacancy.company = safeGetText(companyEl, '').trim();
  vacancy.companyUrl = companyEl ? safeGetAttr(companyEl, 'href', '') : '';

  // Salary
  parseSalary(vacancy);

  // Location
  const addrEl = document.querySelector('[data-qa="vacancy-address-with-map"], [data-qa="vacancy-view-raw-address"]');
  if (addrEl) {
    vacancy.location = (addrEl.textContent || '').trim().replace(/\s+/g, ' ');
  }

  // Experience
  parseExperience(vacancy);

  // Employment type
  const empEl = document.querySelector('[data-qa="common-employment-text"], [data-qa*="employment"]');
  if (empEl) vacancy.employment = (empEl.textContent || '').trim();

  // Schedule
  const schedEl = document.querySelector('[data-qa="work-schedule-by-days-text"], [data-qa*="work-schedule"], [data-qa*="schedule"]');
  if (schedEl) vacancy.schedule = (schedEl.textContent || '').trim();

  // Remote
  vacancy.isRemote = !!document.querySelector('[data-qa="vacancy-label-work-schedule-remote"]');

  // Description (parse BEFORE skills — description text is used for skill derivation)
  parseDescription(vacancy);

  // Key Skills (delegated to vacancy-detail-skills.js)
  parseKeySkills(vacancy);

  // Hiring format
  const hireEl = document.querySelector('[data-qa="vacancy-hiring-formats"]');
  if (hireEl) vacancy.hiringFormat = (hireEl.textContent || '').trim().replace(/\s+/g, ' ');

  // Apply button
  vacancy.hasApplyButton = findElement('vacancyApplyButton') !== null;

  // Validate
  if (!vacancy.title) {
    vacLog.warn('No title found — page may not be loaded');
    return null;
  }

  const elapsed = (performance.now() - t0).toFixed(1);
  vacLog.info('Parsed vacancy "' + vacancy.title.substring(0, 40) + '" in ' + elapsed + 'ms');
  vacLog.info('Skills: ' + vacancy.keySkills.length + ' (source: ' + vacancy._skillsSource + ')' +
    ' | Derived: ' + vacancy.derivedSkills.length +
    ' | Desc: ' + vacancy.description.text.length + ' chars');

  return vacancy;
}
