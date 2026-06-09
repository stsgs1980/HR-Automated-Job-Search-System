/**
 * Auto-Respond Engine
 * ===================
 * Автоматизация откликов на вакансии через DOM-манипуляцию.
 *
 * МЕТОДИКА РЕАЛИЗАЦИИ (8 шагов, портировано из browser_client.py → apply_to_vacancy):
 * 1. Rate limit check — проверяем лимиты ПЕРЕД действием
 * 2. Navigate — переход на страницу вакансии
 * 3. Find reply button — fallback-цепочка селекторов
 * 4. Click reply — безопасный клик с верификацией
 * 5. Wait popup — MutationObserver ждёт появление popup
 * 6. Handle alerts — relocation confirm, test task warning
 * 7. Fill cover letter — React-safe ввод через native setter
 * 8. Submit — клик по кнопке submit
 * 9. Verify — проверка что отклик ушёл
 *
 * ANTI-HALLUCINATION CHECKS на каждом шаге:
 * - Элемент существует? (не null)
 * - Элемент видим? (offsetParent / display)
 * - Элемент не disabled?
 * - Текст кнопки ожидаемый? (не "Вы уже откликнулись")
 * - Popup появился в течение timeout?
 *
 * PORTED FROM: hh-bot/src/hh/browser_client.py → apply_to_vacancy() (636 строк)
 */

import { findElement, getSelectors } from '../lib/selectors.js';
import {
  safeClick, safeInput, safeGetText, waitForElement,
  verifyElement, createLogger
} from '../lib/anti-hallucination.js';
import { randomDelay, simulateReading, simulateTyping, BatchTimingController } from '../lib/timing.js';
import { rateLimiter } from '../lib/rate-limiter.js';
import {
  getStats, incrementApplied, markAsApplied,
  isAlreadyApplied, getAllSettings
} from '../lib/storage.js';
import { setStatus } from './panel.js';

const log = createLogger('AutoRespond');
const batchController = new BatchTimingController();

/**
 * Откликается на вакансию.
 *
 * @param {string} vacancyId - ID вакансии (из URL: /vacancy/{id})
 * @param {Object} options - { coverLetter?: string, resumeIndex?: number }
 * @returns {Promise<{ success: boolean, reason?: string }>}
 */
export async function applyToVacancy(vacancyId, options = {}) {
  const vacancyUrl = `https://hh.ru/vacancy/${vacancyId}`;

  log.info('Starting apply', { vacancyId, url: vacancyUrl });

  // ─── Step 0: Pre-flight checks ───────────────

  // Проверяем не откликнута ли уже
  if (await isAlreadyApplied(vacancyId)) {
    log.warn('Already applied', { vacancyId });
    return { success: false, reason: 'Уже откликнута' };
  }

  // Rate limit check
  const rateCheck = await rateLimiter.check();
  if (!rateCheck.allowed) {
    log.warn('Rate limited', { vacancyId, reason: rateCheck.reason });
    setStatus('paused', rateCheck.reason);
    return { success: false, reason: rateCheck.reason };
  }

  // Daily limit check
  const limitCheck = await incrementApplied();
  if (!limitCheck.allowed) {
    log.warn('Daily limit reached');
    setStatus('paused', 'Дневной лимит достигнут');
    return { success: false, reason: 'Дневной лимит достигнут' };
  }

  try {
    // ─── Step 1: Navigate to vacancy ──────────
    window.location.href = vacancyUrl;
    // После навигации скрипт перезагрузится, продолжение в _continueApply
    // Сохраняем состояние для продолжения после перезагрузки
    await chrome.storage.local.set({
      pendingApply: {
        vacancyId,
        options,
        step: 'find_reply_button',
        timestamp: Date.now()
      }
    });
    return { success: false, reason: 'Navigating to vacancy (page reload expected)' };
  } catch (e) {
    log.error('Apply failed', { error: e.message });
    return { success: false, reason: e.message };
  }
}

/**
 * Продолжает отклик после навигации на страницу вакансии.
 * Вызывается content script'ом при загрузке страницы /vacancy/*.
 *
 * ANTI-HALLUCINATION: каждый шаг имеет timeout и fallback.
 */
