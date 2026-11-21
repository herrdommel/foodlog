import {
  ANALYSIS_OUTCOMES,
  ANALYSIS_WINDOWS,
  isDateString,
  shiftDate,
  todayInTimeZone,
  type AnalysisOutcome,
} from '@foodlog/shared';

export interface AnalysisParams {
  from: string;
  to: string;
  window: number;
  outcome: AnalysisOutcome;
  minSeverity: number;
}

export function readAnalysisParams(params: URLSearchParams, timeZone: string): AnalysisParams {
  const today = todayInTimeZone(timeZone);
  const to = params.get('to');
  const from = params.get('from');
  const window = Number(params.get('window'));
  const outcome = params.get('outcome');
  const minSeverity = Number(params.get('minSeverity') ?? 3);

  const resolvedTo = to && isDateString(to) ? to : today;
  const resolvedFrom = from && isDateString(from) ? from : shiftDate(resolvedTo, -29);
  return {
    from: resolvedFrom <= resolvedTo ? resolvedFrom : resolvedTo,
    to: resolvedTo,
    window: (ANALYSIS_WINDOWS as readonly number[]).includes(window) ? window : 8,
    outcome: (ANALYSIS_OUTCOMES as readonly string[]).includes(outcome ?? '')
      ? (outcome as AnalysisOutcome)
      : 'symptoms',
    minSeverity:
      Number.isInteger(minSeverity) && minSeverity >= 0 && minSeverity <= 10 ? minSeverity : 3,
  };
}

export function toSearchParams(params: AnalysisParams): Record<string, string> {
  return {
    from: params.from,
    to: params.to,
    window: String(params.window),
    outcome: params.outcome,
    minSeverity: String(params.minSeverity),
  };
}
