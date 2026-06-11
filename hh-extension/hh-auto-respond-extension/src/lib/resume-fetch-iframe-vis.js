/**
 * Iframe visibility detection.
 * Detects visibility from the fully-hydrated iframe DOM — the MOST RELIABLE method
 * because hh.ru renders visibility indicators client-side via React, not in SSR HTML.
 *
 * Split from resume-fetch-strategy6-iframe.js for anti-monolith compliance.
 */
import { createLogger } from './anti-hallucination.js';
import {
  VISIBILITY_VISIBLE, VISIBILITY_HIDDEN, VISIBILITY_UNKNOWN,
  hasHiddenIndicator, hasVisibleIndicator, normalizeWs, VISIBILITY_HIDDEN_DATA_QA
} from './resume-constants.js';

const visLog = createLogger('ResumeFetch');

/**
 * Detect visibility from the fully-hydrated iframe DOM.
 * Enhanced with multiple detection strategies and diagnostic logging.
 *
 * @param {Document} iframeDoc - The iframe's contentDocument (after hydration)
 * @returns {{ visibility: string, trace: string[] }}
 */
export function detectVisibilityFromIframeDoc(iframeDoc) {
  const trace = [];
  const diagInfo = { buttons: [], visElements: [], hideElements: [] };

  // ── Strategy 0: Check resume-visibility-card (PRIMARY for Magritte) ──
  const visCard = iframeDoc.querySelector('[data-qa="resume-visibility-card"]');
  if (visCard) {
    const cardText = normalizeWs(visCard.textContent || '').toLowerCase();
    visLog.info('[VIS-IFRAME] resume-visibility-card text="' + cardText.substring(0, 100) + '"');
    if (cardText.includes('не видно никому') || cardText.includes('не\u00A0видно никому')) {
      trace.push('iframe-S0:visibility-card="не видно никому" → HIDDEN');
      return { visibility: VISIBILITY_HIDDEN, trace };
    }
    if (cardText.includes('видно всем') || cardText.includes('видно\u00A0всем')) {
      trace.push('iframe-S0:visibility-card="видно всем" → VISIBLE');
      return { visibility: VISIBILITY_VISIBLE, trace };
    }
    trace.push('iframe-S0:visibility-card-unknown-text="' + cardText.substring(0, 60) + '"');
  } else {
    trace.push('iframe-S0:no-visibility-card');
  }

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
  visLog.info('[VIS-IFRAME] Diagnostic buttons: ' + JSON.stringify(diagInfo.buttons));

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

  // ── Strategy C: Check body text for hidden/visible indicators ──
  const bodyText = iframeDoc.body ? normalizeWs(iframeDoc.body.textContent || '') : '';
  if (hasHiddenIndicator(bodyText)) {
    trace.push('iframe-S3:body-has-hidden-indicator → HIDDEN');
    return { visibility: VISIBILITY_HIDDEN, trace };
  }
  if (hasVisibleIndicator(bodyText)) {
    trace.push('iframe-S3:body-has-visible-indicator → VISIBLE');
    return { visibility: VISIBILITY_VISIBLE, trace };
  }
  trace.push('iframe-S3:body-no-indicators');

  // ── Strategy D: Check for "Скрыть" action link (means resume IS visible) ──
  const hideLink = iframeDoc.querySelector('[data-qa="resume-action-hide"], [data-qa*="resume-hide"], a[data-qa*="hide-resume"]');
  if (hideLink) {
    trace.push('iframe-S4:hide-link-found → VISIBLE');
    return { visibility: VISIBILITY_VISIBLE, trace };
  }
  trace.push('iframe-S4:no-hide-link');

  // ── Strategy E: Check for "не видят" / "видно всем" anywhere ──
  const bodyLower = bodyText.toLowerCase();
  if (bodyLower.includes('не видят') || bodyLower.includes('не\u00A0видят') || bodyLower.includes('не видно')) {
    trace.push('iframe-S5:body-has-"не видят/не видно" → HIDDEN');
    return { visibility: VISIBILITY_HIDDEN, trace };
  }
  if (bodyLower.includes('видно всем')) {
    trace.push('iframe-S5:body-has-"видно всем" → VISIBLE');
    return { visibility: VISIBILITY_VISIBLE, trace };
  }

  // ── Strategy F: Check for visibility status in script JSON ──
  try {
    const scripts = iframeDoc.querySelectorAll('script:not([src])');
    for (const script of scripts) {
      const t = script.textContent || '';
      if (t.length < 50) continue;
      if (/"hidden"\s*:\s*true/.test(t) || /"isHidden"\s*:\s*true/.test(t) ||
          /"visibility"\s*:\s*"hidden"/.test(t) || /"status"\s*:\s*"hidden"/.test(t)) {
        trace.push('iframe-S6:script-has-hidden-pattern → HIDDEN');
        return { visibility: VISIBILITY_HIDDEN, trace };
      }
      if (/"hidden"\s*:\s*false/.test(t) || /"visibility"\s*:\s*"visible"/.test(t)) {
        trace.push('iframe-S6:script-has-visible-pattern → VISIBLE');
        return { visibility: VISIBILITY_VISIBLE, trace };
      }
    }
  } catch (e) {
    trace.push('iframe-S6:script-check-error(' + e.message.substring(0, 30) + ')');
  }
  trace.push('iframe-S6:no-script-patterns');

  // ── Strategy G: Check for notification/banner elements ──
  const notifSelectors = [
    '[data-qa="resume-visibility-notification"]', '[data-qa*="visibility-notification"]',
    '[data-qa*="resume-notification"]', '[class*="resume-hidden"]',
    '[class*="resume-visibility"]', '.resume-status-hidden',
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

  // ── Diagnostic: dump ALL elements with "скрыт" or "видим" text ──
  const visRelated = iframeDoc.querySelectorAll('[data-qa*="resume"], [data-qa*="visibility"]');
  for (const el of visRelated) {
    const elQa = el.getAttribute('data-qa') || '';
    const elText = normalizeWs((el.textContent || '')).substring(0, 60);
    if (elText.includes('скрыт') || elText.includes('видим') || elText.includes('не видят')) {
      diagInfo.visElements.push({ qa: elQa, text: elText });
    }
  }
  if (diagInfo.visElements.length > 0) {
    visLog.info('[VIS-IFRAME] Related elements: ' + JSON.stringify(diagInfo.visElements));
  }

  trace.push('→ UNKNOWN');
  visLog.info('[VIS-IFRAME] All strategies exhausted. Buttons found: ' + diagInfo.buttons.length +
    ', Related elements: ' + diagInfo.visElements.length);
  return { visibility: VISIBILITY_UNKNOWN, trace };
}
