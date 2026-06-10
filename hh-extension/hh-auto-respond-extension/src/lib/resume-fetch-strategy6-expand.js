/**
 * Strategy 6: Fetch expanded experience via iframe, API endpoints, or URL params.
 *
 * hh.ru's resume page has a "Свернуть"/"Развернуть" button in the experience
 * section. In SSR, only 3 company-cards are rendered. The "Развернуть"
 * button does NOT use AJAX — React/Magritte loads all data during client-side
 * hydration and the button simply toggles component visibility in React state.
 * The full experience data is never in the SSR HTML or <script> tags.
 *
 * Approaches:
 *  1. [PRIMARY] Load the resume in a hidden iframe, click "Развернуть",
 *     and parse the fully-rendered DOM
 *  2. [FALLBACK] Try expansion URLs from data-attributes or Magritte state
 *  3. [FALLBACK] Try internal applicant API endpoints
 *  4. [FALLBACK] Try re-fetching with expansion query parameters
 */
import { createLogger } from './anti-hallucination.js';
import { fetchHtml, htmlToDoc } from './resume-fetch-helpers.js';
import { parseCompanyCardFromDoc } from './resume-fetch-parse.js';
import { buildEntryFromApiItem, findExperienceInObject } from './resume-fetch-json-utils.js';
import { parseExperienceFromHtmlText } from './resume-fetch-strategy4-text.js';
import { parseExperienceFromScripts } from './resume-fetch-strategy5-scripts.js';

const fetchLog = createLogger('ResumeFetch');

/**
 * Try to fetch full experience data when SSR only renders 3 entries.
 * @param {Document} doc - Parsed document from DOMParser
 * @param {string} html - Raw HTML string
 * @param {string} resumeId - Resume hash ID
 * @param {number} currentCount - Number of experience entries already found
 * @param {string} resumeUrl - Original resume URL (for re-fetching)
 * @returns {Array} Experience entries (may be same count or more)
 */
