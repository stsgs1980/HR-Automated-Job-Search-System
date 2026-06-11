/**
 * LIB: RESUME CONSTANTS — Title cleaning utilities.
 * Shared regex patterns and cleanResumeTitle() for extracting resume titles
 * from hh.ru's Magritte-concatenated link text.
 *
 * MAGRITTE NOTES:
 *   - Magritte concatenates link child text WITHOUT newlines:
 *     "Постоянная работаКоммерческий директор (CCO)Многие не видят ваше резюме"
 *     all on one line — cleanResumeTitle must handle this
 *   - CRITICAL: hh.ru uses &nbsp; (U+00A0 non-breaking space) in Russian text!
 *     ALL text comparison MUST normalize whitespace first via normalizeWs().
 */

import { normalizeWs } from './resume-constants.js';

/**
 * Regex for UI text that appears inside resume links but is NOT a title.
 * Tested against individual lines split from link.textContent.
 * NOTE: applied AFTER whitespace normalization
 */
export const UI_NOISE = /^(сделать видимым|скрыть|обновить|поднять|продлить|дублировать|удалить|перейти к вакансиям|перейти|постоянная работа|многие не видят|копировать|редактировать|частичная занятость|проектная работа|стажировка|волонтёрство)/i;

/**
 * Regex for employment-type noise that hh.ru appends to resume titles.
 * Applied after the initial line-by-line filter to catch leftover suffixes.
 */
export const TITLE_SUFFIX_NOISE = /\s*(Постоянная работа|Частичная занятость|Проектная работа|Стажировка|Волонтёрство)\s*$/i;

/**
 * Patterns that Magritte concatenates into a single line with the title.
 * We inject newlines before these so they become separate "lines"
 * that the line-by-line UI_NOISE filter can catch.
 * Order matters: longer patterns first to avoid partial matches.
 * NOTE: These use \s+ between words to handle &nbsp; variations.
 */
export const LINE_BREAK_INJECTORS = [
  /Многие\s+не\s+видят[^\n]*/gi,
  /Сделать\s+видимым/gi,
  /Постоянная\s+работа/gi,
  /Частичная\s+занятость/gi,
  /Проектная\s+работа/gi,
  /Стажировка/gi,
  /Волонтёрство/gi,
  /Перейти\s+к\s+вакансиям/gi,
];

/**
 * Clean a raw title string from hh.ru DOM.
 *
 * Magritte concatenates all child text into one line without newlines:
 *   "Постоянная работаКоммерческий директор (CCO)Многие не видят ваше резюме"
 *
 * Step 1: Normalize whitespace (&nbsp; → regular space)
 * Step 2: Inject newlines before known noise patterns so they become
 *         separate lines that the line filter can handle.
 * Step 3: Split into lines, pick first non-noise line.
 * Step 4: Strip trailing employment-type suffixes.
 * Step 5: Return fallback if nothing remains.
 *
 * @param {string} rawText - The raw link.textContent
 * @param {string} [fallback='Untitled'] - Fallback when no clean title found
 * @returns {string} Clean title
 */
export function cleanResumeTitle(rawText, fallback) {
  fallback = fallback || 'Untitled';
  if (!rawText) return fallback;

  // Step 1: Normalize whitespace (&nbsp; → regular space)
  let text = normalizeWs(rawText);

  // Step 2: Inject newlines before noise patterns (Magritte single-line fix)
  for (const pattern of LINE_BREAK_INJECTORS) {
    pattern.lastIndex = 0;
    text = text.replace(pattern, '\n$&');
  }

  // Step 3: Split into lines and filter
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 2);
  // Pick first line that is NOT UI noise; if ALL lines are noise, use fallback
  let title = lines.find(l => !UI_NOISE.test(l)) || '';

  // Step 4: Strip trailing employment-type suffixes
  title = title.replace(TITLE_SUFFIX_NOISE, '').trim();

  return title || fallback;
}
