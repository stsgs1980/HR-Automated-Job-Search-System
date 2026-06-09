/**
 * Panel UI — Встроенная панель на странице hh.ru
 * ================================================
 *
 * Инжектирует floating panel поверх страницы поиска вакансий.
 * Панель содержит:
 * - Список распарсенных вакансий с match score
 * - Кнопки "Авто-отклик" для каждой вакансии
 * - Глобальные кнопки: "Откликнуться на все (score >= N)"
 * - Статистика: сколько откликов сегодня, лимит
 * - Индикатор статуса (Idle / Running / Paused)
 *
 * МЕТОДИКА ИНЖЕКЦИИ:
 * - Panel создаётся программно (vanilla JS, никаких CDN)
 * - Shadow DOM изолирует стили от hh.ru
 * - CSS вставлен inline для единого bundling
 *
 * ANTI-HALLUCINATION:
 * - Panel НЕ зависит от конкретной структуры страницы hh.ru
 * - Используем position: fixed, а не injection в DOM flow
 * - При изменении DOM hh.ru, panel остаётся стабильной
 */

import { createLogger } from '../lib/anti-hallucination.js';

const log = createLogger('Panel');

// ─── Panel State ──────────────────────────────

let panelEl = null;
let shadowRoot = null;

const state = {
  isOpen: false,
  status: 'idle',       // 'idle' | 'running' | 'paused' | 'error'
  vacancies: [],
  stats: { appliedToday: 0, dailyLimit: 200, errors: 0 },
  selectedResume: null
};

// ─── Create Panel ────────────────────────────

/**
 * Создаёт floating panel с Shadow DOM.
 */
export function createPanel() {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.id = 'hh-auto-respond-panel';
  panelEl.style.cssText = `
    position: fixed;
    top: 80px;
    right: 0;
    z-index: 99999;
    width: 380px;
    max-height: calc(100vh - 100px);
    transition: transform 0.3s ease;
  `;

  shadowRoot = panelEl.attachShadow({ mode: 'closed' });

  // Стили внутри Shadow DOM
  const style = document.createElement('style');
  style.textContent = getPanelCSS();
  shadowRoot.appendChild(style);

  // HTML
  const container = document.createElement('div');
  container.className = 'har-panel';
  container.innerHTML = getPanelHTML();
  shadowRoot.appendChild(container);

  // Event listeners
  _bindEvents(container);

  document.body.appendChild(panelEl);
  log.info('Panel created and injected');

  return panelEl;
}

/**
 * Переключает видимость панели.
 */
export function togglePanel() {
  if (!panelEl) {
    createPanel();
    state.isOpen = true;
  } else {
    state.isOpen = !state.isOpen;
  }

  panelEl.style.transform = state.isOpen ? 'translateX(0)' : 'translateX(100%)';
  log.info(`Panel ${state.isOpen ? 'opened' : 'closed'}`);
}

// ─── Update Panel Data ────────────────────────

/**
 * Обновляет список вакансий в панели.
 * ANTI-HALLUCINATION: фильтрует невалидные вакансии перед рендером.
 */
export function updateVacancies(vacancies) {
  state.vacancies = vacancies.filter(v => v && v.id && v.title);
  _renderVacancyList();
}

/**
 * Обновляет статистику в панели.
 */
export function updateStats(stats) {
  Object.assign(state.stats, stats);
  _renderStats();
}

/**
 * Обновляет статус.
 */
export function setStatus(status, message = '') {
  state.status = status;
  const indicator = shadowRoot?.querySelector('.har-status-dot');
  const label = shadowRoot?.querySelector('.har-status-text');

  if (indicator) {
    indicator.className = `har-status-dot har-status-${status}`;
  }
  if (label) {
    const labels = { idle: 'Ожидание', running: 'Работает', paused: 'Пауза', error: 'Ошибка' };
    label.textContent = message || labels[status] || status;
  }
}

// ─── Internal Rendering ────────────────────────