export async function fetchExpandedExperience(doc, html, resumeId, currentCount, resumeUrl) {
  fetchLog.info('Strategy 6: starting (currentCount=' + currentCount + ', resumeId=' + (resumeId || 'none') + ')');

  // ── Step 0 [PRIMARY]: Load resume in hidden iframe, click "Развернуть", parse DOM ──
  try {
    const iframeEntries = await fetchExpandedExperienceViaIframe(resumeUrl, currentCount);
    if (iframeEntries.length > currentCount) {
      fetchLog.info('Strategy 6: SUCCESS via iframe — got ' + iframeEntries.length + ' experiences');
      return iframeEntries;
    }
  } catch (err) {
    fetchLog.info('Strategy 6: iframe approach failed: ' + err.message);
  }

  // ── Step 1: Find "Развернуть" / "Показать все" button URLs ──
  const expansionUrls = findExpansionUrls(doc, html, resumeId);
  fetchLog.info('Strategy 6: found ' + expansionUrls.length + ' candidate expansion URLs');
  expansionUrls.forEach((u, i) => {
    fetchLog.info('  URL ' + i + ': ' + u.url + ' (source: ' + u.source + ')');
  });

  // ── Step 2: Try each expansion URL ──
  for (const { url, source } of expansionUrls) {
    try {
      fetchLog.info('Strategy 6: fetching [' + source + '] ' + url);
      const result = await tryFetchExpandedUrl(url, currentCount);
      if (result && result.length > currentCount) {
        fetchLog.info('Strategy 6: SUCCESS from ' + source + ' — got ' + result.length + ' experiences');
        return result;
      }
    } catch (err) {
      fetchLog.info('Strategy 6: [' + source + '] error: ' + err.message);
    }
  }

  // ── Step 3: Try applicant internal API ──
  if (resumeId) {
    const apiUrls = [
      { url: 'https://hh.ru/applicant/api/v1/resumes/' + resumeId, source: 'applicant-api-v1' },
      { url: 'https://hh.ru/applicant/api/resumes/' + resumeId, source: 'applicant-api' },
      { url: 'https://hh.ru/applicant/resumes/api/get?resumeId=' + resumeId, source: 'resumes-api-get' },
    ];

    for (const { url, source } of apiUrls) {
      try {
        fetchLog.info('Strategy 6: trying API [' + source + '] ' + url);
        const resp = await fetch(url, {
          credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
          }
        });

        if (!resp.ok) {
          fetchLog.info('Strategy 6: [' + source + '] returned ' + resp.status);
          continue;
        }

        const contentType = resp.headers.get('content-type') || '';
        if (contentType.includes('json')) {
          const data = await resp.json();
          fetchLog.info('Strategy 6: [' + source + '] returned JSON with keys: ' +
            (typeof data === 'object' ? Object.keys(data).slice(0, 10).join(',') : typeof data));

          const jsonEntries = parseExperienceFromJson(data);
          if (jsonEntries.length > currentCount) {
            fetchLog.info('Strategy 6: SUCCESS from ' + source + ' — got ' + jsonEntries.length + ' experiences');
            return jsonEntries;
          }
          fetchLog.info('Strategy 6: [' + source + '] JSON had ' + jsonEntries.length + ' experiences (need > ' + currentCount + ')');
        }
      } catch (err) {
        fetchLog.info('Strategy 6: [' + source + '] error: ' + err.message);
      }
    }
  }

  // ── Step 4: Try re-fetching with expansion query parameters ──
  if (resumeUrl) {
    const expandVariants = [
      { url: resumeUrl + '&expand=experience_items', source: 'expand-experience-items' },
      { url: resumeUrl + '&showAll=true', source: 'showAll' },
      { url: resumeUrl + '&full=true', source: 'full' },
      { url: resumeUrl + '&expand=all', source: 'expand-all' },
    ];

    for (const { url, source } of expandVariants) {
      try {
        fetchLog.info('Strategy 6: trying param [' + source + '] ' + url);
        const expandedHtml = await fetchHtml(url);
        const expandedDoc = htmlToDoc(expandedHtml);
        const expCards = expandedDoc.querySelectorAll('[data-qa="profile-experience-company-card"]');
        const stepperItems = expandedDoc.querySelectorAll('[data-qa="magritte-stepper-step-content"]');

        fetchLog.info('Strategy 6: [' + source + '] returned HTML with ' +
          expCards.length + ' company-cards, ' + stepperItems.length + ' stepper-items');

        if (expCards.length > currentCount || stepperItems.length > currentCount) {
          const parsed = parseExperienceFromExpandedDoc(expandedDoc, expandedHtml, currentCount);
          if (parsed.length > currentCount) {
            fetchLog.info('Strategy 6: SUCCESS from ' + source + ' — got ' + parsed.length + ' experiences');
            return parsed;
          }
        }
      } catch (err) {
        fetchLog.info('Strategy 6: [' + source + '] error: ' + err.message);
      }
    }
  }

  fetchLog.info('Strategy 6: all approaches exhausted, returning current count: ' + currentCount);
  return [];
}

// ── Iframe approach ──

/**
 * Load the resume page in a hidden iframe, click "Развернуть" buttons
 * to expand all experience entries, then parse the fully-rendered DOM.
 */
async function fetchExpandedExperienceViaIframe(resumeUrl, currentCount) {
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

    // Wait for React/Magritte hydration to complete
    await new Promise(r => setTimeout(r, 2500));

    const iframeDoc = iframe.contentDocument;
    if (!iframeDoc) {
      throw new Error('Cannot access iframe document (cross-origin or blocked)');
    }

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

    return entries;
  } finally {
    try {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    } catch (e) { /* ignore */ }
  }
}

/**
 * Parse experience entries from an iframe document.
 * Uses the same parsing strategies as parseExperienceFromDoc()
 * but works on the iframe's fully-rendered DOM.
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

// ── Expansion URL discovery ──

/**
 * Find candidate expansion URLs from the "Развернуть" button and Magritte state.
 */
