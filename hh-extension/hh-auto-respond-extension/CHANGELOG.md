# HH Auto-Respond — Changelog

Все значимые изменения в расширении фиксируются в этом файле.
Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).

---

## [1.3.0] — 2026-06-09

### Исправлено
- **Критический баг: 8 из 11 полей резюме не парсились** на Magritte-страницах
  - Причина: селекторы использовали CSS-классы, хэшируемые Magritte при каждом деплое
  - Результат: gender, age, address, specialization, skills, experience, education, languages — все ✗
  - Только title, salary и skill-level-3 находились

### Переписано
- **`parseResume()` — полностью новая стратегия парсинга (Magritte-safe)**:
  - **Автообнаружение секций** по тексту h2/h3 заголовков ("Опыт работы", "Образование" и т.д.)
  - Не зависит от конкретных `data-qa` или CSS-классов — работает при любой версии Magritte
  - Gender/age/address — парсинг из текстового содержимого рядом с h1
  - Experience — поиск по ссылкам `/employer/`, тегам b/strong, паттернам дат
  - Education — поиск по ссылкам и тегам b/strong внутри секции
  - Skills — комбинированный поиск: `data-qa="skills-table"` + заголовок "Навыки"
  - Languages — bloko-tag внутри секции с заголовком "Языки"
- **`HH_SELECTORS`** — полная чистка от Magritte-хэшированных CSS-классов:
  - Убраны: `.resume-block__title-text`, `.resume-block__salary`, `h1.bloko-header-section-1`,
    `h2.bloko-header-1`, `.applicant-resumes__resume`, `.resume-block-item`,
    `.vacancy-serp-item__compensation`, `.vacancy-description`, `.vacancy-response-popup`,
    `textarea.bloko-textarea`, `button.bloko-button_primary`, `.bloko-tag__section`
  - Убраны из `parseResume()`: `.bloko-text_strong`, `.bloko-text`, `[class*="strong"]`,
    `[class*="description"]`, `[class*="experience"]` — все Magritte-хэшированные
  - Заменены на: `b, strong, p` + `data-qa` атрибуты (стабильные)
  - Внутренние селекторы опыта/образования: `b/strong` вместо `.bloko-text_strong`

---

## [1.2.0] — 2026-06-09

### Исправлено
- **Критический баг**: кнопка "Загрузить с текущей страницы" вызывала `parseResume()`
  на странице `/applicant/resumes` (список резюме), что всегда давало ошибку
  "Could not parse resume from current page", т.к. `parseResume()` ожидает URL `/resume/{hash}`
- **Причина**: обработчик `hh-ar-load-resume` не проверял тип текущей страницы

### Добавлено
- **Контекстно-зависимая логика кнопки "Загрузить"**:
  - На `/resume/{hash}` — парсит конкретное резюме (как раньше)
  - На `/applicant/resumes` — парсит и показывает список резюме
  - На других страницах — предупреждает что нужно перейти на правильную страницу
- **`getResumePageType()`** — определяет тип страницы по URL
- **`renderResumeListPanel()`** — рендерит список резюме в sidebar
  - Кликабельные ссылки на каждое резюме (открывает в новой вкладке)
  - Бейдж "loaded" для уже загруженного резюме
  - Подсказка для пользователя
- **Авто-сохранение списка резюме** в `panelState.resumeList` при заходе на `/applicant/resumes`
- **CSS для списка резюме**: `.har-resume-list-*` стили
- **Кнопка "Open on hh.ru"** в карточке загруженного резюме

### Изменено
- `panelState` расширен: добавлены `resume`, `resumeList`, `activeTab`
- `renderResumePanel()` теперь проверяет наличие списка и тип страницы
  перед показом заглушки

---

## [1.1.0] — 2026-06-09

### Добавлено
- **Парсер резюме** — полная поддержка Magritte/Bloko DOM структуры
  - 30+ CSS селекторов на основе `data-qa` (стабильные, не зависят от деплоя)
  - Парсинг: позиция, зарплата, город, пол, возраст, специализации
  - Навыки с определением уровней (Продвинутый / Средний / Начальный)
  - Опыт работы: компания, должность, период, описание
  - Образование: название, год окончания
  - Языки: название и уровень владения
  - Дополнительная информация (гражданство, готовность к переезду и т.д.)
