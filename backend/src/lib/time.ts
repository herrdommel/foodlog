export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export function inFuture(ms: number): Date {
  return new Date(Date.now() + ms);
}
