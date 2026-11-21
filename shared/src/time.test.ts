import { describe, expect, it } from 'vitest';
import {
  dayRangeUtc,
  isDateString,
  isWallTime,
  shiftDate,
  todayInTimeZone,
  utcToWallTime,
  wallTimeToUtc,
} from './time.ts';

describe('wallTimeToUtc', () => {
  it('converts winter and summer time in Berlin', () => {
    expect(wallTimeToUtc('2026-01-15T08:30', 'Europe/Berlin').toISOString()).toBe(
      '2026-01-15T07:30:00.000Z',
    );
    expect(wallTimeToUtc('2026-07-15T08:30', 'Europe/Berlin').toISOString()).toBe(
      '2026-07-15T06:30:00.000Z',
    );
  });

  it('handles zones west of UTC and half-hour offsets', () => {
    expect(wallTimeToUtc('2026-07-15T08:30', 'America/New_York').toISOString()).toBe(
      '2026-07-15T12:30:00.000Z',
    );
    expect(wallTimeToUtc('2026-07-15T08:30', 'Asia/Kolkata').toISOString()).toBe(
      '2026-07-15T03:00:00.000Z',
    );
  });

  it('resolves times around the DST switch', () => {
    expect(wallTimeToUtc('2026-03-29T01:30', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T00:30:00.000Z',
    );
    expect(wallTimeToUtc('2026-03-29T03:30', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
  });

  it('moves a non-existent wall time forward past the DST gap', () => {
    expect(wallTimeToUtc('2026-03-29T02:30', 'Europe/Berlin').toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
  });

  it('throws for an unknown time zone', () => {
    expect(() => wallTimeToUtc('2026-03-29T02:30', 'Mars/Base')).toThrow();
  });

  it('round-trips with utcToWallTime', () => {
    for (const zone of ['Europe/Berlin', 'America/Los_Angeles', 'Australia/Sydney', 'UTC']) {
      const wall = '2026-10-04T19:45';
      expect(utcToWallTime(wallTimeToUtc(wall, zone), zone)).toBe(wall);
    }
  });
});

describe('day helpers', () => {
  it('computes a 23 hour day when clocks go forward', () => {
    const { from, to } = dayRangeUtc('2026-03-29', 'Europe/Berlin');
    expect((to.getTime() - from.getTime()) / 3_600_000).toBe(23);
  });

  it('computes a 25 hour day when clocks go back', () => {
    const { from, to } = dayRangeUtc('2026-10-25', 'Europe/Berlin');
    expect((to.getTime() - from.getTime()) / 3_600_000).toBe(25);
  });

  it('knows today per time zone', () => {
    const now = new Date('2026-11-21T23:30:00Z');
    expect(todayInTimeZone('Europe/Berlin', now)).toBe('2026-11-22');
    expect(todayInTimeZone('America/New_York', now)).toBe('2026-11-21');
  });

  it('shifts dates across month borders', () => {
    expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('validation', () => {
  it('accepts valid and rejects invalid values', () => {
    expect(isWallTime('2026-11-21T08:30')).toBe(true);
    expect(isWallTime('2026-13-21T08:30')).toBe(false);
    expect(isWallTime('2026-11-21 08:30')).toBe(false);
    expect(isDateString('2026-11-21')).toBe(true);
    expect(isDateString('2026-02-31')).toBe(false);
  });
});
