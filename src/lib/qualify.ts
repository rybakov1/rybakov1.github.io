/**
 * Lead qualification for stand briefs.
 * hot: strong budget + near-term timeline + show within ~6 months (when known)
 * warm: mid intent
 * cold: researching / low budget / far out
 */

export type BudgetBand = '<15k' | '15-40k' | '40-80k' | '80k+' | 'prefer-not';
export type TimelineBand = 'ready' | '1-3m' | '3-6m' | 'researching';
export type StandSizeBand = '<18' | '18-36' | '36-54' | '54+';
export type Qualification = 'hot' | 'warm' | 'cold';

export interface QualifyInput {
  budget: BudgetBand;
  timeline: TimelineBand;
  standSize: StandSizeBand;
  /** ISO date of target show start, if known */
  showStartDate?: string | null;
  asOf?: Date;
}

export interface QualifyResult {
  qualification: Qualification;
  score: number;
  reasons: string[];
}

function monthsUntil(showStart: string, asOf: Date): number | null {
  const start = new Date(showStart + 'T12:00:00');
  if (Number.isNaN(start.getTime())) return null;
  const ms = start.getTime() - asOf.getTime();
  return ms / (1000 * 60 * 60 * 24 * 30.44);
}

export function qualifyLead(input: QualifyInput): QualifyResult {
  const asOf = input.asOf ?? new Date();
  let score = 0;
  const reasons: string[] = [];

  // Budget
  switch (input.budget) {
    case '80k+':
      score += 40;
      reasons.push('Budget 80k+');
      break;
    case '40-80k':
      score += 30;
      reasons.push('Budget 40–80k');
      break;
    case '15-40k':
      score += 18;
      reasons.push('Budget 15–40k');
      break;
    case '<15k':
      score += 5;
      reasons.push('Budget under 15k');
      break;
    default:
      score += 8;
      reasons.push('Budget not disclosed');
  }

  // Timeline
  switch (input.timeline) {
    case 'ready':
      score += 30;
      reasons.push('Ready to brief');
      break;
    case '1-3m':
      score += 24;
      reasons.push('Timeline 1–3 months');
      break;
    case '3-6m':
      score += 12;
      reasons.push('Timeline 3–6 months');
      break;
    default:
      score += 4;
      reasons.push('Still researching');
  }

  // Stand size (larger → slightly hotter for custom build)
  switch (input.standSize) {
    case '54+':
      score += 15;
      reasons.push('Stand 54m²+');
      break;
    case '36-54':
      score += 12;
      reasons.push('Stand 36–54m²');
      break;
    case '18-36':
      score += 8;
      reasons.push('Stand 18–36m²');
      break;
    default:
      score += 4;
      reasons.push('Stand under 18m²');
  }

  // Show proximity
  if (input.showStartDate) {
    const months = monthsUntil(input.showStartDate, asOf);
    if (months != null) {
      if (months < 0) {
        reasons.push('Show date already passed');
      } else if (months <= 6) {
        score += 15;
        reasons.push('Show within 6 months');
      } else if (months <= 12) {
        score += 8;
        reasons.push('Show within 12 months');
      } else {
        score += 2;
        reasons.push('Show more than 12 months out');
      }
    }
  }

  const midBudget =
    input.budget === '40-80k' || input.budget === '80k+' || input.budget === '15-40k';
  const nearTimeline = input.timeline === 'ready' || input.timeline === '1-3m';
  const months = input.showStartDate
    ? monthsUntil(input.showStartDate, asOf)
    : null;
  const showSoon = months != null && months >= 0 && months <= 6;

  let qualification: Qualification = 'cold';
  if (
    (input.budget === '40-80k' || input.budget === '80k+') &&
    nearTimeline &&
    (showSoon || !input.showStartDate)
  ) {
    qualification = 'hot';
  } else if (score >= 55 || (midBudget && nearTimeline)) {
    qualification = 'warm';
  } else if (score >= 40) {
    qualification = 'warm';
  }

  // Spec rule of thumb: hot if budget ≥ mid (40k+) + timeline ≤ 3m + show within 6m
  if (
    (input.budget === '40-80k' || input.budget === '80k+') &&
    nearTimeline &&
    showSoon
  ) {
    qualification = 'hot';
  }

  return { qualification, score, reasons };
}

export const BUDGET_LABELS: Record<BudgetBand, string> = {
  '<15k': 'Under AUD 15,000',
  '15-40k': 'AUD 15,000 – 40,000',
  '40-80k': 'AUD 40,000 – 80,000',
  '80k+': 'AUD 80,000+',
  'prefer-not': 'Prefer not to say',
};

export const TIMELINE_LABELS: Record<TimelineBand, string> = {
  ready: 'Ready to brief now',
  '1-3m': '1–3 months',
  '3-6m': '3–6 months',
  researching: 'Still researching',
};

export const STAND_SIZE_LABELS: Record<StandSizeBand, string> = {
  '<18': 'Under 18 m²',
  '18-36': '18–36 m²',
  '36-54': '36–54 m²',
  '54+': '54 m²+',
};
