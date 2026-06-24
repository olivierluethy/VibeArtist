import type { OilDrawingPlan } from './drawing/oilTypes';

export type Step = 'start' | 'input' | 'vibe' | 'preparing' | 'performance' | 'result';

export interface AppState {
  step: Step;
  photo: string | null;
  config: { team: string; player?: string } | null;
  plan: OilDrawingPlan | null;
}

const ORDER: Step[] = ['start', 'input', 'vibe', 'preparing', 'performance', 'result'];

export function nextStep(step: Step): Step {
  const i = ORDER.indexOf(step);
  return i < 0 || i === ORDER.length - 1 ? step : ORDER[i + 1];
}

export const INITIAL_STATE: AppState = { step: 'start', photo: null, config: null, plan: null };
