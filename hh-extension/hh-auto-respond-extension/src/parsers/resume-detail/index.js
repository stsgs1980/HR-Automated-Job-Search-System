/**
 * BARRIER: resume-detail/index.js
 * ==============================
 * Public API for resume-detail parser module.
 * Re-exports all functions from sub-modules so that
 * existing import paths remain unchanged.
 */

import { safeGetText, createLogger } from '../../lib/anti-hallucination.js';
import { parseResume } from './parse-resume.js';
import { diagnoseResumeDOM } from './diagnose.js';

const resumeLog = createLogger('Resume');

// ═══════════════════════════════════════════════
// PAGE TYPE DETECTION
// ═══════════════════════════════════════════════

export function getResumePageType() {
  const path = window.location.pathname;
  if (/\/resume\/[a-f0-9]+/.test(path)) return 'resume';
  if (path.includes('/applicant/resumes')) return 'resume-list';
  return 'other';
}

// ═══════════════════════════════════════════════
// EXPAND HIDDEN SECTIONS
// ═══════════════════════════════════════════════

export async function expandHiddenSections() {
  const expandButtons = document.querySelectorAll('[data-qa="profile-experience-viewAll"], button');
  const clicked = [];
  expandButtons.forEach(btn => {
    const text = (btn.textContent || '').trim().toLowerCase();
    if (text.includes('посмотреть всё') || text.includes('показать все') || text.includes('показать ещё') ||
        text.includes('посмотреть все') || text.includes('развернуть') || text.includes('expand')) {
      try {
        btn.click();
        clicked.push(text);
      } catch (e) {}
    }
  });
  if (clicked.length > 0) {
    resumeLog.info('Expanded hidden sections: ' + clicked.join(', '));
    // Ждём подгрузки контента
    await new Promise(r => setTimeout(r, 1500));
  }
}

// ═══════════════════════════════════════════════
// PARSE RESUME LIST
// ═══════════════════════════════════════════════

export function parseResumeList() {
  const resumes = [];
  // Ищем все ссылки на резюме на странице
  const links = document.querySelectorAll('a[href*="/resume/"]');
  links.forEach(link => {
    const href = link.getAttribute('href') || '';
    const hashMatch = href.match(/\/resume\/([a-f0-9]+)/);
    if (!hashMatch) return;
    const id = hashMatch[1];
    // Проверяем что не дубликат
    if (resumes.find(r => r.id === id)) return;
    resumes.push({
      id: id,
      title: safeGetText(link) || 'Без названия',
      url: href.startsWith('http') ? href : 'https://hh.ru' + href
    });
  });
  resumeLog.info('Resume list: ' + resumes.length + ' resumes found');
  return resumes;
}

// ═══════════════════════════════════════════════
// RE-EXPORTS
// ═══════════════════════════════════════════════

export { parseResume, diagnoseResumeDOM };
