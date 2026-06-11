/**
 * TOUR ENGINE — lightweight guided tour for HH Copilot.
 *
 * Core: step management, overlay, spotlight, tab switching.
 * Tooltip rendering → tour-tooltip.js
 */

import { refs } from '../ui/state.js';
import { renderTooltip, renderCenteredTooltip, removeTooltip } from './tour-tooltip.js';

const STORAGE_KEY = 'hh-copilot-tour-done';
const TOUR_Z = 9999999;

let currentStep = 0;
let steps = [];
let overlay = null;
let spotlight = null;
let onDone = null;

// ═══════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════

/** Start a guided tour. */
export function startTour(tourSteps, onFinish) {
  if (overlay) endTour(false);
  steps = tourSteps;
  currentStep = 0;
  onDone = onFinish || null;
  createOverlay();
  showStep(0);
}

/** Check if user has completed the tour before. */
export function isTourDone() {
  try { return localStorage.getItem(STORAGE_KEY) === 'v1'; } catch { return false; }
}

/** Mark tour as completed. */
export function markTourDone() {
  try { localStorage.setItem(STORAGE_KEY, 'v1'); } catch { /* ignore */ }
}

/** Force restart the full tour. */
export function restartTour(tourSteps, onFinish) {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  startTour(tourSteps, onFinish);
}

/** End tour and clean up. */
export function endTour(save = true) {
  if (save) markTourDone();
  removeOverlay();
  steps = [];
  currentStep = 0;
  if (onDone) { onDone(); onDone = null; }
}

// ═══════════════════════════════════════════════
// OVERLAY + SPOTLIGHT
// ═══════════════════════════════════════════════

function createOverlay() {
  const root = refs.shadowRoot;
  if (!root) return;

  overlay = document.createElement('div');
  overlay.className = 'hh-tour-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:' + (TOUR_Z - 1) +
    ';background:rgba(0,0,0,0.45);transition:opacity 0.2s;';

  spotlight = document.createElement('div');
  spotlight.className = 'hh-tour-spotlight';
  spotlight.style.cssText = 'position:fixed;z-index:' + TOUR_Z +
    ';border-radius:6px;box-shadow:0 0 0 4px rgba(59,130,246,0.5),0 0 20px rgba(59,130,246,0.2);' +
    'transition:all 0.3s ease;pointer-events:none;';

  root.appendChild(overlay);
  root.appendChild(spotlight);

  overlay.addEventListener('click', () => endTour(true));
}

function removeOverlay() {
  const root = refs.shadowRoot;
  if (overlay && root?.contains(overlay)) root.removeChild(overlay);
  if (spotlight && root?.contains(spotlight)) root.removeChild(spotlight);
  removeTooltip();
  overlay = spotlight = null;
}

// ═══════════════════════════════════════════════
// STEP NAVIGATION
// ═══════════════════════════════════════════════

function showStep(idx) {
  if (idx < 0 || idx >= steps.length) { endTour(true); return; }
  currentStep = idx;
  const step = steps[idx];

  if (step.tab) switchToTab(step.tab);

  setTimeout(() => {
    const el = findTarget(step.target);
    if (el) {
      positionSpotlight(el);
      renderTooltip(el, step, idx, steps.length);
    } else {
      renderCenteredTooltip(step, idx, steps.length);
    }
  }, step.tab ? 150 : 30);
}

function findTarget(selector) {
  const root = refs.shadowRoot;
  if (!root) return null;
  return root.querySelector(selector) || document.querySelector(selector);
}

function positionSpotlight(el) {
  const rect = el.getBoundingClientRect();
  const pad = 4;
  spotlight.style.top = (rect.top - pad) + 'px';
  spotlight.style.left = (rect.left - pad) + 'px';
  spotlight.style.width = (rect.width + pad * 2) + 'px';
  spotlight.style.height = (rect.height + pad * 2) + 'px';
}

// ═══════════════════════════════════════════════
// TAB SWITCHING
// ═══════════════════════════════════════════════

function switchToTab(tabId) {
  const root = refs.shadowRoot;
  if (!root) return;
  root.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  root.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  const btn = root.querySelector('.tab-btn[data-tab="' + tabId + '"]');
  const section = root.querySelector('#tab-' + tabId);
  if (btn) btn.classList.add('active');
  if (section) section.classList.add('active');
}

// ═══════════════════════════════════════════════
// EVENT DELEGATION
// ═══════════════════════════════════════════════

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tour]');
  if (!btn) return;
  const action = btn.getAttribute('data-tour');
  if (action === 'next') showStep(currentStep + 1);
  else if (action === 'prev') showStep(currentStep - 1);
  else if (action === 'skip') endTour(true);
});
