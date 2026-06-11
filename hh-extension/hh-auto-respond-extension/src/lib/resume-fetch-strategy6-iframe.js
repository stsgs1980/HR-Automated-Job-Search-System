/**
 * Strategy 6 — iframe sub-strategy.
 *
 * Load the resume page in a hidden iframe, click "Развернуть" buttons
 * to expand all experience entries, then parse the fully-rendered DOM.
 *
 * ALSO detects visibility from the fully-hydrated DOM — this is the MOST
 * RELIABLE visibility detection because hh.ru renders "Многие не видят ваше
 * резюме" / "Сделать видимым" client-side via React, not in SSR HTML.
 *
 * Split from resume-fetch-strategy6-expand.js for modularity.
 */
import { createLogger } from './anti-hallucination.js';
import { parseCompanyCardFromDoc } from './resume-fetch-parse.js';
import {
  VISIBILITY_VISIBLE, VISIBILITY_HIDDEN, VISIBILITY_UNKNOWN,
  hasHiddenIndicator, normalizeWs, VISIBILITY_HIDDEN_DATA_QA
} from './resume-constants.js';

const fetchLog = createLogger('ResumeFetch');

/**
 * Load the resume page in a hidden iframe, click "Развернуть" buttons
 * to expand all experience entries, then parse the fully-rendered DOM.
 * Also detects visibility from the hydrated DOM.
 * @param {string} resumeUrl - Full URL of the resume page
 * @param {number} currentCount - Number of experience entries already found
 * @returns {Promise<{entries: Array, iframeVis: string, iframeVisTrace: string[]}>}
 */
export async function fetchExpandedExperienceViaIframe(resumeUrl, currentCount) {
  fetchLog.info('Strategy 6 iframe: loading ' + resumeUrl);

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1280px;height:800px;opacity:0;pointer-events:none;border:none;';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('tabindex', '-1');
  iframe.src = resumeUrl;
  document.body.appendChild(iframe);

  try {
    // Wait for iframe to load (full page, including scripts)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('iframe load timeout (15s)')), 15000);
      iframe.addEventListener('load', () => { clearTimeout(timeout); resolve(); });
      iframe.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('iframe load error')); });
    });

    // Wait for React/Magritte hydration to complete (increased from 2.5s — some pages need more)
    await new Promise(r => setTimeout(r, 4000));

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
      throw new Error('Cannot access iframe document (cross-origin or blocked)');
    }

    // ═══ VISIBILITY DETECTION from fully-hydrated iframe DOM ═══
    // This is the MOST RELIABLE method: after React hydration, the DOM
    // contains "Многие не видят ваше резюме" / "Сделать видимым" etc.
    const iframeVisResult = detectVisibilityFromIframeDoc(iframeDoc);
    fetchLog.info('[VIS-DIAG] iframe visibility: ' + iframeVisResult.visibility +
      ' (trace: ' + iframeVisResult.trace.join(' → ') + ')');

    // Count experience cards before expansion
    const preCards = iframeDoc.querySelectorAll('[data-qa="profile-experience-company-card"]');
    const preSteppers = iframeDoc.querySelectorAll('[data-qa="magritte-stepper-step-content"]');
    fetchLog.info('Strategy 6 iframe: before expand — ' + preCards.length + ' company-cards, ' + preSteppers.length + ' stepper-items');

    // Click "Развернуть" buttons
    const expandButtons = iframeDoc.querySelectorAll('[data-qa="profile-experience-viewAll"], button');
    let clicked = 0;
    expandButtons.forEach(btn => {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text.includes('развернуть') || text.includes('показать все') ||
          text.includes('показать ещё') || text.includes('посмотреть всё') ||
          text.includes('посмотреть все') || text.includes('expand')) {
        try { btn.click(); clicked++; } catch (e) { /* ignore */ }
      }
    });
    fetchLog.info('Strategy 6 iframe: clicked ' + clicked + ' expand buttons');

    if (clicked > 0) {
      await new Promise(r => setTimeout(r, 2000));
    }

    const postCards = iframeDoc.querySelectorAll('[data-qa="profile-experience-company-card"]');
    const postSteppers = iframeDoc.querySelectorAll('[data-qa="magritte-stepper-step-content"]');
    fetchLog.info('Strategy 6 iframe: after expand — ' + postCards.length + ' company-cards, ' + postSteppers.length + ' stepper-items');

    const entries = parseExperienceFromIframeDoc(iframeDoc);
    fetchLog.info('Strategy 6 iframe: parsed ' + entries.length + ' experience entries');

    return { entries, iframeVis: iframeVisResult.visibility, iframeVisTrace: iframeVisResult.trace };
  } finally {
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch (e) { /* ignore */ }
  }
}

