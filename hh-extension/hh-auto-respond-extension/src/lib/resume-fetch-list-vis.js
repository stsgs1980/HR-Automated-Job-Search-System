/**
 * List-level visibility extraction.
 * Detects visibility from the resume LIST page HTML (e.g. /applicant/resumes).
 * Less reliable than page-level detection but runs first as a fast pre-check.
 *
 * Split from resume-fetch-helpers.js for anti-monolith compliance.
 */
import { createLogger } from './anti-hallucination.js';
import {
  VISIBILITY_VISIBLE, VISIBILITY_HIDDEN, VISIBILITY_UNKNOWN,
  HIDDEN_INDICATORS, RESUME_CARD_SELECTORS, VISIBILITY_HIDDEN_DATA_QA,
  detectVisibilityFromCard,
  hasHiddenIndicator, normalizeWs, stripScripts
} from './resume-constants.js';

const visLog = createLogger('ResumeFetchH');

const SEARCH_RADIUS = 5000; // chars after the resume hash to search for visibility indicators

/**
 * Extract visibility status using multiple strategies.
 *
 * Strategy 0: Check resumes already detected by extractResumeLinks
 * Strategy 1: data-qa card containers in the parsed Document
 * Strategy 2: Magritte script/hydration state
 * Strategy 3: Proximity search with <script> stripping
 *
 * @param {Document} doc - Parsed document from DOMParser
 * @param {Array} resumes - Resume objects (visibility will be set in-place)
 * @param {string} html - Raw HTML string
 */
export function extractVisibilityStatus(doc, resumes, html) {
  if (resumes.length === 0) return;
  if (!html) {
    visLog.warn('extractVisibilityStatus: no raw HTML provided, skipping');
    return;
  }

  const htmlLower = html.toLowerCase();

  // ═══ STRATEGY 0: Check resumes already detected by extractResumeLinks ═══
  let alreadyDetected = 0;
  let needDetection = 0;
  resumes.forEach(r => {
    if (r.visibility === VISIBILITY_HIDDEN || r.visibility === VISIBILITY_VISIBLE) alreadyDetected++;
    else needDetection++;
  });

  // Debug: log raw link text for each resume
  resumes.forEach(r => {
    const link = Array.from(doc.querySelectorAll('a[href]')).find(a => {
      const h = a.getAttribute('href') || '';
      return h.includes(r.id);
    });
    if (link) {
      const raw = link.textContent || '';
      const norm = normalizeWs(raw);
      const hasInd = hasHiddenIndicator(raw);
      visLog.info('  DEBUG ' + r.id.substring(0, 8) + ': rawLen=' + raw.length +
        ' hasNbsp=' + (raw.indexOf('\u00A0') !== -1) +
        ' normalized="' + norm.substring(0, 80) + '"' +
        ' hasHidden=' + hasInd + ' vis=' + r.visibility);
    }
  });

  visLog.info('Visibility scan: ' + resumes.length + ' resumes (' +
    alreadyDetected + ' already from link text, ' + needDetection + ' need detection)');

  if (needDetection === 0) {
    visLog.info('All resumes already detected from link text — skipping other strategies');
    logVisibilitySummary(resumes);
    return;
  }

  // Quick check: do hidden indicators exist ANYWHERE in the HTML?
  const globalIndicators = HIDDEN_INDICATORS.map(ind => ({ text: ind, pos: htmlLower.indexOf(ind) }));
  const hasAnyIndicators = globalIndicators.some(i => i.pos !== -1);
  visLog.info('Indicators in HTML: ' + (hasAnyIndicators
    ? globalIndicators.filter(i => i.pos !== -1).map(i => '"' + i.text + '"@' + i.pos).join(', ')
    : 'NONE FOUND'));

  // ═══ STRATEGY 1: data-qa card containers ═══
  let strategyUsed = false;
  for (const sel of RESUME_CARD_SELECTORS) {
    const cards = doc.querySelectorAll(sel);
    if (cards.length === 0) continue;
    visLog.info('Strategy 1: Found ' + cards.length + ' cards with selector: ' + sel);
    let matched = 0;
    cards.forEach(card => {
      const link = card.querySelector('a[href*="/resume/"], a[href*="resume="]');
      if (!link) return;
      const href = link.getAttribute('href') || '';
      let hashMatch = href.match(/\/resume\/([a-f0-9]+)/);
      if (!hashMatch) hashMatch = href.match(/[?&]resume=([a-f0-9]+)/);
      if (!hashMatch) return;
      const id = hashMatch[1];
      const resume = resumes.find(r => r.id === id);
      if (!resume || resume.visibility !== VISIBILITY_UNKNOWN) return;
      const result = detectVisibilityFromCard(card);
      resume.visibility = result.visibility;
      resume.hidden = result.hidden;
      matched++;
      visLog.info('  Card: ' + id.substring(0, 8) + '=' + result.visibility + ' (method=' + result.method + ')');
    });
    if (matched > 0) {
      visLog.info('Strategy 1: matched ' + matched + '/' + needDetection + ' unknown resumes via data-qa cards');
      break;
    }
  }

  const stillUnknown = resumes.filter(r => r.visibility === VISIBILITY_UNKNOWN).length;
  if (stillUnknown === 0) strategyUsed = true;
  else if (!strategyUsed) visLog.info('Strategy 1: no data-qa cards matched, trying next strategy');

  // ═══ STRATEGY 2: Script/hydration state ═══
  if (!strategyUsed) {
    const scriptResult = extractVisibilityFromScripts(doc, resumes, html);
    if (scriptResult) {
      visLog.info('Strategy 2: found visibility in script/hydration state');
      strategyUsed = true;
    }
  }

  // ═══ STRATEGY 3: Proximity search with script stripping ═══
  if (!strategyUsed) {
    runProximitySearch(resumes, html);
    strategyUsed = true;
  }

  // NO FINAL FALLBACK: Keep UNKNOWN as UNKNOWN — detail page will resolve
  const unknownAfterAll = resumes.filter(r => r.visibility === VISIBILITY_UNKNOWN);
  if (unknownAfterAll.length > 0) {
    visLog.info('[VIS-DIAG] List: ' + unknownAfterAll.length + ' resumes still UNKNOWN — will be resolved by detail page detection');
    unknownAfterAll.forEach(r => {
      visLog.info('[VIS-DIAG]   List: ' + r.id.substring(0, 8) + ' "' + (r.title || '').substring(0, 30) + '" → ' + r.visibility);
    });
  }

  logVisibilitySummary(resumes);
}

