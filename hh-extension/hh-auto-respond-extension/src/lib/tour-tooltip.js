/**
 * TOUR TOOLTIP — rendering and positioning for guided tour tooltips.
 * Extracted from tour-engine.js for anti-monolith compliance.
 */

import { refs } from '../ui/state.js';

const TOUR_Z = 9999999;

let tooltip = null;

/** @returns {HTMLElement|null} current tooltip element */
export function getTooltip() { return tooltip; }

/** Remove current tooltip from DOM. */
export function removeTooltip() {
  const root = refs.shadowRoot;
  if (tooltip && root?.contains(tooltip)) root.removeChild(tooltip);
  tooltip = null;
}

/**
 * Render tooltip anchored to a target element.
 */
export function renderTooltip(targetEl, step, idx, stepsLen) {
  removeTooltip();
  const root = refs.shadowRoot;
  if (!root) return;

  tooltip = document.createElement('div');
  tooltip.className = 'hh-tour-tooltip';

  const rect = targetEl.getBoundingClientRect();
  const pos = step.position || autoPosition(rect);

  tooltip.innerHTML = buildTooltipHTML(step, idx, stepsLen);

  root.appendChild(tooltip);
  positionTooltip(tooltip, rect, pos);
}

/**
 * Render tooltip centered on screen (no target element).
 */
export function renderCenteredTooltip(step, idx, stepsLen) {
  removeTooltip();
  const root = refs.shadowRoot;
  if (!root) return;

  tooltip = document.createElement('div');
  tooltip.className = 'hh-tour-tooltip';
  tooltip.innerHTML = buildTooltipHTML(step, idx, stepsLen);

  root.appendChild(tooltip);
  tooltip.style.cssText += 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
    'z-index:' + (TOUR_Z + 1) + ';';
}

// ═══════════════════════════════════════════════
// HTML BUILDER
// ═══════════════════════════════════════════════

function buildTooltipHTML(step, idx, stepsLen) {
  const isLast = idx === stepsLen - 1;
  const isFirst = idx === 0;
  const counter = (idx + 1) + '/' + stepsLen;

  return '<div class="hh-tour-header">' +
      '<span class="hh-tour-counter">' + counter + '</span>' +
      '<button class="hh-tour-skip" data-tour="skip">Пропустить</button>' +
    '</div>' +
    (step.title ? '<div class="hh-tour-title">' + step.title + '</div>' : '') +
    '<div class="hh-tour-text">' + step.text + '</div>' +
    '<div class="hh-tour-footer">' +
      (isFirst ? '' : '<button class="hh-tour-prev" data-tour="prev">← Назад</button>') +
      '<button class="hh-tour-next" data-tour="next">' +
        (isLast ? 'Готово' + ' ✓' : 'Далее →') +
      '</button>' +
    '</div>';
}

// ═══════════════════════════════════════════════
// POSITIONING
// ═══════════════════════════════════════════════

function positionTooltip(tipEl, targetRect, pos) {
  tipEl.style.position = 'fixed';
  tipEl.style.zIndex = TOUR_Z + 1;

  const gap = 12;
  // First render off-screen to measure
  tipEl.style.visibility = 'hidden';
  tipEl.style.top = '0';
  tipEl.style.left = '0';

  requestAnimationFrame(() => {
    const tipRect = tipEl.getBoundingClientRect();
    let top, left;

    if (pos === 'bottom') {
      top = targetRect.bottom + gap;
      left = targetRect.left + targetRect.width / 2 - tipRect.width / 2;
    } else if (pos === 'top') {
      top = targetRect.top - tipRect.height - gap;
      left = targetRect.left + targetRect.width / 2 - tipRect.width / 2;
    } else if (pos === 'left') {
      top = targetRect.top + targetRect.height / 2 - tipRect.height / 2;
      left = targetRect.left - tipRect.width - gap;
    } else if (pos === 'right') {
      top = targetRect.top + targetRect.height / 2 - tipRect.height / 2;
      left = targetRect.right + gap;
    } else { // center
      top = window.innerHeight / 2 - tipRect.height / 2;
      left = window.innerWidth / 2 - tipRect.width / 2;
    }

    // Keep in viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - tipRect.height - 8));

    tipEl.style.top = top + 'px';
    tipEl.style.left = left + 'px';
    tipEl.style.visibility = '';
  });
}

function autoPosition(rect) {
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  return spaceBelow > 200 ? 'bottom' : spaceAbove > 200 ? 'top' : 'right';
}
