import { inArray } from 'drizzle-orm';
import { shiftDate, todayInTimeZone, wallTimeToUtc } from '@foodlog/shared';
import { syncCatalog } from '../catalog/sync.ts';
import { loadConfig } from '../config.ts';
import { newId } from '../lib/crypto.ts';
import { hashPassword } from '../lib/password.ts';
import { createDb } from './client.ts';
import { entries, entryIngredients, ingredients, users } from './schema.ts';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data in production');
  process.exit(1);
}

const DEMO = { email: 'demo@example.com', password: 'demo-password-123', name: 'Demo User' };
const ADMIN = { email: 'admin@example.com', password: 'admin-password-123', name: 'Demo Admin' };
const TIMEZONE = 'Europe/Berlin';
const DAYS = 28;

function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(42);
const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)]!;
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

const { db, pool } = createDb(config.DATABASE_URL);

try {
  await syncCatalog(db);
  await db.delete(users).where(inArray(users.email, [DEMO.email, ADMIN.email]));

  const demoId = newId();
  await db.insert(users).values([
    {
      id: demoId,
      email: DEMO.email,
      name: DEMO.name,
      passwordHash: await hashPassword(DEMO.password),
      emailVerifiedAt: new Date(),
      avatar: 'preset:3',
      locale: 'de',
      timezone: TIMEZONE,
    },
    {
      id: newId(),
      email: ADMIN.email,
      name: ADMIN.name,
      passwordHash: await hashPassword(ADMIN.password),
      emailVerifiedAt: new Date(),
      avatar: 'preset:8',
      role: 'admin',
      locale: 'en',
      timezone: TIMEZONE,
    },
  ]);

  const catalog = await db.select().from(ingredients);
  const idOf = (key: string) => {
    const found = catalog.find((row) => row.catalogKey === key);
    if (!found) throw new Error(`catalog item missing: ${key}`);
    return found.id;
  };

  const rows: (typeof entries.$inferInsert)[] = [];
  const links: (typeof entryIngredients.$inferInsert)[] = [];

  const pad = (value: number) => String(value).padStart(2, '0');

  const add = (
    day: string,
    hour: number,
    minute: number,
    entry: Omit<typeof entries.$inferInsert, 'id' | 'userId' | 'occurredAt'>,
    ingredientKeys: string[] = [],
  ) => {
    const id = newId();
    const occurredAt = wallTimeToUtc(`${day}T${pad(hour)}:${pad(minute)}`, TIMEZONE);
    rows.push({ id, userId: demoId, occurredAt, ...entry });
    for (const key of ingredientKeys) links.push({ entryId: id, ingredientId: idOf(key) });
    return hour * 60 + minute;
  };

  const today = todayInTimeZone(TIMEZONE);
  for (let offset = DAYS; offset >= 1; offset--) {
    const day = shiftDate(today, -offset);

    const dairyBreakfast = random() < 0.5;
    const breakfast = dairyBreakfast
      ? add(day, 7, between(0, 45), { type: 'meal', title: 'Müsli mit Milch' }, [
          'oats',
          'milk',
          'banana',
        ])
      : add(day, 7, between(0, 45), { type: 'meal', title: 'Brot mit Ei' }, [
          'rye_bread',
          'butter',
          'egg',
        ]);
    add(day, 8, between(0, 30), { type: 'drink', title: 'Kaffee' }, ['coffee']);

    const lunchKeys = pick([
      ['pasta', 'tomato', 'cheese_hard'],
      ['rice', 'chicken', 'broccoli'],
      ['potato', 'salmon', 'lettuce'],
      ['wheat_bread', 'ham', 'cucumber'],
    ]);
    add(day, 12, between(0, 45), { type: 'meal', title: 'Mittagessen' }, lunchKeys);

    const snackDairy = random() < 0.3;
    if (snackDairy)
      add(day, 15, between(0, 45), { type: 'meal', title: 'Joghurt' }, ['yogurt', 'honey']);

    add(
      day,
      19,
      between(0, 45),
      { type: 'meal', title: 'Abendessen' },
      pick([
        ['rice', 'tofu', 'zucchini', 'bell_pepper'],
        ['potato', 'beef', 'carrot'],
        ['pasta', 'cream', 'mushrooms'],
        ['quinoa', 'chickpeas', 'spinach'],
      ]),
    );
    if (random() < 0.4) add(day, 21, between(0, 40), { type: 'drink', title: 'Bier' }, ['beer']);

    const hadLactose = dairyBreakfast || snackDairy || lunchKeys.includes('cheese_hard');
    if (dairyBreakfast && random() < 0.75) {
      const minutes = breakfast + between(90, 180);
      add(day, Math.floor(minutes / 60), minutes % 60, {
        type: 'symptom',
        symptomType: random() < 0.6 ? 'bloating' : 'abdominal_pain',
        severity: between(4, 8),
      });
    }
    if (snackDairy && random() < 0.6) {
      add(day, 17, between(0, 30), {
        type: 'symptom',
        symptomType: 'bloating',
        severity: between(3, 6),
      });
    }
    if (random() < 0.12) {
      add(day, between(9, 20), between(0, 59), {
        type: 'symptom',
        symptomType: pick(['headache', 'fatigue', 'nausea']),
        severity: between(1, 4),
      });
    }

    add(day, between(7, 9), between(0, 59), {
      type: 'stool',
      bristol: hadLactose ? between(5, 7) : between(3, 4),
    });
    if (random() < 0.4)
      add(day, between(17, 21), between(0, 59), { type: 'stool', bristol: between(3, 5) });
  }

  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(entries).values(rows.slice(i, i + 200));
  }
  for (let i = 0; i < links.length; i += 200) {
    await db.insert(entryIngredients).values(links.slice(i, i + 200));
  }

  console.log(`Seeded ${rows.length} entries for ${DEMO.email} (password: ${DEMO.password})`);
  console.log(`Admin: ${ADMIN.email} (password: ${ADMIN.password})`);
} finally {
  await pool.end();
}