// ── Strategy 2: Script/hydration state ──

function extractVisibilityFromScripts(doc, resumes, html) {
  let found = false;

  // Pattern 1: Look for "hidden":true/false in JSON near resume hash
  const scripts = doc.querySelectorAll('script');
  scripts.forEach(script => {
    const text = script.textContent || '';
    if (!text || text.length < 100) return;
    resumes.forEach(r => {
      if (r.visibility !== VISIBILITY_UNKNOWN) return;
      const hashIdx = text.indexOf(r.id);
      if (hashIdx === -1) return;
      const nearby = text.substring(Math.max(0, hashIdx - 200), Math.min(text.length, hashIdx + 500));
      if (/"hidden"\s*:\s*true/.test(nearby) || /"visibility"\s*:\s*"hidden"/.test(nearby) ||
          /"status"\s*:\s*"hidden"/.test(nearby) || /"isHidden"\s*:\s*true/.test(nearby)) {
        r.visibility = VISIBILITY_HIDDEN;
        r.hidden = true;
        found = true;
        visLog.info('  Script visibility: ' + r.id.substring(0, 8) + '=hidden (JSON pattern)');
      }
    });
  });

  // Pattern 2: Look for data-qa="resume-status-hidden" in raw HTML
  for (const sel of VISIBILITY_HIDDEN_DATA_QA) {
    const qaMatch = sel.match(/data-qa="([^"]+)"/) || sel.match(/data-qa\*="([^"]+)"/);
    if (!qaMatch) continue;
    const qaValue = qaMatch[1];
    const qaPattern = 'data-qa="' + qaValue;
    const qaIdx = findAllPositions(html, qaPattern);
    if (qaIdx.length > 0) {
      visLog.info('  Found data-qa="' + qaValue + '" at positions: ' + qaIdx.join(', '));
      qaIdx.forEach(pos => {
        const before = html.substring(Math.max(0, pos - 3000), pos).toLowerCase();
        let nearestId = null;
        let nearestDist = Infinity;
        resumes.forEach(r => {
          const idx = before.lastIndexOf(r.id.toLowerCase());
          if (idx !== -1 && (before.length - idx) < nearestDist) {
            nearestDist = before.length - idx;
            nearestId = r;
          }
        });
        if (nearestId && nearestId.visibility === VISIBILITY_UNKNOWN) {
          nearestId.visibility = VISIBILITY_HIDDEN;
          nearestId.hidden = true;
          found = true;
          visLog.info('  data-qa visibility: ' + nearestId.id.substring(0, 8) + '=hidden');
        }
      });
    }
  }

  return found;
}