export async function continueApply(pendingApply) {
  const { vacancyId, options } = pendingApply;
  log.info('Continuing apply on vacancy page', { vacancyId });

  try {
    // ─── Step 2: Find reply button ───────────
    setStatus('running', 'Ищу кнопку отклика...');

    const replyBtn = await waitForElement(
      getSelectors('replyButton'),
      15000, // 15 сек timeout
      document
    );

    if (!replyBtn) {
      log.error('Reply button not found', { vacancyId });
      await _failApply(vacancyId, 'Кнопка отклика не найдена');
      return { success: false, reason: 'Кнопка отклика не найдена' };
    }

    // Проверяем текст кнопки — не "Вы уже откликнулись"?
    const btnText = safeGetText(replyBtn);
    if (btnText.includes('уже') || btnText.includes('пригласили') || btnText.includes('откликну')) {
      log.warn('Already applied (button text)', { text: btnText });
      await markAsApplied(vacancyId);
      return { success: false, reason: 'Уже откликнута (по кнопке)' };
    }

    // Имитация чтения вакансии перед откликом
    await simulateReading();

    // ─── Step 3: Click reply button ────────────
    setStatus('running', 'Открываю форму отклика...');

    if (!safeClick(replyBtn, 'reply_button')) {
      await _failApply(vacancyId, 'Не удалось кликнуть кнопку отклика');
      return { success: false, reason: 'Click failed' };
    }

    await randomDelay();

    // ─── Step 4: Wait for popup ───────────────
    setStatus('running', 'Жду popup...');

    const popup = await waitForElement(
      getSelectors('responsePopup'),
      10000
    );

    if (!popup) {
      // Возможно, отклик прошёл без popup (some simple vacancies)
      // Или откликнулись через redirect
      log.warn('Popup not found, checking if already applied');
      const alreadyApplied = findElement('alreadyApplied');
      if (alreadyApplied) {
        await markAsApplied(vacancyId);
        return { success: true, reason: 'Отклик отправлен (без popup)' };
      }
      await _failApply(vacancyId, 'Popup не появился');
      return { success: false, reason: 'Popup не появился' };
    }

    // ─── Step 5: Handle alerts ─────────────────
    await _handleAlerts();

    // ─── Step 6: Fill cover letter ────────────
    if (options.coverLetter) {
      setStatus('running', 'Заполняю сопроводительное письмо...');
      await _fillCoverLetter(options.coverLetter);
    }

    // ─── Step 7: Submit ───────────────────────
    setStatus('running', 'Отправляю отклик...');

    const submitBtn = findElement('submitButton');
    if (!submitBtn) {
      // Fallback: ищем кнопку с текстом "Откликнуться" в popup
      const popupContainer = findElement('responsePopup');
      if (popupContainer) {
        const buttons = popupContainer.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent?.trim();
          if (text === 'Откликнуться' || text === 'Откликнуться на вакансию') {
            safeClick(btn, 'submit_button_fallback');
            break;
          }
        }
      }
    } else {
      safeClick(submitBtn, 'submit_button');
    }

    await randomDelay();

    // ─── Step 8: Verify ────────────────────────
    const success = await _verifyApply(vacancyId);

    if (success) {
      rateLimiter.recordAction();
      await markAsApplied(vacancyId);
      log.info('Apply successful', { vacancyId });
      setStatus('running', 'Отклик отправлен!');
      return { success: true };
    }

    return { success: false, reason: 'Verification failed' };

  } catch (e) {
    log.error('ContinueApply error', { error: e.message });
    await _failApply(vacancyId, e.message);
    return { success: false, reason: e.message };
  }
}

/**
 * Массовый авто-отклик на все вакансии с score >= minMatchScore.
 *
 * МЕТОДИКА:
 * - Сортируем по match score (высокий → низкий)
 * - Для каждой: rate check → apply → wait → next
 * - BatchTimingController вставляет длинные паузы каждые 5 откликов
 * - Прерывается при: лимит, ошибка сети, captcha
 *
 * @param {Array} vacancies - массив вакансий
 * @param {number} minScore - минимальный match score
 * @returns {Promise<{ applied: number, skipped: number, errors: number }>}
 */
