/**
 * LIB: RESUME CONSTANTS — Visibility detection utilities.
 * Constants and functions for detecting whether a resume is visible or hidden
 * on hh.ru. Used by both fetch-based (resume-fetch-helpers) and DOM-based
 * (resume-detail) parsers to ensure consistent behaviour.
 *
 * MAGRITTE NOTES:
 *   - Visibility indicators may be client-rendered (not in fetch HTML)
 *   - CRITICAL: hh.ru uses &nbsp; (U+00A0 non-breaking space) in Russian text!
 *     "Многие\u00A0не\u00A0видят" will NOT match "многие не видят" with regular spaces.
 *     ALL text comparison MUST normalize whitespace first via normalizeWs().
 */

import { normalizeWs } from './resume-constants.js';

/**
 * Visibility status values for resumes.
 *   'visible'  — resume is publicly visible to employers
 *   'hidden'   — resume is hidden ("Многие не видят" / "Сделать видимым")
 *   'unknown'  — status could not be determined
 */
export const VISIBILITY_VISIBLE = 'visible';
export const VISIBILITY_HIDDEN = 'hidden';
export const VISIBILITY_UNKNOWN = 'unknown';

/**
 * Text indicators that a resume is hidden.
 * If ANY of these appear in the link/card text (after whitespace normalization),
 * the resume is hidden.
 * These are the actual Russian phrases hh.ru shows on hidden resumes.
 * ALL use regular spaces — normalizeWs() must be called before matching.
 */
export const HIDDEN_INDICATORS = ['многие не видят', 'сделать видимым', 'не видно никому', 'не видно'];

/**
 * Text indicators that a resume is visible (publicly accessible to employers).
 * If ANY of these appear in the card/page text (after whitespace normalization),
 * the resume is visible.
 * These are the actual Russian phrases hh.ru shows on visible resumes.
 * ALL use regular spaces — normalizeWs() must be called before matching.
 */
export const VISIBLE_INDICATORS = ['видно всем', 'видно всем работодателям'];

/**
 * Check if normalized text contains any visible indicator.
 * Applies whitespace normalization FIRST to handle &nbsp; from hh.ru.
 *
 * @param {string} text - Raw text (link textContent, card textContent, etc.)
 * @returns {boolean} true if visible indicator found
 */
export function hasVisibleIndicator(text) {
  if (!text) return false;
  const lower = normalizeWs(text).toLowerCase();
  return VISIBLE_INDICATORS.some(ind => lower.includes(ind));
}

/**
 * Check if normalized text contains any hidden indicator.
 * Applies whitespace normalization FIRST to handle &nbsp; from hh.ru.
 *
 * @param {string} text - Raw text (link textContent, card textContent, etc.)
 * @returns {boolean} true if hidden indicator found
 */
export function hasHiddenIndicator(text) {
  if (!text) return false;
  const lower = normalizeWs(text).toLowerCase();
  return HIDDEN_INDICATORS.some(ind => lower.includes(ind));
}

/**
 * Detect resume visibility from the link's raw textContent.
 * This is the MOST RELIABLE method because in Magritte the link text
 * directly includes "Многие не видят ваше резюме" for hidden resumes.
 *
 * CRITICAL: Uses hasHiddenIndicator() which normalizes &nbsp; first.
 *
 * @param {string} linkText - The raw link.textContent
 * @returns {{ visibility: string, hidden: boolean, method: string }}
 */
export function detectVisibilityFromLinkText(linkText) {
  if (!linkText) return { visibility: VISIBILITY_UNKNOWN, hidden: false, method: 'no-link-text' };

  const isHidden = hasHiddenIndicator(linkText);
  if (isHidden) {
    return { visibility: VISIBILITY_HIDDEN, hidden: true, method: 'link-text' };
  }
  // IMPORTANT: Do NOT assume VISIBLE here!
  // The absence of hidden indicators in the link's textContent does NOT prove
  // the resume is visible — the indicator ("Многие не видят") may be in a
  // sibling element outside the <a>, or in the card container.
  // Returning UNKNOWN allows other strategies (card-based, proximity) to check.
  return { visibility: VISIBILITY_UNKNOWN, hidden: false, method: 'link-text-no-indicator' };
}

/**
 * Detect resume visibility from the text content of its card container.
 * @param {string} cardText - Text content of the resume's DOM card
 * @returns {string} One of VISIBILITY_VISIBLE, VISIBILITY_HIDDEN, VISIBILITY_UNKNOWN
 */
export function detectVisibilityFromCardText(cardText) {
  if (!cardText) return VISIBILITY_UNKNOWN;
  if (hasHiddenIndicator(cardText)) return VISIBILITY_HIDDEN;
  if (hasVisibleIndicator(cardText)) return VISIBILITY_VISIBLE;
  // CRITICAL: Do NOT default to VISIBLE — absence of indicator in SSR text
  // doesn't mean visible (client-rendered by React). Return UNKNOWN.
  return VISIBILITY_UNKNOWN;
}

/**
 * Detect resume visibility from a DOM element (card container).
 * Checks both data-qa attributes (Magritte-specific) and text content.
 *
 * @param {Element} cardEl - The DOM element representing the resume card
 * @returns {{ visibility: string, hidden: boolean, method: string }}
 */
export function detectVisibilityFromCard(cardEl) {
  if (!cardEl) return { visibility: VISIBILITY_UNKNOWN, hidden: false, method: 'no-card' };

  // Strategy A: Check for hidden-specific data-qa attributes inside the card
  // Import from resume-constants.js to avoid circular deps
  const { VISIBILITY_HIDDEN_DATA_QA } = require('./resume-constants.js');
  for (const sel of VISIBILITY_HIDDEN_DATA_QA) {
    const found = cardEl.querySelector(sel);
    if (found) {
      return { visibility: VISIBILITY_HIDDEN, hidden: true, method: 'data-qa:' + sel };
    }
  }

  // Strategy B: Check card text content for hidden indicators (with &nbsp; normalization)
  if (hasHiddenIndicator(cardEl.textContent || '')) {
    return { visibility: VISIBILITY_HIDDEN, hidden: true, method: 'text-indicator' };
  }

  // Strategy C: Check card text content for visible indicators
  if (hasVisibleIndicator(cardEl.textContent || '')) {
    return { visibility: VISIBILITY_VISIBLE, hidden: false, method: 'text-visible-indicator' };
  }

  // CRITICAL: Do NOT assume VISIBLE here!
  // The SSR HTML card may lack hidden indicators because hh.ru renders them
  // client-side via React. Absence of indicators ≠ visible.
  // Return UNKNOWN so iframe/detail page detection can resolve it.
  return { visibility: VISIBILITY_UNKNOWN, hidden: false, method: 'card-no-indicators' };
}