/**
 * Detect visibility from the fully-hydrated iframe DOM.
 * This is more reliable than SSR-based detection because hh.ru renders
 * visibility indicators ("Многие не видят", "Сделать видимым") client-side.
 *
 * Enhanced with multiple detection strategies and diagnostic logging.
 *
 * @param {Document} iframeDoc - The iframe's contentDocument (after hydration)
 * @returns {{ visibility: string, trace: string[] }}
 */
function detectVisibilityFromIframeDoc(iframeDoc) {
  const trace = [];
  const diagInfo = { buttons: [], visElements: [], hideElements: [] };

  // ── Diagnostic: collect ALL buttons/links with visibility-related text ──
  const allButtons = iframeDoc.querySelectorAll('button, a, [role="button"]');
  for (const btn of allButtons) {
    const text = normalizeWs((btn.textContent || '')).toLowerCase();
    const qa = (btn.getAttribute('data-qa') || '').toLowerCase();
    const href = (btn.getAttribute('href') || '').toLowerCase();
    if (text.includes('видим') || text.includes('скрыть') || text.includes('скрыт') ||
        qa.includes('visible') || qa.includes('hide') || qa.includes('hidden') ||
        qa.includes('show') || href.includes('visible') || href.includes('hide')) {
      diagInfo.buttons.push({ text: text.substring(0, 50), qa, href: href.substring(0, 60), tag: btn.tagName });
    }
  }
  fetchLog.info('[VIS-IFRAME] Diagnostic buttons: ' + JSON.stringify(diagInfo.buttons));

  // ── Strategy A: Check for hidden-specific data-qa attributes ──
  for (const sel of VISIBILITY_HIDDEN_DATA_QA) {
    const found = iframeDoc.querySelector(sel);
    if (found) {
      trace.push('iframe-S1:data-qa=' + sel + ' → HIDDEN');
      return { visibility: VISIBILITY_HIDDEN, trace };
    }
  }
  trace.push('iframe-S1:no-data-qa-hidden');

  // ── Strategy B: Check for "Сделать видимым" / "Скрыть резюме" buttons ──
  for (const btn of allButtons) {
    const text = normalizeWs((btn.textContent || '')).toLowerCase();
    const qa = (btn.getAttribute('data-qa') || '').toLowerCase();
    if (text.includes('сделать видимым') || qa.includes('make-visible') || qa.includes('show-resume')) {
      trace.push('iframe-S2:btn="сделать видимым" → HIDDEN');
      return { visibility: VISIBILITY_HIDDEN, trace };
    }
    if (text.includes('скрыть резюме') || qa.includes('hide-resume') || qa.includes('resume-action-hide')) {
      trace.push('iframe-S2:btn="скрыть резюме" → VISIBLE');
      return { visibility: VISIBILITY_VISIBLE, trace };
    }
  }
  trace.push('iframe-S2:no-key-buttons');

  // ── Strategy C: Check body text for hidden indicators ──
  const bodyText = iframeDoc.body ? normalizeWs(iframeDoc.body.textContent || '') : '';
  if (hasHiddenIndicator(bodyText)) {
    trace.push('iframe-S3:body-has-indicator → HIDDEN');
    return { visibility: VISIBILITY_HIDDEN, trace };
  }
  trace.push('iframe-S3:body-no-indicators');

  // ── Strategy D: Check for "Скрыть" action link (means resume IS visible) ──
  const hideLink = iframeDoc.querySelector('[data-qa="resume-action-hide"], [data-qa*="resume-hide"], a[data-qa*="hide-resume"]');
  if (hideLink) {
    trace.push('iframe-S4:hide-link-found → VISIBLE');
    return { visibility: VISIBILITY_VISIBLE, trace };
  }
  trace.push('iframe-S4:no-hide-link');

  // ── Strategy E: Check for "не видят" anywhere (partial match — more lenient) ──
  // hh.ru may use variations: "Многие не видят ваше резюме", "Работодатели не видят"
  const bodyLower = bodyText.toLowerCase();
  if (bodyLower.includes('не видят') || bodyLower.includes('не\u00A0видят')) {
    trace.push('iframe-S5:body-has-"не видят" → HIDDEN');
    return { visibility: VISIBILITY_HIDDEN, trace };
  }

  // ── Strategy F: Check for visibility status in page's JavaScript state ──
  // Some hh.ru pages expose resume state in __NEXT_DATA__ or similar globals
  try {
    const scripts = iframeDoc.querySelectorAll('script:not([src])');
    for (const script of scripts) {
      const t = script.textContent || '';
      if (t.length < 50) continue;
      // Look for JSON patterns that might contain hidden/visibility status
      if (/"hidden"\s*:\s*true/.test(t) || /"isHidden"\s*:\s*true/.test(t) ||
          /"visibility"\s*:\s*"hidden"/.test(t) || /"status"\s*:\s*"hidden"/.test(t)) {
        trace.push('iframe-S6:script-has-hidden-pattern → HIDDEN');
        return { visibility: VISIBILITY_HIDDEN, trace };
      }
      // Also check for visible patterns (if we find "hidden":false or "visibility":"visible")
      if (/"hidden"\s*:\s*false/.test(t) || /"visibility"\s*:\s*"visible"/.test(t)) {
        trace.push('iframe-S6:script-has-visible-pattern → VISIBLE');
        return { visibility: VISIBILITY_VISIBLE, trace };
      }
    }
  } catch (e) {
    trace.push('iframe-S6:script-check-error(' + e.message.substring(0, 30) + ')');
  }
  trace.push('iframe-S6:no-script-patterns');

  // ── Strategy G: Check for specific hh.ru notification/banner elements ──
  // hh.ru shows a notification banner for hidden resumes
  const notifSelectors = [
    '[data-qa="resume-visibility-notification"]',
    '[data-qa*="visibility-notification"]',
    '[data-qa*="resume-notification"]',
    '[class*="resume-hidden"]',
    '[class*="resume-visibility"]',
    '.resume-status-hidden',
  ];
  for (const sel of notifSelectors) {
    const el = iframeDoc.querySelector(sel);
    if (el) {
      const elText = normalizeWs(el.textContent || '').toLowerCase();
      if (elText.includes('не видят') || elText.includes('скрыт') || elText.includes('сделать видим')) {
        trace.push('iframe-S7:notification=' + sel + ' text="' + elText.substring(0, 40) + '" → HIDDEN');
        return { visibility: VISIBILITY_HIDDEN, trace };
      }
    }
  }
  trace.push('iframe-S7:no-notification-hidden');

  // ── Strategy H: Check for action links with "show"/"visible" in URL ──
  const actionLinks = iframeDoc.querySelectorAll('a[href*="visible"], a[href*="show"], a[href*="publish"]');
  for (const link of actionLinks) {
    const href = (link.getAttribute('href') || '').toLowerCase();
    const linkText = normalizeWs((link.textContent || '')).toLowerCase();
    if (href.includes('publish') || href.includes('make_visible') || href.includes('show')) {
      trace.push('iframe-S8:action-link href="' + href.substring(0, 60) + '" text="' + linkText.substring(0, 40) + '" → HIDDEN');
      return { visibility: VISIBILITY_HIDDEN, trace };
    }
  }
  trace.push('iframe-S8:no-action-links');

  // ── Diagnostic: dump ALL elements with "скрыт" or "видим" text for debugging ──
  const visRelated = iframeDoc.querySelectorAll('[data-qa*="resume"], [data-qa*="visibility"]');
  for (const el of visRelated) {
    const elQa = el.getAttribute('data-qa') || '';
    const elText = normalizeWs((el.textContent || '')).substring(0, 60);
    if (elText.includes('скрыт') || elText.includes('видим') || elText.includes('не видят')) {
      diagInfo.visElements.push({ qa: elQa, text: elText });
    }
  }
  if (diagInfo.visElements.length > 0) {
    fetchLog.info('[VIS-IFRAME] Related elements: ' + JSON.stringify(diagInfo.visElements));
  }

  trace.push('→ UNKNOWN');
  fetchLog.info('[VIS-IFRAME] All strategies exhausted. Buttons found: ' + diagInfo.buttons.length +
    ', Related elements: ' + diagInfo.visElements.length);
  return { visibility: VISIBILITY_UNKNOWN, trace };
}