function _renderVacancyList() {
  const list = shadowRoot?.querySelector('.har-vacancy-list');
  if (!list) return;

  if (state.vacancies.length === 0) {
    list.innerHTML = '<div class="har-empty">Нет вакансий для отображения</div>';
    return;
  }

  list.innerHTML = state.vacancies.map(v => `
    <div class="har-vacancy-card ${v.status}" data-id="${v.id}">
      <div class="har-vacancy-header">
        <a href="${v.url}" target="_blank" class="har-vacancy-title">${_escHtml(v.title)}</a>
        ${v.matchScore !== null ? `<span class="har-score score-${_scoreClass(v.matchScore)}">${v.matchScore}%</span>` : ''}
      </div>
      <div class="har-vacancy-meta">
        <span class="har-company">${_escHtml(v.company)}</span>
        <span class="har-salary">${_escHtml(v.salary)}</span>
      </div>
      <div class="har-vacancy-footer">
        <span class="har-location">${_escHtml(v.location)}</span>
        ${v.hasReply && v.status === 'new' ? '<button class="har-btn-apply" data-action="apply" data-id="' + v.id + '">Откликнуться</button>' : ''}
        ${v.status === 'applied' ? '<span class="har-badge applied">Откликнута</span>' : ''}
        ${v.status === 'blacklisted' ? '<span class="har-badge blacklisted">В чёрном списке</span>' : ''}
      </div>
    </div>
  `).join('');
}

function _renderStats() {
  const el = shadowRoot?.querySelector('.har-stats');
  if (!el) return;

  el.innerHTML = `
    <div class="har-stat-item">
      <span class="har-stat-value">${state.stats.appliedToday}</span>
      <span class="har-stat-label">откликов сегодня</span>
    </div>
    <div class="har-stat-item">
      <span class="har-stat-value">${state.stats.dailyLimit - state.stats.appliedToday}</span>
      <span class="har-stat-label">осталось</span>
    </div>
    <div class="har-stat-item">
      <span class="har-stat-value">${state.stats.errors}</span>
      <span class="har-stat-label">ошибок</span>
    </div>
  `;
}

// ─── Event Binding ─────────────────────────────

function _bindEvents(container) {
  // Toggle button (всегда видна на краю экрана)
  const toggleBtn = container.querySelector('.har-toggle-btn');
  toggleBtn?.addEventListener('click', togglePanel);

  // Кнопки отклика (delegated)
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="apply"]');
    if (btn) {
      const vacancyId = btn.dataset.id;
      log.info('Apply button clicked', { vacancyId });
      // Dispatch custom event для auto-respond.js
      window.dispatchEvent(new CustomEvent('hh-ar-apply', {
        detail: { vacancyId }
      }));
    }
  });

  // Auto-apply all button
  container.querySelector('[data-action="apply-all"]')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('hh-ar-apply-all'));
  });

  // Pause/resume
  container.querySelector('[data-action="toggle-status"]')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('hh-ar-toggle-status'));
  });
}

// ─── CSS ───────────────────────────────────────

