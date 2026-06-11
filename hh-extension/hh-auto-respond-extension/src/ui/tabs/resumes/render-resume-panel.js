/**
 * UI: RESUMES — Main Resume Panel
 * =================================
 * Renders the parsed resume data in the sidebar resume tab.
 * Wireframe: 6 accordion sections + skills card + gap analysis card.
 */

import { panelState, refs, setActiveResumeState } from '../../state.js';
import { esc } from '../../html.js';
import { getResumePageType } from '../../../parsers/resume-detail.js';
import {
  getInitials, attachSubToggle, updateSkillsSection
} from './resume-helpers.js';
import { renderMyResumesPanel, renderResumeListPanel } from './render-my-resumes.js';
import {
  buildPersonalSection, buildSalarySection,
  buildExperienceSection, buildEducationSection,
  buildLanguagesSection, buildContactsSection
} from './section-builders.js';
import { setActiveResume } from '../../../lib/storage.js';
import { updateAccordionHeader } from './resume-accordion-header.js';

// ═══════════════════════════════════════════════
// MAIN RESUME PANEL RENDER
// ═══════════════════════════════════════════════

/**
 * Render the main resume panel in the sidebar.
 *
 * Shows either:
 *   - Empty state with contextual hint (based on page type)
 *   - Auto-selected first resume from synced list (if _resumeCleared is false)
 *   - Full resume display with 6 accordion sections + visibility warning
 *   - Resume list panel (if on /applicant/resumes with no active resume)
 *
 * Also triggers rendering of the "My Resumes" sync section.
 */
export function renderResumePanel() {
  const container = refs.shadowRoot?.getElementById('res-parsed-data');
  if (!container) return;

  const r = panelState.resume;
  if (!r || !r.id) {
    const synced = panelState.myResumes || [];
    if (!panelState._resumeCleared && synced.length > 0 && synced[0].id) {
      setActiveResumeState(synced[0]);
      setActiveResume(synced[0]);
      renderResumePanel();
      return;
    }
    if (panelState.resumeList && panelState.resumeList.length > 0) {
      renderResumeListPanel();
      return;
    }
    const pageType = getResumePageType();
    let hint = 'Выберите резюме ниже или перейдите на страницу резюме.';
    if (pageType === 'resume-list') {
      hint = 'Нажмите «Синхронизировать все» ниже.';
    } else if (pageType === 'resume-detail') {
      hint = 'Нажмите «Взять со страницы» ниже.';
    }
    container.innerHTML = '<div class="har-empty">Действующее резюме не выбрано.<br>' + hint + '</div>';
    updateAccordionHeader(null);
    return;
  }

  updateAccordionHeader(r);

  // Auto-expand the main accordion
  const body = refs.shadowRoot?.getElementById('res-parsing-body');
  if (body && !body.classList.contains('open')) {
    body.classList.add('open');
    const chevron = body.previousElementSibling?.querySelector('.timeline-chevron');
    if (chevron) chevron.classList.add('open');
  }

  // Build 6 accordion sections matching wireframe
  const vis = r.visibility || (r.hidden ? 'hidden' : 'unknown');
  container.innerHTML =
    '<div class="tl-item">' + buildPersonalSection(r) + '</div>' +
    '<div class="tl-item">' + buildSalarySection(r) + '</div>' +
    '<div class="tl-item">' + buildExperienceSection(r) + '</div>' +
    '<div class="tl-item">' + buildEducationSection(r) + '</div>' +
    '<div class="tl-item">' + buildLanguagesSection(r) + '</div>' +
    '<div class="tl-item">' + buildContactsSection(r) + '</div>' +
    (vis === 'hidden'
      ? '<div style="font-size:10px;color:#92400e;padding:6px 4px 0 28px;">Скрытое резюме не видно работодателям — мэтчинг недоступен</div>'
      : '');

  // Attach sub-accordion toggle listeners
  attachSubToggle('subPersonal', 'chevPersonal');
  attachSubToggle('subSalary', 'chevSalary');
  attachSubToggle('subExp', 'chevExp');
  attachSubToggle('subEdu', 'chevEdu');
  attachSubToggle('subLang', 'chevLang');
  attachSubToggle('subContacts', 'chevContacts');

  updateSkillsSection(r);
  updateResumeScore(r);
  renderMyResumesPanel();
}

// ═══════════════════════════════════════════════
// RESUME SCORE — objective completeness assessment
// ═══════════════════════════════════════════════

function updateResumeScore(r) {
  const section = refs.shadowRoot?.getElementById('res-score-section');
  if (!section) return;

  if (!r || !r.id) { section.style.display = 'none'; return; }
  section.style.display = '';

  // Checklist of important resume fields with weights
  const checks = [
    { label: 'Позиция',        ok: !!(r.title && r.title.length > 2),        weight: 10 },
    { label: 'Имя',            ok: !!(r.name && r.name.length > 1),          weight: 8 },
    { label: 'Зарплата',       ok: !!(r.salary),                             weight: 8 },
    { label: 'Город',          ok: !!(r.address),                            weight: 6 },
    { label: 'Контакты',       ok: !!(r.phone || r.email),                   weight: 10 },
    { label: 'Навыки (3+)',    ok: (r.skills || []).length >= 3,             weight: 15 },
    { label: 'Опыт (1+)',      ok: (r.experience || []).length >= 1,         weight: 15 },
    { label: 'Образование',    ok: (r.education || []).length >= 1,          weight: 10 },
    { label: 'Языки',          ok: (r.languages || []).length >= 1,          weight: 6 },
    { label: 'О себе',         ok: !!(r.additionalInfo && r.additionalInfo.length > 20), weight: 6 },
    { label: 'Занятость/формат', ok: !!(r.employmentType || r.workFormat),   weight: 6 },
  ];

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earnedWeight = checks.filter(c => c.ok).reduce((s, c) => s + c.weight, 0);
  const pct = Math.round((earnedWeight / totalWeight) * 100);

  // Ring chart
  const ring = refs.shadowRoot?.getElementById('res-score-ring');
  if (ring) {
    const deg = Math.round(pct * 3.6);
    const color = pct >= 70 ? '#059669' : pct >= 40 ? '#D97706' : '#DC2626';
    ring.style.background = 'conic-gradient(' + color + ' 0deg ' + deg + 'deg, #e4e4e7 ' + deg + 'deg 360deg)';
    const inner = ring.querySelector('div');
    if (inner) {
      inner.textContent = pct + '%';
      inner.style.color = color;
    }
  }

  // Subtitle
  const subtitle = refs.shadowRoot?.getElementById('res-score-subtitle');
  if (subtitle) {
    if (pct >= 80) subtitle.textContent = 'Отличная полнота — работодатели увидят ключевые данные';
    else if (pct >= 60) subtitle.textContent = 'Хорошая полнота — есть что дополнить';
    else if (pct >= 40) subtitle.textContent = 'Средняя полнота — стоит добавить недостающие разделы';
    else subtitle.textContent = 'Низкая полнота — заполните базовые разделы';
  }

  // Checklist
  const checklist = refs.shadowRoot?.getElementById('res-score-checklist');
  if (checklist) {
    checklist.innerHTML = checks.map(c => {
      const icon = c.ok
        ? '<span style="color:#059669;">&#10003;</span>'
        : '<span style="color:#DC2626;">&#10007;</span>';
      return '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">' + icon +
        ' <span' + (c.ok ? '' : ' style="color:#71717a;"') + '>' + c.label + '</span></div>';
    }).join('');
  }
}