export async function applyToAll(vacancies, minScore = 60) {
  const results = { applied: 0, skipped: 0, errors: 0 };
  const eligible = vacancies
    .filter(v => v.status === 'new' && v.hasReply)
    .filter(v => v.matchScore === null || v.matchScore >= minScore)
    .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  log.info(`Starting auto-apply: ${eligible.length} vacancies (score >= ${minScore})`);
  setStatus('running', `Отклик на ${eligible.length} вакансий...`);

  for (let i = 0; i < eligible.length; i++) {
    const v = eligible[i];

    // Rate check
    const rateCheck = await rateLimiter.check();
    if (!rateCheck.allowed) {
      log.warn('Auto-apply stopped: rate limited', { reason: rateCheck.reason });
      setStatus('paused', rateCheck.reason);
      break;
    }

    // Batch timing
    await batchController.betweenApplications();

    setStatus('running', `Отклик ${i + 1}/${eligible.length}: ${v.title}`);

    const result = await applyToVacancy(v.id);
    if (result.success) {
      results.applied++;
    } else if (result.reason === 'Уже откликнута') {
      results.skipped++;
    } else {
      results.errors++;
    }
  }

  setStatus('idle', `Готово: ${results.applied} откликов`);
  log.info('Auto-apply finished', results);
  return results;
}

// ─── Internal helpers ──────────────────────────

/**
 * Обрабатывает алерты в popup: relocation, test task, indirect employer.
 *
 * МЕТОДИКА ВЕРИФИКАЦИИ:
 * - Проверяем каждый тип alert'а по отдельности
 * - Кликаем "Продолжить" или закрываем
 * - Если несколько alert'ов — обрабатываем все
 */
async function _handleAlerts() {
  const alerts = [
    { name: 'relocation', selector: 'relocationConfirm', action: 'confirm' },
    { name: 'testTask', selector: 'testTaskWarning', action: 'acknowledge' },
    { name: 'indirectEmployer', selector: 'indirectEmployerAlert', action: 'acknowledge' }
  ];

  for (const alert of alerts) {
    const el = findElement(alert.selector);
    if (el && isVisible(el)) {
      log.info(`Handling alert: ${alert.name}`);

      if (alert.action === 'confirm') {
        // Ищем кнопку "Продолжить" в alert
        const btns = el.closest('[data-qa="magritte-alert"]')?.querySelectorAll('button') || [];
        for (const btn of btns) {
          if (btn.textContent?.includes('Продолжить') || btn.textContent?.includes('ОК')) {
            safeClick(btn, `alert_${alert.name}_confirm`);
            await randomDelay();
            break;
          }
        }
      }
    }
  }
}

/**
 * Заполняет сопроводительное письмо.
 *
 * МЕТОДИКА (React-safe):
 * - Используем simulateTyping() для посимвольного ввода
 * - Native setter + synthetic events для React 18 state updates
 * - Проверяем что textarea видна и в фокусе
 */
async function _fillCoverLetter(letter) {
  // Открываем блок cover letter если скрыт
  const addLetterBtn = findElement('addCoverLetter');
  if (addLetterBtn && addLetterBtn.offsetParent !== null) {
    safeClick(addLetterBtn, 'add_cover_letter');
    await randomDelay();
  }

  // Находим textarea
  const textarea = await waitForElement(
    getSelectors('coverLetterInput'),
    5000
  );

  if (!textarea) {
    log.warn('Cover letter textarea not found');
    return;
  }

  // React-safe ввод
  await simulateTyping(textarea, letter);
  await randomDelay();
}

/**
 * Проверяет что отклик был отправлен.
 * ANTI-HALLUCINATION: проверяем несколько индикаторов успеха.
 */
async function _verifyApply(vacancyId) {
  // Ждём исчезновение popup (знак что сабмит прошёл)
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Проверяем: popup исчез?
  const popup = findElement('responsePopup');
  if (!popup) return true; // Popup закрылся = успех

  // Проверяем: кнопка изменилась?
  const replyBtn = findElement('replyButton');
  if (replyBtn) {
    const text = safeGetText(replyBtn);
    if (text.includes('уже') || text.includes('откликну')) {
      return true;
    }
  }

  // Проверяем: "already applied" индикатор?
  const alreadyApplied = findElement('alreadyApplied');
  if (alreadyApplied) return true;

  return false;
}

async function _failApply(vacancyId, reason) {
  const stats = await getStats();
  stats.errorsToday = (stats.errorsToday || 0) + 1;
  await chrome.storage.local.set({ stats });

  // Adaptive slowdown при ошибках
  rateLimiter.adaptiveSlowdown('error');

  setStatus('error', reason);
  log.error('Apply failed', { vacancyId, reason });
}

function isVisible(el) {
  if (!el) return false;
  return el.offsetParent !== null;
}