/**
 * Parse experience entries from an iframe document.
 * Uses the same parsing strategies as parseExperienceFromDoc()
 * but works on the iframe's fully-rendered DOM.
 * @param {Document} iframeDoc - The iframe's contentDocument
 * @returns {Array} Parsed experience entries
 */
function parseExperienceFromIframeDoc(iframeDoc) {
  const allCards = iframeDoc.querySelectorAll('[data-qa="profile-experience-company-card"]');
  const seen = new Set();
  const uniqueCards = [];
  allCards.forEach(c => { if (!seen.has(c)) { seen.add(c); uniqueCards.push(c); } });

  const entries = [];
  const usedStepperElements = new Set();

  // Strategy 1: Parse company cards
  uniqueCards.forEach(card => {
    const job = parseCompanyCardFromDoc(card);
    if (job) entries.push(job);
    const stepEl = card.querySelector('[data-qa="magritte-stepper-step-content"]');
    if (stepEl) usedStepperElements.add(stepEl);
  });

  // Strategy 2: Parse stepper items NOT covered by company cards
  const expCard = iframeDoc.querySelector('[data-qa="resume-list-card-experience"]');
  if (expCard) {
    const stepperItems = expCard.querySelectorAll('[data-qa="magritte-stepper-step-content"]');
    stepperItems.forEach(step => {
      if (usedStepperElements.has(step)) return;
      let parentCard = step.closest('[data-qa="profile-experience-company-card"]');
      if (parentCard && uniqueCards.includes(parentCard)) return;

      const cellLeft = step.querySelector('[data-qa="cell-left-side"]');
      if (!cellLeft) return;
      const texts = cellLeft.querySelectorAll('[data-qa="cell-text-content"]');
      const job = {};
      if (texts.length >= 1) job.position = (texts[0].textContent || '').trim();
      if (texts.length >= 2) job.period = (texts[1].textContent || '').trim().replace(/\s*\(\d[^)]+\)$/, '').trim();
      if (job.position || job.period) entries.push(job);
    });
  }

  // Strategy 3: If still 0, try all stepper items directly
  if (entries.length === 0 && expCard) {
    const allStepperItems = expCard.querySelectorAll('[data-qa="magritte-stepper-step-content"]');
    allStepperItems.forEach(step => {
      const cellLeft = step.querySelector('[data-qa="cell-left-side"]');
      if (!cellLeft) return;
      const texts = cellLeft.querySelectorAll('[data-qa="cell-text-content"]');
      const job = {};
      if (texts.length >= 1) job.position = (texts[0].textContent || '').trim();
      if (texts.length >= 2) job.period = (texts[1].textContent || '').trim().replace(/\s*\(\d[^)]+\)$/, '').trim();
      if (job.position) entries.push(job);
    });
  }

  return entries;
}
