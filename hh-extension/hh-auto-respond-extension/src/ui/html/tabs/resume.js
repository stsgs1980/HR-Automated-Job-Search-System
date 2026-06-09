/**
 * TAB 2: RESUME
 */
import { ICONS } from '../icons.js';

export function getResumeSection() {
  return `<div class="tab-section" id="tab-resume">
    <div class="card fade-in" style="margin-bottom:12px;">
      <div class="timeline-toggle" style="display:flex;align-items:center;justify-content:space-between;" data-timeline="resume-parsing">
        <div style="display:flex;align-items:center;gap:10px;">
          <div id="res-avatar" style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#059669,#10B981);display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:700;flex-shrink:0;">?</div>
          <div>
            <div id="res-title" style="font-size:13px;font-weight:600;">Резюме не загружено</div>
            <div id="res-subtitle" style="font-size:11px;color:#71717a;margin-top:1px;">Нажмите "Загрузить" для парсинга</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span id="res-parsed-badge" class="badge badge-zinc" style="font-size:11px;">не спарсено</span>
          ${ICONS.chevronDown}
        </div>
      </div>
      <div class="timeline-body" id="res-parsing-body" style="margin-top:12px;padding-top:4px;">
        <div id="res-parsed-data">
          <div style="padding:12px;text-align:center;font-size:11px;color:#71717a;">Данные появятся после парсинга</div>
        </div>
        <div style="padding-top:12px;padding-left:24px;">
          <button class="btn btn-primary btn-sm" data-action="load-resume" style="width:100%;">
            ${ICONS.refresh} Загрузить с текущей страницы
          </button>
        </div>
      </div>
    </div>
    <div id="res-skills-section" class="card fade-in" style="margin-bottom:12px;display:none;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <span style="font-size:12px;font-weight:600;">Навыки из резюме</span>
        <span class="badge badge-zinc" id="res-skills-count">0 навыков</span>
      </div>
      <div id="res-skills-list" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
    </div>
    <div id="res-gap-section" class="card fade-in" style="display:none;">
      <div style="font-size:12px;font-weight:600;margin-bottom:10px;">Анализ навыков</div>
      <div id="res-gap-content" style="font-size:11px;color:#71717a;">Анализ доступен после парсинга вакансий</div>
    </div>
  </div>`;
}
