/**
 * PARSER: RESUME DETAIL — Skills, Experience, Languages & About.
 * Covers: skills, experience, languages, additional info.
 *
 * Split from original parse-resume-sections.js for anti-monolith compliance.
 * Personal data, salary/conditions, contacts moved to parse-resume-personal.js.
 */

import { createLogger } from '../../lib/anti-hallucination.js';
import { parseCompanyCard } from './parse-company-card.js';

const resumeLog = createLogger('Resume');

// ═══════════════════════════════════════════════
// НАВЫКИ (Skills)
// ═══════════════════════════════════════════════

export function parseSkills(dbg, resume) {
  const skillsCard = document.querySelector('[data-qa="skills-card"]');

  if (skillsCard) {
    resume._debug.found.push('skillsBlock (data-qa="skills-card")');
    const skillLevelEls = skillsCard.querySelectorAll('[data-qa^="skill-level-title-"]');
    skillLevelEls.forEach(el => {
      const qa = el.getAttribute('data-qa') || '';
      const lvlMatch = qa.match(/skill-level-title-(\d)/);
      if (lvlMatch) {
        const lvl = lvlMatch[1];
        const text = (el.textContent || '').trim();
        const labels = { '3': 'Продвинутый', '2': 'Средний', '1': 'Начальный' };
        resume.skillLevels[lvl] = labels[lvl] || text;
        resume._debug.found.push('skillLevel' + lvl + ': ' + (labels[lvl] || text));
      }
    });
    const skillTags = skillsCard.querySelectorAll('[data-qa^="skill-tag-"]');
    skillTags.forEach(tag => {
      const text = (tag.textContent || '').trim();
      if (text && text.length > 0 && text.length < 100 && !resume.skills.includes(text)) {
        resume.skills.push(text);
      }
    });
    const blokoTags = skillsCard.querySelectorAll('.bloko-tag__text');
    blokoTags.forEach(tag => {
      const text = (tag.textContent || '').trim();
      if (text && text.length > 0 && text.length < 100 && !resume.skills.includes(text)) {
        resume.skills.push(text);
      }
    });
  } else {
    resume._debug.missing.push('skillsBlock (no data-qa="skills-card")');
  }
  if (resume.skills.length > 0) {
    resume._debug.found.push('skills: ' + resume.skills.length + ' tags');
  } else if (!resume._debug.found.some(f => f.startsWith('skillsBlock'))) {
    resume._debug.missing.push('skills (no tags found)');
  }
}

// ═══════════════════════════════════════════════
// ОПЫТ РАБОТЫ (Experience)
// ═══════════════════════════════════════════════

export function parseExperience(dbg, resume) {
  const expCard = document.querySelector('[data-qa="resume-list-card-experience"]');

  const allCompanyCards = document.querySelectorAll('[data-qa="profile-experience-company-card"]');
  const uniqueCards = [];
  const cardSet = new Set();
  allCompanyCards.forEach(c => {
    if (!cardSet.has(c)) { cardSet.add(c); uniqueCards.push(c); }
  });
  resumeLog.info('Experience: total company-cards on page: ' + uniqueCards.length);

  const expEntries = [];
  const usedStepperElements = new Set();

  // Strategy 1: parse company cards
  uniqueCards.forEach(card => {
    const job = parseCompanyCard(card);
    if (job) expEntries.push(job);
    const stepEl = card.querySelector('[data-qa="magritte-stepper-step-content"]');
    if (stepEl) usedStepperElements.add(stepEl);
  });

  // Strategy 2: parse stepper items NOT covered by company cards
  if (expCard) {
    const stepperItems = expCard.querySelectorAll('[data-qa="magritte-stepper-step-content"]');
    const alreadyParsed = expEntries.length;

    stepperItems.forEach(step => {
      if (usedStepperElements.has(step)) return;
      let parentCard = step.closest('[data-qa="profile-experience-company-card"]');
      if (parentCard && cardSet.has(parentCard)) return;

      const cellLeft = step.querySelector('[data-qa="cell-left-side"]');
      if (!cellLeft) return;
      const texts = cellLeft.querySelectorAll('[data-qa="cell-text-content"]');
      const job = {};
      if (texts.length >= 1) job.position = (texts[0].textContent || '').trim();
      if (texts.length >= 2) {
        let rawPeriod = (texts[1].textContent || '').trim();
        rawPeriod = rawPeriod.replace(/\s*\(\d[^)]+\)$/, '').trim();
        job.period = rawPeriod;
      }
      const parent = step.parentElement;
      if (parent) {
        const parentCellLeft = parent.querySelector('[data-qa="cell-left-side"]');
        if (parentCellLeft && parentCellLeft !== cellLeft) {
          const parentTexts = parentCellLeft.querySelectorAll('[data-qa="cell-text-content"]');
          if (parentTexts.length >= 1 && !job.company) job.company = (parentTexts[0].textContent || '').trim();
          if (parentTexts.length >= 2 && !job.duration) job.duration = (parentTexts[1].textContent || '').trim();
        }
      }
      if (job.position || job.company) expEntries.push(job);
    });

    const stepperAdded = expEntries.length - alreadyParsed;
    if (stepperAdded > 0) {
      resumeLog.info('Experience: +' + stepperAdded + ' from stepper items not in company-cards');
      resume._debug.found.push('experience (stepper supplement): +' + stepperAdded);
    }
  }

  if (expCard) {
    resume._debug.found.push('experienceBlock (data-qa="resume-list-card-experience")');
  } else {
    resume._debug.missing.push('experienceBlock (no container, but ' + uniqueCards.length + ' cards found)');
  }

  resume.experience = expEntries;
  if (expEntries.length > 0) {
    resume._debug.found.push('experience: ' + expEntries.length + ' entries');
  } else {
    resume._debug.missing.push('experience (0 entries extracted)');
  }
}

// ═══════════════════════════════════════════════
// ЯЗЫКИ И ДОП. ИНФОРМАЦИЯ
// ═══════════════════════════════════════════════

export function parseLanguagesAndAbout(dbg, resume) {
  const langTags = document.querySelectorAll('[data-qa="resume-about-card"] .bloko-tag__text, [data-qa="resume-position-card"] .bloko-tag__text');
  langTags.forEach(tag => {
    const t = (tag.textContent || '').trim();
    if (t && t.length > 0 && !resume.skills.includes(t)) {
      resume.languages.push(t);
    }
  });
  if (resume.languages.length > 0) {
    resume._debug.found.push('languages: ' + resume.languages.join(', '));
  }

  const aboutCard = document.querySelector('[data-qa="resume-about-card"]');
  if (aboutCard) {
    const text = (aboutCard.textContent || '').trim();
    if (text.length > 10) {
      resume.additionalInfo = text;
      resume._debug.found.push('additionalBlock (data-qa="resume-about-card")');
    }
  }
}
