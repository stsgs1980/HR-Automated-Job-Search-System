/**
 * PARSER: RESUME DETAIL — Personal data, salary/conditions, contacts.
 * Extracted from parse-resume-sections.js for anti-monolith compliance.
 */

import { safeGetText, createLogger } from '../../lib/anti-hallucination.js';

const resumeLog = createLogger('Resume');

// ═══════════════════════════════════════════════
// ПЕРСОНАЛЬНЫЕ ДАННЫЕ (name, gender, age, address)
// ═══════════════════════════════════════════════

export function parsePersonalData(titleEl, dbg, resume) {
  const personalText = [];

  // Имя: hh.ru показывает имя вверху страницы резюме
  const nameEl = document.querySelector('[data-qa="resume-personal-name"]');
  if (nameEl) {
    const nameText = (nameEl.textContent || '').trim();
    if (nameText && nameText.length > 1 && nameText.length < 100) {
      resume.name = dbg('resumeName (data-qa)', nameText);
    }
  }
  if (!resume.name) {
    const posCard = document.querySelector('[data-qa="resume-position-card"]');
    if (posCard) {
      const candidates = posCard.querySelectorAll('span, div, p, h1, h2, h3');
      for (const el of candidates) {
        const t = (el.textContent || '').trim();
        if (t && t.length > 2 && t.length < 80 && t !== resume.title && t !== resume.salary &&
            /^[А-ЯЁ][а-яё]+ [А-ЯЁ]/.test(t) && !/\d/.test(t)) {
          resume.name = dbg('resumeName (fallback)', t);
          break;
        }
      }
    }
  }

  // Собираем текст из position-card и соседних блоков
  const posCard = document.querySelector('[data-qa="resume-position-card"]');
  if (posCard) {
    posCard.querySelectorAll('span, div, p, a').forEach(el => {
      const t = (el.textContent || '').trim();
      if (t && t.length > 0 && t.length < 200) personalText.push(t);
    });
  }
  const titleContainer = titleEl ? titleEl.closest('div[data-qa], section') || titleEl.parentElement : null;
  if (titleContainer) {
    titleContainer.querySelectorAll('span, div, p, a').forEach(el => {
      if (el === titleEl || titleEl.contains(el)) return;
      const t = (el.textContent || '').trim();
      if (t && t.length > 0 && t.length < 200 && !personalText.includes(t)) personalText.push(t);
    });
  }

  const genderPatterns = [/\bмужчина\b/i, /\bженщина\b/i, /\bмужской\b/i, /\bженский\b/i, /\bmale\b/i, /\bfemale\b/i];
  const agePattern = /(?:полных\s*)?(\d{2})\s*(?:лет|год|года)/i;
  const agePattern2 = /(\d{2})\s*years?\s*old/i;

  for (const t of personalText) {
    if (!resume.gender) {
      for (const gp of genderPatterns) {
        const m = t.match(gp);
        if (m) { resume.gender = dbg('resumeGender', m[0]); break; }
      }
    }
    if (!resume.age) {
      const m = t.match(agePattern) || t.match(agePattern2);
      if (m) { resume.age = dbg('resumeAge', m[1] + ' лет'); }
    }
    if (!resume.address && t.length > 3) {
      const isGender = genderPatterns.some(p => p.test(t));
      const isAge = agePattern.test(t) || agePattern2.test(t);
      const isName = resume.name && t === resume.name;
      if (!isGender && !isAge && !isName && !t.includes('руб') && !t.includes('USD') &&
          !t.includes('з/п') && !t.includes('уровень') && !t.includes('доход') &&
          t !== resume.salary && t !== resume.title) {
        if (/[А-Яа-яЁё]{2,}/.test(t) && t.length < 80) {
          resume.address = dbg('resumeAddress', t);
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════
// ЗАРПЛАТА И УСЛОВИЯ (employment, format, schedule, relocation)
// ═══════════════════════════════════════════════

export function parseSalaryConditions(dbg, resume) {
  const posCard = document.querySelector('[data-qa="resume-position-card"]');
  if (!posCard) {
    resume._debug.missing.push('salaryConditions (no position-card)');
    return;
  }

  const texts = [];
  posCard.querySelectorAll('span, p, div').forEach(el => {
    if (el.children.length > 5) return;
    const t = (el.textContent || '').trim();
    if (t && t.length > 2 && t.length < 100) texts.push(t);
  });

  const empPatterns = [/\b(Полная занятость)\b/i, /\b(Частичная занятость)\b/i, /\b(Проектная работа)\b/i, /\b(Стажировка)\b/i];
  const fmtPatterns = [/\b(Удал[а-яё]+ работа)\b/i, /\b(Офис)\b/i, /\b(Гибрид)\b/i, /\b(Смешанный формат)\b/i];
  const schedPatterns = [/\b(Гибкий график)\b/i, /\b(Полный день)\b/i, /\b(Сменный график)\b/i, /\b(Вахтовый метод)\b/i];
  const relocPatterns = [/\b(Не готов к переезду)\b/i, /\b(Готов к переезду)\b/i, /\b(Хочу переехать)\b/i];

  for (const t of texts) {
    if (!resume.employmentType) { for (const p of empPatterns) { const m = t.match(p); if (m) { resume.employmentType = dbg('employmentType', m[1]); break; } } }
    if (!resume.workFormat) { for (const p of fmtPatterns) { const m = t.match(p); if (m) { resume.workFormat = dbg('workFormat', m[1]); break; } } }
    if (!resume.schedule) { for (const p of schedPatterns) { const m = t.match(p); if (m) { resume.schedule = dbg('schedule', m[1]); break; } } }
    if (!resume.relocation) { for (const p of relocPatterns) { const m = t.match(p); if (m) { resume.relocation = dbg('relocation', m[1]); break; } } }
  }
}

// ═══════════════════════════════════════════════
// КОНТАКТЫ (phone, email, telegram)
// ═══════════════════════════════════════════════

export function parseContacts(dbg, resume) {
  const phoneEl = document.querySelector('[data-qa="resume-contact-phone"] a, [data-qa="resume-contact-phone"]');
  if (phoneEl) {
    const t = (phoneEl.textContent || '').trim();
    if (t && /[\d+\-()]/.test(t)) resume.phone = dbg('phone', t);
  }

  const emailEl = document.querySelector('[data-qa="resume-contact-email"] a, [data-qa="resume-contact-email"]');
  if (emailEl) {
    const t = (emailEl.textContent || '').trim();
    if (t && t.includes('@')) resume.email = dbg('email', t);
  }

  const contactBlock = document.querySelector('[data-qa="resume-contacts-block"], [data-qa="resume-block-contacts"]');
  if (contactBlock) {
    const contactLinks = contactBlock.querySelectorAll('a[href*="t.me/"]');
    for (const link of contactLinks) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/t\.me\/(\w+)/);
      if (match) { resume.telegram = dbg('telegram', '@' + match[1]); break; }
    }
    if (!resume.telegram) {
      const text = (contactBlock.textContent || '');
      const m = text.match(/@(\w{4,})/);
      if (m) resume.telegram = dbg('telegram', '@' + m[1]);
    }
  }
}