function getPanelCSS() {
  return `
    .har-panel {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: #1a1a1a;
      background: #ffffff;
      border-radius: 12px 0 0 12px;
      box-shadow: -2px 0 20px rgba(0,0,0,0.12);
      overflow: hidden;
    }
    .har-toggle-btn {
      position: absolute;
      top: 50%;
      left: -36px;
      transform: translateY(-50%);
      width: 36px;
      height: 72px;
      background: #2964FF;
      border: none;
      border-radius: 8px 0 0 8px;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }
    .har-toggle-btn:hover { background: #1d4ed8; }
    .har-header {
      padding: 14px 16px;
      background: linear-gradient(135deg, #2964FF, #6366f1);
      color: white;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .har-header h3 { margin: 0; font-size: 15px; font-weight: 600; }
    .har-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .har-status-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: #9ca3af;
    }
    .har-status-idle .har-status-dot { background: #9ca3af; }
    .har-status-running .har-status-dot { background: #22c55e; animation: pulse 1.5s infinite; }
    .har-status-paused .har-status-dot { background: #f59e0b; }
    .har-status-error .har-status-dot { background: #ef4444; }
    .har-status-text { font-size: 11px; opacity: 0.9; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    .har-stats {
      display: flex;
      padding: 10px 16px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      gap: 16px;
    }
    .har-stat-item { text-align: center; flex: 1; }
    .har-stat-value { display: block; font-weight: 700; font-size: 18px; color: #2964FF; }
    .har-stat-label { display: block; font-size: 10px; color: #64748b; margin-top: 2px; }
    .har-actions {
      padding: 10px 16px;
      display: flex;
      gap: 8px;
      border-bottom: 1px solid #e2e8f0;
    }
    .har-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .har-btn-primary { background: #2964FF; color: white; }
    .har-btn-primary:hover { background: #1d4ed8; }
    .har-btn-secondary { background: #f1f5f9; color: #475569; }
    .har-btn-secondary:hover { background: #e2e8f0; }
    .har-btn-danger { background: #fef2f2; color: #dc2626; }
    .har-btn-danger:hover { background: #fee2e2; }
    .har-vacancy-list {
      max-height: 400px;
      overflow-y: auto;
    }
    .har-vacancy-card {
      padding: 10px 16px;
      border-bottom: 1px solid #f1f5f9;
      transition: background 0.15s;
    }
    .har-vacancy-card:hover { background: #f8fafc; }
    .har-vacancy-card.applied { opacity: 0.6; }
    .har-vacancy-card.blacklisted { opacity: 0.4; }
    .har-vacancy-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }
    .har-vacancy-title {
      font-weight: 600;
      color: #2964FF;
      text-decoration: none;
      font-size: 13px;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }
    .har-vacancy-title:hover { text-decoration: underline; }
    .har-score {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }
    .score-high { background: #dcfce7; color: #166534; }
    .score-medium { background: #fef9c3; color: #854d0e; }
    .score-low { background: #fee2e2; color: #991b1b; }
    .har-vacancy-meta {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .har-salary { color: #1a1a1a; font-weight: 500; }
    .har-vacancy-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 6px;
    }
    .har-location { font-size: 11px; color: #94a3b8; }
    .har-btn-apply {
      padding: 3px 10px;
      background: #2964FF;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }
    .har-btn-apply:hover { background: #1d4ed8; }
    .har-badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    }
    .har-badge.applied { background: #dbeafe; color: #1d4ed8; }
    .har-badge.blacklisted { background: #fee2e2; color: #991b1b; }
    .har-empty {
      padding: 20px;
      text-align: center;
      color: #94a3b8;
      font-size: 12px;
    }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
  `;
}

// ─── HTML Template ─────────────────────────────

function getPanelHTML() {
  return `
    <button class="har-toggle-btn" title="HH Auto-Respond">&#9654;</button>
    <div class="har-header">
      <h3>HH Auto-Respond</h3>
      <div class="har-status">
        <div class="har-status-dot"></div>
        <span class="har-status-text">Ожидание</span>
      </div>
    </div>
    <div class="har-stats">
      <div class="har-stat-item">
        <span class="har-stat-value">0</span>
        <span class="har-stat-label">откликов сегодня</span>
      </div>
      <div class="har-stat-item">
        <span class="har-stat-value">200</span>
        <span class="har-stat-label">осталось</span>
      </div>
      <div class="har-stat-item">
        <span class="har-stat-value">0</span>
        <span class="har-stat-label">ошибок</span>
      </div>
    </div>
    <div class="har-actions">
      <button class="har-btn har-btn-primary" data-action="apply-all">Откликнуться на все</button>
      <button class="har-btn har-btn-secondary" data-action="toggle-status">Пауза</button>
      <button class="har-btn har-btn-danger" data-action="clear">Очистить</button>
    </div>
    <div class="har-vacancy-list">
      <div class="har-empty">Загрузка вакансий...</div>
    </div>
  `;
}

// ─── Utility ───────────────────────────────────

function _escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function _scoreClass(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export { state };
