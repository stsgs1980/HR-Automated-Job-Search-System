/**
 * Main Content Script Entry Point
 * =================================
 * Загружается на всех hh.ru страницах, определяет тип страницы
 * и запускает соответствующую логику.
 *
 * Страницы:
 * - /search/vacancy* → Parser + Panel + Auto-apply
 * - /vacancy/* → Continue pending apply + Vacancy detail parser
 * - /applicant/negotiations* → Negotiation tracker
 * - /applicant/resumes* → Resume parser
 *
 * МЕТОДИКА ЗАГРУЗКИ:
 * - manifest.json content_scripts загружает все JS в document_idle
 * - Этот файл — orchestrator, не содержит логики
 * - Инициализация через DOMContentLoaded (хотя manifest run_at=document_idle)
 * - Chrome extension API доступен через chrome.storage, chrome.runtime
 */

import { createLogger } from '../lib/anti-hallucination.js';
import { checkDailyReset } from '../lib/storage.js';
import { parseVacanciesFromPage, parseVacancyDetailPage } from './parser.js';
import { createPanel, togglePanel, updateVacancies, updateStats } from './panel.js';
import { applyToVacancy, continueApply, applyToAll } from './auto-respond.js';

const log = createLogger('Main');

// ─── Init ─────────────────────────────────────

async function init() {
  log.info('Content script loaded', {
    url: window.location.href,
    timestamp: new Date().toISOString()
  });

  // Daily reset counters
  await checkDailyReset();

  // Определяем тип страницы
  const pageType = detectPageType();
  log.info(`Page type: ${pageType}`);

  switch (pageType) {
    case 'search':
      await initSearchPage();
      break;

    case 'vacancy':
      await initVacancyPage();
      break;

    case 'negotiations':
      // Placeholder for future negotiation tracking
      log.info('Negotiations page detected (tracking not yet implemented)');
      break;

    case 'resumes':
      log.info('Resumes page detected (parsing not yet implemented)');
      break;

    default:
      log.info('Page type not handled');
  }

  // Create panel toggle button (доступен на любой странице)
  createPanel();
}

// ─── Search Page ───────────────────────────────

async function initSearchPage() {
  // Парсим вакансии
  const vacancies = await parseVacanciesFromPage();
  updateVacancies(vacancies);

  // Обновляем статистику в панели
  const { stats } = await chrome.storage.local.get('stats');
  if (stats) {
    updateStats(stats);
  }

  // Слушаем custom events от панели
  window.addEventListener('hh-ar-apply', async (e) => {
    const { vacancyId } = e.detail;
    await applyToVacancy(vacancyId);
  });

  window.addEventListener('hh-ar-apply-all', async () => {
    const settings = await chrome.storage.local.get('settings');
    const minScore = settings.settings?.minMatchScore || 60;
    await applyToAll(vacancies, minScore);
  });

  // Отслеживаем пагинацию (SPA navigation на hh.ru)
  observeNavigation();
}

// ─── Vacancy Detail Page ───────────────────────

async function initVacancyPage() {
  // Проверяем есть ли pending apply
  const { pendingApply } = await chrome.storage.local.get('pendingApply');
  if (pendingApply && pendingApply.vacancyId) {
    // Проверяем что pendingApply не устарел (> 2 минуты)
    const age = Date.now() - (pendingApply.timestamp || 0);
    if (age < 120000) {
      log.info('Found pending apply, continuing...', pendingApply);
      await chrome.storage.local.remove('pendingApply');
      await continueApply(pendingApply);
    } else {
      log.warn('Pending apply expired', { age: age / 1000 });
      await chrome.storage.local.remove('pendingApply');
    }
  }

  // Парсим детали вакансии
  const detail = parseVacancyDetailPage();
  if (detail) {
    log.info('Vacancy detail parsed', { title: detail.title, company: detail.company });
    // Можно использовать для AI cover letter generation
    await chrome.storage.local.set({ lastVacancyDetail: detail });
  }
}

// ─── SPA Navigation Observer ───────────────────

/**
 * hh.ru — SPA (React). Пагинация обновляет DOM без перезагрузки.
 * MutationObserver отслеживает изменения и ре-парсит вакансии.
 *
 * ANTI-HALLUCINATION: debounce чтобы не парсить при каждом tiny DOM change.
 */
function observeNavigation() {
  let debounceTimer = null;

  const observer = new MutationObserver((mutations) => {
    // Быстрая проверка: изменились ли карточки вакансий?
    let relevantChange = false;
    for (const m of mutations) {
      if (m.type === 'childList' && m.target.closest?.('[data-qa="vacancy-serp__vacancy"]')) {
        relevantChange = true;
        break;
      }
      // Проверяем pager clicks
      if (m.type === 'childList' && m.target.closest?.('[data-qa="pager-next"]')) {
        relevantChange = true;
        break;
      }
    }

    if (!relevantChange) return;

    // Debounce: ждём 1 секунду после последнего изменения
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      log.info('SPA navigation detected, re-parsing...');
      const vacancies = await parseVacanciesFromPage();
      updateVacancies(vacancies);
    }, 1000);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  log.info('SPA navigation observer active');
}

// ─── Page Type Detection ──────────────────────

/**
 * Определяет тип страницы по URL.
 * ANTI-HALLUCINATION: проверяем full pathname, не ищем подстроки.
 */
function detectPageType() {
  const path = window.location.pathname;

  if (path.startsWith('/search/vacancy')) return 'search';
  if (/^\/vacancy\/\d+/.test(path)) return 'vacancy';
  if (path.startsWith('/applicant/negotiations')) return 'negotiations';
  if (path.startsWith('/applicant/resumes')) return 'resumes';

  return 'unknown';
}

// ─── Boot ──────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