// ── Strategy 3: Proximity search with script stripping ──

function runProximitySearch(resumes, html) {
  visLog.info('Strategy 3: proximity search with <script> stripping');
  const cleanHtml = stripScripts(html);
  const cleanLower = cleanHtml.toLowerCase();
  const cleanForSearch = cleanLower.replace(/&nbsp;/g, ' ');

  const cleanIndicators = HIDDEN_INDICATORS.map(ind => ({ text: ind, pos: cleanForSearch.indexOf(ind) }));
  const hasCleanIndicators = cleanIndicators.some(i => i.pos !== -1);
  visLog.info('  Cleaned HTML: ' + cleanHtml.length + ' chars (was ' + html.length +
    '), indicators: ' + (hasCleanIndicators
      ? cleanIndicators.filter(i => i.pos !== -1).map(i => '"' + i.text + '"@' + i.pos).join(', ')
      : 'NONE'));

  const hashPositions = resumes.map(r => {
    const pos = cleanLower.indexOf(r.id.toLowerCase());
    return { id: r.id, pos };
  }).filter(h => h.pos !== -1).sort((a, b) => a.pos - b.pos);

  if (hashPositions.length > 0) {
    visLog.info('  Hash positions in cleaned HTML: ' +
      hashPositions.map(h => h.id.substring(0, 8) + '@' + h.pos).join(', '));
  }

  resumes.forEach(r => {
    if (r.visibility !== VISIBILITY_UNKNOWN) return;
    const myPos = cleanForSearch.indexOf(r.id.toLowerCase());
    if (myPos === -1) {
      visLog.info('  ' + r.id.substring(0, 8) + ': hash not found in cleaned HTML');
      return;
    }
    const nextResume = hashPositions.find(h => h.pos > myPos && h.id !== r.id);
    const boundary = nextResume ? nextResume.pos : cleanForSearch.length;
    const searchStart = Math.max(0, myPos - 500);
    const searchEnd = Math.min(myPos + SEARCH_RADIUS, boundary);
    const zone = cleanForSearch.substring(searchStart, searchEnd);
    const isHidden = hasHiddenIndicator(zone);
    r.visibility = isHidden ? VISIBILITY_HIDDEN : VISIBILITY_UNKNOWN;
    r.hidden = isHidden;
    visLog.info('  ' + r.id.substring(0, 8) + '=' + r.visibility +
      ' (zone ' + searchStart + '-' + searchEnd +
      ', next=' + (nextResume ? nextResume.id.substring(0, 8) : 'none') +
      ', indicators=' + (isHidden ? 'FOUND' : 'none') + ')');
  });
}

// ── Utility ──

function findAllPositions(html, pattern) {
  const positions = [];
  const lower = html.toLowerCase();
  let idx = 0;
  while ((idx = lower.indexOf(pattern, idx)) !== -1) {
    positions.push(idx);
    idx += pattern.length;
  }
  return positions;
}

function logVisibilitySummary(resumes) {
  const summary = resumes.map(r => r.id.substring(0, 8) + '=' + r.visibility).join(', ');
  visLog.info('Visibility result: [' + summary + ']');
}
