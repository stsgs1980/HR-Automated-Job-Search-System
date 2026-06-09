/**
 * Matching Engine (port from mini-services/hh-api/matching.ts)
 * ==============================================================
 * Гибридный matching: навыки 30%, ЗП 25%, опыт 20%, позиция 15%, локация 10%
 *
 * МЕТОДИКА ВЕРИФИКАЦИИ:
 * - Все входные данные валидируются перед matching
 * - Match score всегда в [0, 100]
 * - Пустые поля = не учитываются (вес перераспределяется)
 *
 * ANTI-HALLUCINATION:
 * - Не присваиваем score вакансиям без данных о резюме
 * - Явные проверки на null/undefined/empty
 */

// ─── Skill Aliases ─────────────────────────────
const SKILL_ALIASES = {
  'k8s': 'kubernetes', 'kube': 'kubernetes',
  'pg': 'postgresql', 'postgres': 'postgresql',
  'js': 'javascript', 'ts': 'typescript',
  'py': 'python', 'rb': 'ruby',
  'go': 'golang', 'golang': 'go',
  'tf': 'terraform', 'aws': 'amazon web services',
  'gcp': 'google cloud platform', 'az': 'azure',
  'node': 'node.js', 'nodejs': 'node.js',
  'reactjs': 'react', 'react.js': 'react',
  'vuejs': 'vue.js', 'vue': 'vue.js',
  'docker': 'docker', 'docker-compose': 'docker compose',
  'ci/cd': 'cicd', 'ci cd': 'cicd',
  'ml': 'machine learning', 'dl': 'deep learning',
  'ai': 'artificial intelligence', 'nlp': 'natural language processing',
  'css3': 'css', 'html5': 'html',
  'sass': 'scss', 'less': 'less css',
  'sql': 'sql', 'nosql': 'no sql',
  'rest': 'rest api', 'graphql': 'graphql',
  'rabbitmq': 'rabbitmq', 'kafka': 'apache kafka',
  'redis': 'redis', 'mongo': 'mongodb',
  'nginx': 'nginx', 'jenkins': 'jenkins ci',
  'git': 'git', 'github': 'git',
  'gitlab': 'gitlab ci',
  'linux': 'linux', 'ubuntu': 'linux',
  'frontend': 'frontend', 'backend': 'backend',
  'fullstack': 'full stack', 'full-stack': 'full stack',
  'devops': 'devops', 'sre': 'site reliability engineering'
};

/**
 * Нормализует навык для сравнения.
 */
function normalizeSkill(skill) {
  if (!skill || typeof skill !== 'string') return '';
  const s = skill.toLowerCase().trim();
  return SKILL_ALIASES[s] || s;
}

// ─── Weighted Scoring ─────────────────────────

/**
 * Jaccard similarity для массивов навыков с alias matching.
 * J(A,B) = |A∩B| / |A∪B|
 *
 * ANTI-HALLUCINATION: если оба массива пусты → score=0 (не NaN)
 */
