/**
 * Main Content Script Entry Point
 * =================================
 *
 * Boot sequence:
 * 1. createPanel() → FAB + sidebar + auth check
 * 2. Auth check passes → initPageLogic()
 * 3. Page logic depends on page type:
 *    - /search/vacancy → parser + vacancy list + auto-apply
 *    - /vacancy/* → continue pending apply + detail parse
 *    - /applicant/* → future: resume parse, negotiation tracking
 *
 * AUTH GATE:
 * Вся функциональность (парсинг, отклик) активируется ТОЛЬКО
 * после успешного auth check. Если пользователь не залогинен —
 * sidebar показывает блок "Войдите на hh.ru".
 */

import { createLogger } from '../lib/anti-hallucination.js';
import { checkDailyReset } from '../lib/storage.js';
import { parseVacanciesFromPage, parseVacancyDetailPage } from './parser.js';
import { createPanel, togglePanel, updateVacancies, updateStats } from './panel.js';
import { applyToVacancy, continueApply, applyToAll } from './auto-respond.js';

const log = createLogger('Main');

let pageInitialized = false;

// ─── Init ─────────────────────────────────────

async function init() {
  log.info('Content script loaded', {
    url: window.location.href,
    ts: new Date().toISOString()
  });

  await checkDailyReset();

  // 1. Создаём FAB + sidebar (запускает auth check внутри)
  createPanel();

  // 2. Слушаем auth state changes
  window.addEventListener('hh-ar-auth-changed', (e) => {
    const { isLoggedIn } = e.detail;
    if (isLoggedIn && !pageInitialized) {
      log.info('Auth passed, initializing page logic');
      pageInitialized = true;
      initPageLogic();
    } else if (!isLoggedIn && pageInitialized) {
      log.info('Auth lost, disabling page logic');
      pageInitialized = false;
    }
  });

  // 3. Polling для первого auth check
  _pollAuth();
}

/**
 * Проверяем auth каждые 2 секунды до первого успеха.
 * После — интервал передаётся panel.js (каждые 5 сек).
 */
function _pollAuth() {
  const check = document.querySelector('[data-qa="mainmenu_applicant"]')
    || document.querySelector('[data-qa="mainmenu_user_name"]');

  if (check && check.offsetParent !== null) {
    log.info('User is logged in, initializing');
    window.dispatchEvent(new CustomEvent('hh-ar-auth-changed', {
      detail: { isLoggedIn: true }
    }));
    return;
  }

  setTimeout(_pollAuth, 2000);
}

// ─── Page Logic (auth-gated) ──────────────────

function initPageLogic() {
  const pageType = detectPageType();
  log.info(`Initializing page logic for: ${pageType}`);

  switch (pageType) {
    case 'search':
      initSearchPage();
      break;
    case 'vacancy':
      initVacancyPage();
      break;
    case 'resumes':
      log.info('Resume page (parsing not yet implemented)');
      break;
    default:
      log.info('Page type not handled');
  }
}

// ─── Search Page ───────────────────────────────

async function initSearchPage() {
  const vacancies = await parseVacanciesFromPage();
  updateVacancies(vacancies);

  const { stats } = await chrome.storage.local.get('stats');
  if (stats) updateStats(stats);

  // Слушаем события от panel
  window.addEventListener('hh-ar-apply', async (e) => {
    const { vacancyId } = e.detail;
    await applyToVacancy(vacancyId);
  });

  window.addEventListener('hh-ar-apply-all', async () => {
    const { settings } = await chrome.storage.local.get('settings');
    const minScore = settings?.minMatchScore || 60;
    await applyToAll(vacancies, minScore);
  });

  window.addEventListener('hh-ar-refresh', async () => {
    log.info('Manual refresh triggered');
    const fresh = await parseVacanciesFromPage();
    updateVacancies(fresh);
  });

  // SPA navigation observer
  observeNavigation();
}

// ─── Vacancy Detail Page ───────────────────────

async function initVacancyPage() {
  const { pendingApply } = await chrome.storage.local.get('pendingApply');
  if (pendingApply?.vacancyId) {
    const age = Date.now() - (pendingApply.timestamp || 0);
    if (age < 120000) {
      log.info('Continuing pending apply', pendingApply);
      await chrome.storage.local.remove('pendingApply');
      await continueApply(pendingApply);
    } else {
      await chrome.storage.local.remove('pendingApply');
    }
  }

  const detail = parseVacancyDetailPage();
  if (detail) {
    log.info('Vacancy detail parsed', { title: detail.title, company: detail.company });
    await chrome.storage.local.set({ lastVacancyDetail: detail });
  }
}

// ─── SPA Navigation Observer ───────────────────

function observeNavigation() {
  let debounceTimer = null;

  const observer = new MutationObserver((mutations) => {
    let changed = false;
    for (const m of mutations) {
      if (m.type === 'childList') {
        if (m.target.closest?.('[data-qa="vacancy-serp__vacancy"]') ||
            m.target.closest?.('[data-qa="pager-next"]')) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      log.info('SPA change detected, re-parsing');
      const fresh = await parseVacanciesFromPage();
      updateVacancies(fresh);
    }, 1500);
  });

  observer.observe(document.body, { childList: true, subtree: true });
  log.info('SPA observer active');
}

// ─── Page Type Detection ──────────────────────

function detectPageType() {
  const path = window.location.pathname;
  if (path.startsWith('/search/vacancy')) return 'search';
  if (/^\/vacancy\/\d+/.test(path)) return 'vacancy';
  if (path.startsWith('/applicant/resumes')) return 'resumes';
  if (path.startsWith('/applicant/negotiations')) return 'negotiations';
  return 'unknown';
}

// ─── Boot ──────────────────────────────────────

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
