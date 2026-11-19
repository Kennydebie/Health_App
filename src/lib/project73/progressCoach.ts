import type { ObservedRate } from './weightTrend';

export interface AdherenceSummary {
  /** Days in the window with any confirmed intake (eaten meals or logged food). */
  daysWithIntake: number;
  windowDays: number;
  /** Average confirmed kcal on days with intake. */
  averageKcal: number | null;
  averageProtein: number | null;
  /** Share of planned meals marked eaten / skipped / replaced. */
  plannedMeals: number;
  eatenMeals: number;
  skippedOrReplaced: number;
}

export interface CoachInput {
  rate: ObservedRate | null;
  expectedKgPerWeek: number;
  desiredBand: [number, number];
  currentKg: number | null;
  kcalTarget: number;
  proteinTarget: number;
  adherence: AdherenceSummary;
  strengthSessionsLast4Weeks: number;
  strengthSessionsPrevious4Weeks: number;
  /** Days since the last calorie target change; avoids changing twice in a row. */
  daysSinceTargetChange: number | null;
}

export type CoachTone = 'on_track' | 'slower' | 'faster' | 'stable' | 'gaining' | 'insufficient_data' | 'review_intake';

export interface CoachAssessment {
  tone: CoachTone;
  title: string;
  message: string;
  actions: string[];
  /** Only set when the data is reliable enough to justify changing the calorie target. */
  calorieAdjustment: { deltaKcal: number; reason: string } | null;
  confidence: 'hoog' | 'redelijk' | 'laag';
}

const nl = (value: number, digits = 1) => value.toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function intakeIsReliable(adherence: AdherenceSummary) {
  return adherence.windowDays > 0 && adherence.daysWithIntake / adherence.windowDays >= 0.6;
}

export function assessProgress(input: CoachInput): CoachAssessment {
  const { rate, adherence } = input;
  const actions: string[] = [];
  const proteinNote = adherence.averageProtein != null && adherence.averageProtein < input.proteinTarget * 0.85
    ? `Je eiwit zat gemiddeld op ${nl(adherence.averageProtein, 0)} g; mik op ${nl(input.proteinTarget, 0)} g om spiermassa te beschermen.`
    : null;
  if (proteinNote) actions.push(proteinNote);
  if (input.strengthSessionsLast4Weeks < input.strengthSessionsPrevious4Weeks - 2) {
    actions.push('Je trainde minder dan de vier weken ervoor. Twee korte krachttrainingen per week helpen spiermassa te behouden.');
  }

  if (!rate || !rate.reliable) {
    return {
      tone: 'insufficient_data',
      title: 'Nog te weinig metingen',
      message: rate
        ? `Je hebt ${rate.weighIns} wegingen over ${rate.spanDays} dagen. Na minstens 4 wegingen verspreid over 2 weken kan de app je tempo betrouwbaar beoordelen.`
        : 'Weeg jezelf 1 tot 3 keer per week, ’s ochtends na het toilet. Na twee weken zie je hier je echte tempo.',
      actions: ['Weeg jezelf deze week minstens twee keer.', ...actions],
      calorieAdjustment: null,
      confidence: 'laag',
    };
  }

  const weeks = Math.max(1, Math.round(rate.spanDays / 7));
  const lost = rate.kgPerWeek * (rate.spanDays / 7);
  const [minRate, maxRate] = input.desiredBand;
  const intakeKnown = intakeIsReliable(adherence);
  const confidence = rate.weighIns >= 8 && rate.spanDays >= 21 ? 'hoog' : 'redelijk';
  const canAdjust = rate.spanDays >= 21 && (input.daysSinceTargetChange == null || input.daysSinceTargetChange >= 14);

  if (input.currentKg != null && rate.kgPerWeek > Math.max(maxRate + 0.2, input.currentKg * 0.01)) {
    return {
      tone: 'faster',
      title: 'Sneller dan gepland',
      message: `Je bent de afgelopen ${weeks} weken ${nl(lost)} kg afgevallen (${nl(rate.kgPerWeek, 2)} kg per week). Dat is sneller dan je plan van ${nl(input.expectedKgPerWeek, 2)} kg per week.`,
      actions: ['Let op energie, slaap en trainingsprestaties.', ...actions],
      calorieAdjustment: canAdjust ? { deltaKcal: 150, reason: 'Een iets kleiner tekort beschermt spiermassa en is makkelijker vol te houden.' } : null,
      confidence,
    };
  }

  if (rate.kgPerWeek >= minRate - 0.05) {
    return {
      tone: 'on_track',
      title: 'Op schema',
      message: `Je bent de afgelopen ${weeks} weken ${nl(lost)} kg afgevallen. Dat past bij je geplande tempo. Ga door met je huidige doelen.`,
      actions,
      calorieAdjustment: null,
      confidence,
    };
  }

  if (rate.kgPerWeek >= 0.1) {
    return {
      tone: 'slower',
      title: 'Iets langzamer dan gepland',
      message: `Je valt af (${nl(lost)} kg in ${weeks} weken), alleen iets langzamer dan gepland. Dat is nog geen reden om minder te eten.`,
      actions: intakeKnown ? ['Houd je huidige doelen nog twee weken aan en blijf wegen.', ...actions] : ['Markeer je maaltijden als “Gegeten” zodat de app je inname kan meewegen.', ...actions],
      calorieAdjustment: null,
      confidence,
    };
  }

  const gaining = rate.kgPerWeek < -0.1;
  if (!intakeKnown) {
    return {
      tone: 'review_intake',
      title: gaining ? 'Je trend gaat licht omhoog' : `Je gewicht is ${weeks} weken stabiel`,
      message: 'Laten we eerst je calorie-inname en activiteit bekijken voordat we je doelen aanpassen. Van te veel dagen is niet bekend wat je hebt gegeten.',
      actions: ['Gebruik deze week de knop “Gegeten” bij je maaltijden.', 'Noteer je stappen of trainingen.', ...actions],
      calorieAdjustment: null,
      confidence: 'laag',
    };
  }

  const overTarget = adherence.averageKcal != null && adherence.averageKcal > input.kcalTarget * 1.08;
  if (overTarget) {
    return {
      tone: 'review_intake',
      title: gaining ? 'Je trend gaat licht omhoog' : `Je gewicht is ${weeks} weken stabiel`,
      message: `Je gemiddelde inname was ${nl(adherence.averageKcal ?? 0, 0)} kcal, boven je doel van ${nl(input.kcalTarget, 0)} kcal. Je doel aanpassen is niet nodig; het plan beter volgen wel.`,
      actions: ['Kies maaltijden met minder bereiding als koken het lastig maakt.', ...actions],
      calorieAdjustment: null,
      confidence,
    };
  }

  return {
    tone: gaining ? 'gaining' : 'stable',
    title: gaining ? 'Je trend gaat licht omhoog' : `Je gewicht is ${weeks} weken stabiel`,
    message: `Je volgt je plan goed (gemiddeld ${nl(adherence.averageKcal ?? 0, 0)} kcal), maar je trend beweegt nauwelijks. Je werkelijke verbruik ligt waarschijnlijk lager dan geschat.`,
    actions: ['Extra wandelen (2.000 stappen per dag) is een alternatief voor minder eten.', ...actions],
    calorieAdjustment: canAdjust ? { deltaKcal: -100, reason: 'Een kleine verlaging van 100 kcal; eiwit blijft gelijk.' } : null,
    confidence,
  };
}
