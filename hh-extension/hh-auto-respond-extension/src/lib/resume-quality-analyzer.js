/**
 * RESUME QUALITY ANALYZER — фасад.
 * Собирает результаты из специализированных модулей:
 *   - quality-ats.js      → ATS-совместимость
 *   - quality-experience.js → качество опыта
 *   - quality-flags.js    → красные флаги, сильные стороны, рекомендации
 */

import { analyzeATS } from './quality-ats.js';
import { analyzeExperience } from './quality-experience.js';
import { detectRedFlags, detectStrengths, buildRecommendations } from './quality-flags.js';

/**
 * Полный анализ качества резюме.
 * Общий балл: 40% ATS + 40% опыт + 20% базис − штраф за красные флаги.
 */
export function analyzeResumeQuality(r) {
  if (!r || !r.id) return {
    totalScore: 0, atsScore: 0, experienceScore: 0,
    redFlags: [], strengths: [], recommendations: [],
    details: { ats: { score: 0, checks: [] }, experience: { score: 0, checks: [], metrics: {} } }
  };

  const ats = analyzeATS(r);
  const exp = analyzeExperience(r);
  const flags = detectRedFlags(r);
  const strengths = detectStrengths(r);
  const recommendations = buildRecommendations(ats, exp, flags, r);

  const flagPenalty = Math.min(30, flags.length * 7);
  const totalScore = Math.max(0, Math.round(
    ats.score * 0.4 + exp.score * 0.4 + 100 * 0.2 - flagPenalty
  ));

  return {
    totalScore,
    atsScore: ats.score,
    experienceScore: exp.score,
    redFlags: flags,
    strengths,
    recommendations,
    details: { ats, experience: exp }
  };
}
