import { beforeEach, describe, expect, test } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDueReminderDeliveries } from '../src/reminders.js';
import { getFriendScenariosDueForDelivery } from '../src/scenarios.js';
import { getScheduledBroadcasts } from '../src/broadcasts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function asD1(sqlite: Database.Database): D1Database {
  return {
    prepare(query: string) {
      const stmt = sqlite.prepare(query);
      const bound = (params: unknown[]) => ({
        async all<T>() {
          return { results: stmt.all(...params) as T[], success: true, meta: {} };
        },
        async first<T>() {
          return (stmt.get(...params) as T) ?? null;
        },
        async run() {
          const info = stmt.run(...params);
          return { results: [], success: true, meta: { changes: info.changes } };
        },
      });
      return { ...bound([]), bind: (...params: unknown[]) => bound(params) };
    },
  } as unknown as D1Database;
}

let sqlite: Database.Database;
let db: D1Database;

beforeEach(() => {
  sqlite = new Database(':memory:');
  sqlite.exec(readFileSync(join(__dirname, '../bootstrap.sql'), 'utf8'));
  sqlite.pragma('foreign_keys = OFF');
  db = asD1(sqlite);
});

describe('getDueReminderDeliveries', () => {
  beforeEach(() => {
    sqlite.exec(`
      INSERT INTO reminders (id, name, is_active) VALUES ('r1', 'active', 1), ('r2', 'inactive', 0);
      INSERT INTO reminder_steps (id, reminder_id, offset_minutes, message_type, message_content) VALUES
        ('s1-late', 'r1', 60, 'text', 'b'),
        ('s1-early', 'r1', -60, 'text', 'a'),
        ('s1-future', 'r1', 600, 'text', 'c'),
        ('s2', 'r2', -60, 'text', 'x');
      INSERT INTO friend_reminders (id, friend_id, reminder_id, target_date, status) VALUES
        ('fr-a', 'f1', 'r1', '2026-10-13T10:00:00.000+09:00', 'active'),
        ('fr-b', 'f2', 'r1', '2026-10-13T10:00:00.000+09:00', 'active'),
        ('fr-done', 'f3', 'r1', '2026-10-13T10:00:00.000+09:00', 'completed'),
        ('fr-inactive', 'f4', 'r2', '2026-10-13T10:00:00.000+09:00', 'active'),
        ('fr-none', 'f5', 'r1', '2026-10-20T10:00:00.000+09:00', 'active');
      INSERT INTO friend_reminder_deliveries (id, friend_reminder_id, reminder_step_id) VALUES
        ('d1', 'fr-b', 's1-early');
    `);
  });

  test('配信時刻到来・未配信のステップだけを offset 昇順で返す', async () => {
    const due = await getDueReminderDeliveries(db, '2026-10-13T11:30:00.000+09:00');

    expect(due.map((d) => d.id)).toEqual(['fr-a', 'fr-b']);
    expect(due[0].steps.map((s) => s.id)).toEqual(['s1-early', 's1-late']);
    // fr-b は s1-early 配信済み
    expect(due[1].steps.map((s) => s.id)).toEqual(['s1-late']);
  });

  test('active な登録が無ければ空', async () => {
    sqlite.exec(`UPDATE friend_reminders SET status = 'cancelled'`);
    expect(await getDueReminderDeliveries(db, '2026-10-13T11:30:00.000+09:00')).toEqual([]);
  });
});

describe('getFriendScenariosDueForDelivery', () => {
  test('到来済みだけを next_delivery_at 昇順で返す (Z / +09:00 混在でも epoch 比較)', async () => {
    sqlite.exec(`
      INSERT INTO scenarios (id, name, trigger_type, is_active) VALUES ('sc1', 'a', 'manual', 1), ('sc2', 'b', 'manual', 0);
      INSERT INTO friend_scenarios (id, friend_id, scenario_id, status, next_delivery_at) VALUES
        ('late', 'f1', 'sc1', 'active', '2026-10-13T02:00:00.000Z'),
        ('early', 'f2', 'sc1', 'active', '2026-10-13T10:00:00.000+09:00'),
        ('future', 'f3', 'sc1', 'active', '2026-10-14T10:00:00.000+09:00'),
        ('inactive-scenario', 'f4', 'sc2', 'active', '2026-10-13T09:00:00.000+09:00'),
        ('paused', 'f5', 'sc1', 'paused', '2026-10-13T09:00:00.000+09:00');
    `);

    const due = await getFriendScenariosDueForDelivery(db, '2026-10-13T12:00:00.000+09:00');

    expect(due.map((d) => d.id)).toEqual(['early', 'late']);
  });
});

describe('getScheduledBroadcasts', () => {
  test("status='scheduled' かつ scheduled_at ありの行だけを返す", async () => {
    sqlite.exec(`
      INSERT INTO broadcasts (id, title, message_type, message_content, target_type, status, scheduled_at) VALUES
        ('b-sched', 't', 'text', 'x', 'all', 'scheduled', '2026-10-13T10:00:00.000+09:00'),
        ('b-sched2', 't', 'text', 'x', 'all', 'scheduled', '2026-10-13T12:00:00.000+09:00'),
        ('b-draft', 't', 'text', 'x', 'all', 'draft', '2026-10-13T10:00:00.000+09:00'),
        ('b-sent', 't', 'text', 'x', 'all', 'sent', '2026-10-13T10:00:00.000+09:00'),
        ('b-noschedule', 't', 'text', 'x', 'all', 'scheduled', NULL);
    `);

    const rows = await getScheduledBroadcasts(db);

    expect(rows.map((r) => r.id)).toEqual(['b-sched2', 'b-sched']);
  });
});