function findExpansionUrls(doc, html, resumeId) {
  const urls = [];
  const seen = new Set();

  const addUrl = (url, source) => {
    if (!url || url.length < 5) return;
    const fullUrl = url.startsWith('http') ? url : 'https://hh.ru' + url;
    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);
    urls.push({ url: fullUrl, source });
  };

  // ── Source 1: "Развернуть" / "Показать все" button data-attributes ──
  const expSection = doc.querySelector('[data-qa="resume-list-card-experience"]');
  const searchRoot = expSection || doc;
  const allButtons = searchRoot.querySelectorAll('button, a[href], [data-url], [data-action-url], [data-fetch-url]');
  allButtons.forEach(btn => {
    const text = (btn.textContent || '').trim().toLowerCase();
    const isExpandBtn = text.includes('показать все') || text.includes('показать ещё') ||
      text.includes('посмотреть всё') || text.includes('посмотреть все') ||
      text.includes('развернуть') || text.includes('expand') ||
      btn.getAttribute('data-qa') === 'profile-experience-viewAll';

    if (!isExpandBtn) return;

    fetchLog.info('Strategy 6: found expand button: text="' + text.substring(0, 50) +
      '" data-qa="' + (btn.getAttribute('data-qa') || '') + '"' +
      ' outerHTML=' + btn.outerHTML.substring(0, 200));

    const href = btn.getAttribute('href') || '';
    if (href && href !== '#' && href !== 'javascript:void(0)') {
      addUrl(href, 'button-href');
    }

    const dataAttrs = ['data-url', 'data-action-url', 'data-fetch-url', 'data-load-url',
      'data-api-url', 'data-endpoint', 'data-href', 'data-target'];
    let el = btn;
    for (let i = 0; i < 5 && el; i++) {
      for (const attr of dataAttrs) {
        const val = el.getAttribute(attr) || '';
        if (val && val.length > 5 && val !== '#') {
          addUrl(val, 'button-' + attr + '-ancestor' + i);
        }
      }
      el = el.parentElement;
    }
  });

  // ── Source 2: Magritte script state — look for expansion URLs ──
  const scripts = doc.querySelectorAll('script:not([src])');
  scripts.forEach(script => {
    const text = script.textContent || '';
    if (text.length < 200) return;

    const urlPatterns = [
      /["'](?:url|fetchUrl|loadMore|nextPage|apiUrl|endpoint|actionUrl|href|target)["']\s*:\s*["']([^"']+)["']/gi,
      /["'](?:loadMore|fetchUrl|nextPage|loadMoreUrl)["']\s*:\s*["']([^"']+)["']/gi,
    ];

    for (const pat of urlPatterns) {
      let m;
      while ((m = pat.exec(text)) !== null) {
        const val = m[1];
        if (val && (val.includes('experience') || val.includes('resume') ||
            val.includes('expand') || val.includes('show') || val.includes('load') ||
            val.includes('applicant'))) {
          addUrl(val, 'script-url-pattern');
        }
      }
    }

    const pathMatches = text.matchAll(/["'](\/applicant\/[^"']+)["']/g);
    for (const m of pathMatches) {
      addUrl(m[1], 'script-applicant-path');
    }
  });

  // ── Source 3: Known API patterns ──
  if (resumeId) {
    addUrl('https://hh.ru/applicant/resumes/view?resume=' + resumeId + '&expand=experience_items',
      'known-pattern-expand-items');
    addUrl('https://hh.ru/applicant/resumes/mine/' + resumeId + '/experience',
      'known-pattern-experience-endpoint');
  }

  return urls;
}

// ── Fetch and parse expanded URL ──

/**
 * Try fetching an expansion URL and parsing the result.
 * Handles both JSON and HTML responses.
 */
async function tryFetchExpandedUrl(url, currentCount) {
  const resp = await fetch(url, {
    credentials: 'include',
    headers: {
      'Accept': 'text/html, application/json',
      'X-Requested-With': 'XMLHttpRequest',
    }
  });

  if (!resp.ok) {
    fetchLog.info('Strategy 6: ' + url + ' returned ' + resp.status);
    return null;
  }

  const contentType = resp.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await resp.json();
    const jsonEntries = parseExperienceFromJson(data);
    fetchLog.info('Strategy 6: JSON response had ' + jsonEntries.length + ' experiences');
    return jsonEntries;
  }

  // HTML response
  const expandedHtml = await resp.text();
  const expandedDoc = htmlToDoc(expandedHtml);
  const expCards = expandedDoc.querySelectorAll('[data-qa="profile-experience-company-card"]');
  const stepperItems = expandedDoc.querySelectorAll('[data-qa="magritte-stepper-step-content"]');

  fetchLog.info('Strategy 6: HTML response had ' + expCards.length + ' company-cards, ' +
    stepperItems.length + ' stepper-items (' + expandedHtml.length + ' chars)');

  if (expCards.length > currentCount || stepperItems.length > currentCount) {
    return parseExperienceFromExpandedDoc(expandedDoc, expandedHtml, currentCount);
  }

  const scriptParsed = parseExperienceFromScripts(expandedDoc, expandedHtml);
  if (scriptParsed.length > currentCount) {
    return scriptParsed;
  }

  return null;
}

// ── JSON response parsing ──

/**
 * Parse experience entries from a JSON API response.
 * Handles hh.ru API format: { experience: [{ position, company, start, end, ... }] }
 */
function parseExperienceFromJson(data) {
  const entries = [];

  const exp = data?.experience || data?.resume?.experience ||
              data?.result?.experience || data?.items;

  if (!Array.isArray(exp)) {
    const found = findExperienceArray(data);
    if (found) {
      found.forEach(item => {
        const job = buildEntryFromApiItem(item);
        if (job.position || job.company) entries.push(job);
      });
    }
    return entries;
  }

  exp.forEach(item => {
    const job = buildEntryFromApiItem(item);
    if (job.position || job.company) entries.push(job);
  });

  return entries;
}

/**
 * Recursively search for an array containing experience-like objects.
 * Depth-limited to avoid infinite recursion.
 * @deprecated Use findExperienceInObject from resume-fetch-json-utils.js instead
 */
function findExperienceArray(obj, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 4 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    if (obj.length > 0 && obj[0] && (obj[0].position || obj[0].company || obj[0].startDate)) {
      return obj;
    }
    return null;
  }
  for (const key of Object.keys(obj)) {
    const result = findExperienceArray(obj[key], depth + 1);
    if (result) return result;
  }
  return null;
}

// ── Expanded doc parsing ──

/**
 * Parse experience from an expanded HTML document.
 * Uses the same strategies as the main parser but starts fresh.
 */
function parseExperienceFromExpandedDoc(expandedDoc, expandedHtml, currentCount) {
  const entries = [];
  const usedStepperElements = new Set();

  // Strategy 1: company cards
  const allCards = expandedDoc.querySelectorAll('[data-qa="profile-experience-company-card"]');
  const seen = new Set();
  const uniqueCards = [];
  allCards.forEach(c => { if (!seen.has(c)) { seen.add(c); uniqueCards.push(c); } });

  uniqueCards.forEach(card => {
    const job = parseCompanyCardFromDoc(card);
    if (job) entries.push(job);
    const stepEl = card.querySelector('[data-qa="magritte-stepper-step-content"]');
    if (stepEl) usedStepperElements.add(stepEl);
  });

  // Strategy 2: stepper supplement
  const expCard = expandedDoc.querySelector('[data-qa="resume-list-card-experience"]');
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

  // Strategy 3: text patterns if still not enough
  if (entries.length <= currentCount && expandedHtml) {
    const textParsed = parseExperienceFromHtmlText(expandedHtml, entries.length);
    if (textParsed.length > entries.length) {
      entries.length = 0;
      entries.push(...textParsed);
    }
  }

  return entries;
}
