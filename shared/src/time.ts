import { DateTime } from 'luxon';

const WALL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WALL_FORMAT = "yyyy-MM-dd'T'HH:mm";
const DATE_FORMAT = 'yyyy-MM-dd';

function parseWall(wall: string, zone: string): DateTime {
  return DateTime.fromFormat(wall, WALL_FORMAT, { zone, locale: 'en-US' });
}

export function isWallTime(value: string): boolean {
  return WALL_PATTERN.test(value) && parseWall(value, 'utc').isValid;
}

export function isDateString(value: string): boolean {
  return (
    DATE_PATTERN.test(value) &&
    DateTime.fromFormat(value, DATE_FORMAT, { zone: 'utc', locale: 'en-US' }).isValid
  );
}

export function wallTimeToUtc(wall: string, timeZone: string): Date {
  const parsed = parseWall(wall, timeZone);
  if (!parsed.isValid) throw new Error(`invalid wall time or time zone: ${wall} ${timeZone}`);
  return parsed.toJSDate();
}

export function utcToWallTime(date: Date, timeZone: string): string {
  return DateTime.fromJSDate(date, { zone: timeZone }).setLocale('en-US').toFormat(WALL_FORMAT);
}

export function todayInTimeZone(timeZone: string, now = new Date()): string {
  return DateTime.fromJSDate(now, { zone: timeZone }).setLocale('en-US').toFormat(DATE_FORMAT);
}

export function shiftDate(date: string, days: number): string {
  return DateTime.fromFormat(date, DATE_FORMAT, { zone: 'utc', locale: 'en-US' })
    .plus({ days })
    .toFormat(DATE_FORMAT);
}

export function dayRangeUtc(date: string, timeZone: string): { from: Date; to: Date } {
  const start = DateTime.fromFormat(date, DATE_FORMAT, { zone: timeZone, locale: 'en-US' });
  if (!start.isValid) throw new Error(`invalid date or time zone: ${date} ${timeZone}`);
  return { from: start.toJSDate(), to: start.plus({ days: 1 }).toJSDate() };
}
