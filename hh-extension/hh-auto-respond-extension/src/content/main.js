/**
 * MAIN: BOOT SEQUENCE
 * =====================
 * Entry point for the bundled content script.
 * Initializes the panel, sets up auth polling, SPA observer,
 * and handles page-specific logic.
 */

import { createLogger } from '../lib/anti-hallucination.js';
import { checkDailyReset } from '../lib/storage.js';
import { getStats } from '../lib/storage.js';
import { parseVacanciesFromPage } from '../parsers/vacancy-list.js';
import { parseResume, parseResumeList, expandHiddenSections, diagnoseResumeDOM, getResumePageType } from '../parsers/resume-detail.js';
import { continueApply } from '../engine/auto-respond.js';
import { panelState, updateAuthState, createPanel, updateVacancies, updateStats, setStatus } from '../ui/panel.js';
import { checkAuth } from '../ui/auth.js';

const mainLog = createLogger('Main');
let pageInitialized = false;

// Expose diagnoseResumeDOM globally for console access
window.__hhDiagnose = diagnoseResumeDOM;

async function init() {
  mainLog.info('Loaded: ' + window.location.href);
  await checkDailyReset();
  createPanel();

  // Load saved resume from storage
  try {
    const d = await chrome.storage.local.get('myResume');
    if (d.myResume && d.myResume.id) {
      panelState.resume = d.myResume;
      mainLog.info('Loaded saved resume: ' + d.myResume.title);
    }
  } catch (e) {}

  // Auth poll — only once (updateAuthState in createPanel handles periodic checks)
  pollAuth();

  // Events
  window.addEventListener('hh-ar-apply', async (e) => {
    if (!panelState.isLoggedIn) return;
    // Import dynamically to avoid circular issues
    const { applyToVacancy } = await import('../engine/auto-respond.js');
    await applyToVacancy(e.detail.vacancyId);
  });

  window.addEventListener('hh-ar-apply-all', async () => {
    if (!panelState.isLoggedIn) return;
    const { applyToAll } = await import('../engine/auto-respond.js');
    await applyToAll(panelState.vacancies);
  });

  window.addEventListener('hh-ar-refresh', async () => {
    if (!panelState.isLoggedIn) return;
    const v = await parseVacanciesFromPage();
    updateVacancies(v);
  });

  // Resume events
  window.addEventListener('hh-ar-load-resume', async () => {
    if (!panelState.isLoggedIn) return;
    const path = window.location.pathname;

    if (/\/resume\/[a-f0-9]+/.test(path)) {
      await expandHiddenSections();
      const resume = parseResume();
      if (resume.id) {
        panelState.resume = resume;
        await chrome.storage.local.set({ myResume: resume });
        mainLog.info('Resume loaded and saved: ' + resume.title);
      } else {
        mainLog.warn('Could not parse resume from current page (no id)');
      }
    } else if (path.includes('/applicant/resumes')) {
      const list = parseResumeList();
      if (list.length > 0) {
        panelState.resumeList = list;
        mainLog.info('Resume list loaded: ' + list.length + ' resumes');
      } else {
        mainLog.warn('No resumes found on list page');
      }
    } else {
      mainLog.warn('Cannot parse resume from this page (' + path + '). Go to /resume/{hash} or /applicant/resumes');
    }
  });
}

function pollAuth() {
  if (checkAuth()) {
    mainLog.info('User logged in');
    if (!pageInitialized) {
      pageInitialized = true;
      updateAuthState();
      initPageLogic();
    }
    return;
  }
  setTimeout(pollAuth, 2000);
}

async function initPageLogic() {
  const path = window.location.pathname;
  mainLog.info('Page: ' + path);

  if (path.startsWith('/search/vacancy')) {
    const vacancies = await parseVacanciesFromPage();
    updateVacancies(vacancies);
    const stats = await getStats();
    updateStats(stats);

    // SPA observer — debounce mutations to avoid excessive re-parsing
    let timer = null;
    new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const fresh = await parseVacanciesFromPage();
        updateVacancies(fresh);
      }, 1500);
    }).observe(document.body, { childList: true, subtree: true });
    mainLog.info('SPA observer active');

  } else if (/^\/resume\/[a-f0-9]+/.test(path)) {
    // Resume detail page — parse resume
    await expandHiddenSections();
    const resume = parseResume();
    if (resume.id) {
      panelState.resume = resume;
      await chrome.storage.local.set({ myResume: resume });
      mainLog.info('Auto-parsed resume: ' + resume.title);
    }

  } else if (path.startsWith('/applicant/resumes')) {
    // Resume list page
    const resumeList = parseResumeList();
    panelState.resumeList = resumeList;
    mainLog.info('Resume list page: ' + resumeList.length + ' resumes');

  } else if (/^\/vacancy\/\d+/.test(path)) {
    // VACANCY DETAIL PAGE — check for pending apply queue
    mainLog.info('Vacancy detail page detected');
    try {
      const d = await chrome.storage.local.get('applyQueue');
      const queue = d.applyQueue || [];
      if (queue.length > 0) {
        const vacancyId = path.replace('/vacancy/', '').split('?')[0].split('#')[0];
        const pending = queue.find(q => q.vacancyId === vacancyId);
        if (pending) {
          // Remove this item from queue
          const updatedQueue = queue.filter(q => q.vacancyId !== vacancyId);
          await chrome.storage.local.set({ applyQueue: updatedQueue });
          mainLog.info('Processing apply for vacancy ' + vacancyId);

          // Wait a moment for page to settle
          await new Promise(r => setTimeout(r, 2000));
          await continueApply(pending);
        } else {
          mainLog.info('Queue has items but none for current vacancy (' + vacancyId + ')');
        }
      } else {
        mainLog.info('No apply queue');
      }
    } catch (e) {
      mainLog.error('Error processing apply queue: ' + e.message);
    }
  }
}

// BOOT
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
