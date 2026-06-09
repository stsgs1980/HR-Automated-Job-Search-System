/**
 * Popup Script — manages popup UI interactions.
 * Communicates with content scripts via chrome.runtime messages.
 */

// ─── Tab Switching ────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

    if (tab.dataset.tab === 'logs') loadLogs();
    if (tab.dataset.tab === 'dashboard') loadStats();
  });
});

// ─── Toggle Switches ──────────────────────────

document.querySelectorAll('.toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
  });
});

// ─── Save Settings ────────────────────────────

document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
  const settings = {
    mode: document.getElementById('setting-mode').value,
    dailyLimit: parseInt(document.getElementById('setting-daily-limit').value) || 200,
    minMatchScore: parseInt(document.getElementById('setting-min-score').value) || 60,
    searchInterval: parseInt(document.getElementById('setting-interval').value) || 30,
    showMatchScore: document.getElementById('toggle-score').classList.contains('active'),
    confirmBeforeApply: document.getElementById('toggle-confirm').classList.contains('active'),
    autoScroll: document.getElementById('toggle-scroll').classList.contains('active')
  };

  await chrome.storage.local.set({ settings });
  // Notify content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'settings-updated', settings });
  });

  // Visual feedback
  const btn = document.getElementById('btn-save-settings');
  btn.textContent = 'Сохранено!';
  setTimeout(() => { btn.textContent = 'Сохранить настройки'; }, 1500);
});

// ─── Save Template ────────────────────────────

document.getElementById('btn-save-template')?.addEventListener('click', async () => {
  const template = {
    coverLetter: document.getElementById('template-cover-letter').value,
    tone: document.getElementById('setting-tone').value
  };

  await chrome.storage.local.set({ template });
  const btn = document.getElementById('btn-save-template');
  btn.textContent = 'Сохранено!';
  setTimeout(() => { btn.textContent = 'Сохранить шаблон'; }, 1500);
});

// ─── Reset Stats ──────────────────────────────

document.getElementById('btn-reset-stats')?.addEventListener('click', async () => {
  if (confirm('Сбросить всю статистику? Это действие нельзя отменить.')) {
    await chrome.storage.local.set({
      stats: { totalApplied: 0, appliedToday: 0, interviewInvites: 0, responsesReceived: 0, skipsToday: 0, errorsToday: 0, lastActivity: null },
      appliedVacancies: [],
      skippedVacancies: []
    });
    loadStats();
  }
});

// ─── Load Data ─────────────────────────────────

async function loadStats() {
  const data = await chrome.storage.local.get(['stats', 'settings']);
  const stats = data.stats || {};
  const settings = data.settings || {};

  document.getElementById('stat-applied-today').textContent = stats.appliedToday || 0;
  document.getElementById('stat-interviews').textContent = stats.interviewInvites || 0;
  document.getElementById('stat-errors').textContent = stats.errorsToday || 0;
  document.getElementById('stat-total').textContent = stats.totalApplied || 0;

  const applied = stats.appliedToday || 0;
  const limit = settings.dailyLimit || 200;
  document.getElementById('limit-text').textContent = `${applied} / ${limit}`;
  document.getElementById('progress-fill').style.width = `${Math.min(100, (applied / limit) * 100)}%`;

  // Load settings into form
  document.getElementById('setting-mode').value = settings.mode || 'manual';
  document.getElementById('setting-daily-limit').value = settings.dailyLimit || 200;
  document.getElementById('setting-min-score').value = settings.minMatchScore || 60;
  document.getElementById('setting-interval').value = settings.searchInterval || 30;
}

async function loadLogs() {
  const data = await chrome.storage.local.get('logs');
  const logs = (data.logs || []).slice(-50).reverse();
  const container = document.getElementById('log-list');

  if (logs.length === 0) {
    container.innerHTML = '<div class="log-entry"><span class="log-msg">Нет логов</span></div>';
    return;
  }

  container.innerHTML = logs.map(entry => {
    const time = new Date(entry.ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `<div class="log-entry ${entry.level}">
      <span class="log-time">${time}</span>
      <span class="log-msg">[${entry.module}] ${entry.action}</span>
    </div>`;
  }).join('');
}

// ─── Init ──────────────────────────────────────

loadStats();
loadLogs();

// Auto-refresh stats every 5s
setInterval(loadStats, 5000);