- **Вкладка "Моё резюме"** в sidebar
  - Отображение всех распарсенных данных
  - Теги навыков с цветовым оформлением
  - Список опыта работы с должностями и периодами
  - Кнопка "Загрузить с текущей страницы"
  - Кнопка "Перейти к списку резюме" (открывает /applicant/resumes)
- **Авто-парсинг** при открытии страницы резюме (`/resume/{hash}`)
- **Сохранение резюме** в `chrome.storage.local` между сессиями
- **Debug-панель** — раскрывающийся блок с результатами по каждому селектору
  - ✓ найденные поля (зелёные)
  - ✗ отсутствующие поля (красные)
- **Табовая система** в sidebar (Вакансии / Моё резюме)

### Изменено
- `initPageLogic()` расширен: обработка `/resume/{hash}` и `/applicant/resumes`

### Технические детали
- Магриттовские CSS-классы с хешами (напр. `magritte-card___bhGKz_8-5-13`) НЕ используются
  из-за нестабильности. Только `data-qa` атрибуты и Bloko BEM классы.
- Навыки извлекаются только из блока `[data-qa="skills-table"]`,
  чтобы не захватить языки и теги из других секций.

---

## [1.0.0] — 2026-06-09

### Добавлено
- **Chrome Extension (Manifest V3)** — базовая архитектура
  - `manifest.json` — MV3 конфигурация
  - `content.js` — единый бандл (MV3 не поддерживает ES modules в content scripts)
  - `background/index.js` — Service Worker
  - `popup/` — 4-табовый popup (Stats, Settings, Templates, Logs)
  - `icons/` — PNG иконки 16/48/128px
- **FAB (Floating Action Button)** — 56px, bottom-right
  - 3 состояния: серый (проверка) → красный (не авторизован) → синий (авторизован)
  - Анимация при наведении (scale 1.08)
- **Sidebar** — 360px, right-side, Shadow DOM изоляция
  - Шапка с названием и версией
  - Блок авторизации с кнопкой входа
  - Статистика: отклики / осталось / ошибки
  - Прогресс-бар дневного лимита
  - Кнопки: "Откликнуться на все", "Пауза", "Обновить"
  - Список вакансий с кнопками отклика
- **Определение авторизации** — `checkAuth()`
  - 13 CSS селекторов (data-qa + class-based)
  - Fallback по cookies (hhruuid, _HH-RU, hhtoken)
  - Поллинг каждые 2 секунды
- **Парсер вакансий** — `parseVacanciesFromPage()`
  - Селекторы для карточек: title, company, salary, location, experience, tags
  - Фильтрация: уже откликнутые, чёрный список компаний
  - Валидация данных (title, company, url, id)
- **Anti-Hallucination** — безопасные DOM операции
  - `safeGetText()` — проверка видимости перед извлечением текста
  - `safeClick()` — проверка disabled, visibility
  - `safeInput()` — корректная установка значения через property setter
  - `validateVacancyData()` — 4-уровневая проверка
  - `waitForElement()` — MutationObserver с таймаутом
- **Rate Limiter** — token bucket + adaptive slowdown
  - 200/день, 30/час, 30с интервал, burst max 5
  - Адаптивный фактор при 429/slow/captcha
- **Storage** — `chrome.storage.local` wrapper
  - Настройки по умолчанию
  - Статистика с ежедневным сбросом
  - Список откликнутых вакансий
  - Чёрный список компаний
- **SPA Observer** — MutationObserver для страницы поиска
  - Авто-обновление списка вакансий при навигации без перезагрузки

### Известные проблемы
- `offsetParent !== null` проверка в v1.0.0 ломала авторизацию
  (исправлено в hotfix, включённом в 1.1.0)

---

## [1.0.0-hotfix] — 2026-06-09 (не релизная)

### Исправлено
- **Критический баг**: `offsetParent === null` для `position:fixed` элементов
  - hh.ru header — фиксированный, поэтому `offsetParent` всегда `null`
  - Результат: авторизация НИКОГДА не определялась (FAB всегда красная)
  - Решение: заменено на `getComputedStyle().display/visibility` проверку
  - Затронуты: `checkAuth()`, `findElement()`, `waitForElement()`, `safeClick()`
- **Расширен набор селекторов авторизации**: 3 → 13 + cookie fallback

---

[1.1.0]: https://github.com/stsgs1980/HR-Automated-Job-Search-System/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/stsgs1980/HR-Automated-Job-Search-System/releases/tag/v1.0.0