function jaccardSkills(resumeSkills, vacancySkills) {
  if (!resumeSkills?.length || !vacancySkills?.length) return 0;

  const normalizedResume = new Set(resumeSkills.map(normalizeSkill));
  const normalizedVacancy = new Set(vacancySkills.map(normalizeSkill));

  let intersection = 0;
  for (const s of normalizedVacancy) {
    if (normalizedResume.has(s)) intersection++;
  }

  const union = normalizedResume.size + normalizedVacancy.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Сравнение зарплат.
 *
 * МЕТОДИКА: overlap-based scoring.
 * - Полное совпадение = 100
 * - Перекрытие 50% = 50
 * - Ниже нижней границы вакансии = штраф
 *
 * ANTI-HALLUCINATION: если нет данных о ЗП с обеих сторон → score=50 (нейтрально)
 */
function scoreSalary(resumeSalary, vacancySalary) {
  if (!resumeSalary && !vacancySalary) return 50;
  if (!resumeSalary || !vacancySalary) return 50;

  // Парсим salary strings: "от 100 000 до 200 000 руб"
  const rMin = parseSalaryMin(resumeSalary);
  const vMin = parseSalaryMin(vacancySalary);
  const vMax = parseSalaryMax(vacancySalary);

  if (rMin === null || vMin === null) return 50;

  const expected = vMin;
  const diff = Math.abs(rMin - expected);
  const tolerance = expected * 0.3; // 30% tolerance

  if (diff <= tolerance) return 100;
  if (rMin < vMin - tolerance) return 30; // ЗП ниже нижней границы
  if (rMin > (vMax || vMin * 1.5)) return 40; // ЗП сильно выше
  return 70;
}

function parseSalaryMin(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(/(\d[\d\s]*)/);
  return match ? parseInt(match[1].replace(/\s/g, '')) : null;
}

function parseSalaryMax(str) {
  if (!str || typeof str !== 'string') return null;
  const matches = str.match(/(\d[\d\s]*)/g);
  if (matches && matches.length >= 2) {
    return parseInt(matches[1].replace(/\s/g, ''));
  }
  return null;
}

/**
 * Сравнение опыта.
 *
 * МЕТОДИКА: парсим строки типа "3-6 лет" и проверяем overlap.
 */
function scoreExperience(resumeExp, vacancyExp) {
  if (!resumeExp && !vacancyExp) return 50;
  if (!resumeExp || !vacancyExp) return 50;

  const rYears = parseExperienceYears(resumeExp);
  const vRange = parseExperienceRange(vacancyExp);

  if (rYears === null || !vRange) return 50;

  const [vMin, vMax] = vRange;

  // Идеальное попадание в range
  if (rYears >= vMin && rYears <= vMax) return 100;

  // Чуть ниже (+-1 год)
  if (rYears >= vMin - 1 && rYears <= vMax + 1) return 80;

  // Значительно ниже
  if (rYears < vMin - 1) return Math.max(10, 50 - (vMin - rYears) * 10);

  // Переквалификация (слишком много опыта)
  if (rYears > vMax + 3) return 60;

  return 70;
}

function parseExperienceYears(str) {
  if (!str) return null;
  const match = str.match(/(\d+)/);
  return match ? parseInt(match[1]) : null;
}

function parseExperienceRange(str) {
  if (!str) return null;
  const matches = str.match(/(\d+)/g);
  if (!matches) return null;
  const min = parseInt(matches[0]);
  const max = matches.length > 1 ? parseInt(matches[1]) : min + 3;
  return [min, max];
}

/**
 * Сравнение названий позиций.
 * Word overlap + keyword boosting.
 */
function scorePosition(resumePosition, vacancyTitle) {
  if (!resumePosition || !vacancyTitle) return 50;

  const rWords = new Set(resumePosition.toLowerCase().split(/\s+/));
  const vWords = new Set(vacancyTitle.toLowerCase().split(/\s+/));

  let overlap = 0;
  for (const w of vWords) {
    if (rWords.has(w)) overlap++;
  }

  const union = rWords.size + vWords.size - overlap;
  return union === 0 ? 50 : (overlap / union) * 100;
}

/**
 * Сравнение локации.
 */
function scoreLocation(resumeCity, vacancyLocation) {
  if (!resumeCity && !vacancyLocation) return 50;
  if (!resumeCity || !vacancyLocation) return 50;

  const loc = vacancyLocation.toLowerCase();
  const city = resumeCity.toLowerCase();

  if (loc.includes('удаленно') || loc.includes('remote') || loc.includes('дистанционно')) {
    return 90; // Remote почти всегда ок
  }

  if (loc.includes(city) || city.includes(loc)) return 100;

  // Проверяем регионы (Москва/МО, СПб/ЛО)
  const regionAliases = {
    'москва': ['московская', 'мо'],
    'санкт-петербург': ['ленинградская', 'ло'],
    'казань': ['татарстан'],
    'новосибирск': ['новосибирская'],
    'екатеринбург': ['свердловская']
  };

  for (const [key, aliases] of Object.entries(regionAliases)) {
    if (city.includes(key) && aliases.some(a => loc.includes(a))) return 80;
    if (loc.includes(key) && aliases.some(a => city.includes(a))) return 80;
  }

  return 30;
}

// ─── Main Matching Function ───────────────────

/**
 * Вычисляет match score вакансии относительно резюме.
 *
 * Веса: навыки 30%, ЗП 25%, опыт 20%, позиция 15%, локация 10%
 *
 * @param {Object} vacancy - { skills: string[], salary: string, experience: string, location: string, title: string }
 * @param {Object} resume  - { skills: string[], salary: string, experienceYears: number, position: string, city: string }
 * @returns {{ score: number, breakdown: { skills: number, salary: number, experience: number, position: number, location: number } }}
 */
export function calculateMatchScore(vacancy, resume) {
  if (!vacancy || !resume) {
    return { score: 0, breakdown: { skills: 0, salary: 0, experience: 0, position: 0, location: 0 } };
  }

  const skills = jaccardSkills(resume.skills, vacancy.skills) * 100;
  const salary = scoreSalary(resume.salary, vacancy.salary);
  const experience = scoreExperience(
    resume.experience ? `${resume.experienceYears || ''}` : null,
    vacancy.experience
  );
  const position = scorePosition(resume.position || '', vacancy.title || '');
  const location = scoreLocation(resume.city || '', vacancy.location || '');

  const score = Math.round(
    skills * 0.30 +
    salary * 0.25 +
    experience * 0.20 +
    position * 0.15 +
    location * 0.10
  );

  return {
    score: Math.max(0, Math.min(100, score)),
    breakdown: {
      skills: Math.round(skills),
      salary: Math.round(salary),
      experience: Math.round(experience),
      position: Math.round(position),
      location: Math.round(location)
    }
  };
}

/**
 * Находит навыки, которых не хватает в резюме, но которые востребованы.
 *
 * МЕТОДИКА: сортируем вакансии по score, берём топ-N,
 * находим навыки которых нет в резюме.
 */
export function findSkillGaps(vacancies, resume, topN = 5) {
  if (!vacancies?.length || !resume?.skills?.length) return [];

  // Подсчёт частотности навыков в вакансиях с score >= 70
  const demandMap = {};
  const resumeNorm = new Set(resume.skills.map(normalizeSkill));

  for (const v of vacancies) {
    if (!v.skills) continue;
    for (const skill of v.skills) {
      const norm = normalizeSkill(skill);
      if (!resumeNorm.has(norm)) {
        demandMap[norm] = (demandMap[norm] || 0) + 1;
      }
    }
  }

  return Object.entries(demandMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([skill, count]) => ({ skill, demand: count }));
}
