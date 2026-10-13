import { jstNow } from './utils.js';
// リマインダ配信クエリヘルパー

export interface ReminderRow {
  id: string;
  name: string;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ReminderStepRow {
  id: string;
  reminder_id: string;
  offset_minutes: number;
  message_type: string;
  message_content: string;
  created_at: string;
}

export interface FriendReminderRow {
  id: string;
  friend_id: string;
  reminder_id: string;
  target_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// --- リマインダCRUD ---

export async function getReminders(db: D1Database): Promise<ReminderRow[]> {
  const result = await db.prepare(`SELECT * FROM reminders ORDER BY created_at DESC`).all<ReminderRow>();
  return result.results;
}

export async function getReminderById(db: D1Database, id: string): Promise<ReminderRow | null> {
  return db.prepare(`SELECT * FROM reminders WHERE id = ?`).bind(id).first<ReminderRow>();
}

export async function createReminder(
  db: D1Database,
  input: { name: string; description?: string },
): Promise<ReminderRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(`INSERT INTO reminders (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, input.name, input.description ?? null, now, now).run();
  return (await getReminderById(db, id))!;
}

export async function updateReminder(
  db: D1Database,
  id: string,
  updates: Partial<{ name: string; description: string; isActive: boolean }>,
): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
  if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
  if (updates.isActive !== undefined) { sets.push('is_active = ?'); values.push(updates.isActive ? 1 : 0); }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  values.push(jstNow());
  values.push(id);
  await db.prepare(`UPDATE reminders SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();
}

export async function deleteReminder(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM reminders WHERE id = ?`).bind(id).run();
}

// --- リマインダステップ ---

export async function getReminderSteps(db: D1Database, reminderId: string): Promise<ReminderStepRow[]> {
  const result = await db.prepare(`SELECT * FROM reminder_steps WHERE reminder_id = ? ORDER BY offset_minutes ASC`)
    .bind(reminderId).all<ReminderStepRow>();
  return result.results;
}

export async function createReminderStep(
  db: D1Database,
  input: { reminderId: string; offsetMinutes: number; messageType: string; messageContent: string },
): Promise<ReminderStepRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(`INSERT INTO reminder_steps (id, reminder_id, offset_minutes, message_type, message_content, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, input.reminderId, input.offsetMinutes, input.messageType, input.messageContent, now).run();
  return (await db.prepare(`SELECT * FROM reminder_steps WHERE id = ?`).bind(id).first<ReminderStepRow>())!;
}

export async function deleteReminderStep(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM reminder_steps WHERE id = ?`).bind(id).run();
}

// --- 友だちリマインダ ---

export async function enrollFriendInReminder(
  db: D1Database,
  input: { friendId: string; reminderId: string; targetDate: string },
): Promise<FriendReminderRow> {
  const id = crypto.randomUUID();
  const now = jstNow();
  await db.prepare(`INSERT INTO friend_reminders (id, friend_id, reminder_id, target_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, input.friendId, input.reminderId, input.targetDate, now, now).run();
  return (await db.prepare(`SELECT * FROM friend_reminders WHERE id = ?`).bind(id).first<FriendReminderRow>())!;
}

export async function getFriendReminders(db: D1Database, friendId: string): Promise<FriendReminderRow[]> {
  const result = await db.prepare(`SELECT * FROM friend_reminders WHERE friend_id = ? ORDER BY target_date ASC`)
    .bind(friendId).all<FriendReminderRow>();
  return result.results;
}

export async function cancelFriendReminder(db: D1Database, id: string): Promise<void> {
  await db.prepare(`UPDATE friend_reminders SET status = 'cancelled', updated_at = ? WHERE id = ?`)
    .bind(jstNow(), id).run();
}

/** リマインダ配信処理用: 配信が必要な友だちリマインダを取得 */
export async function getDueReminderDeliveries(db: D1Database, now: string): Promise<Array<FriendReminderRow & { steps: ReminderStepRow[] }>> {
  // activeなリマインダ登録を取得
  const activeReminders = await db
    .prepare(`SELECT fr.* FROM friend_reminders fr
              INNER JOIN reminders r ON r.id = fr.reminder_id
              WHERE fr.status = 'active' AND r.is_active = 1`)
    .all<FriendReminderRow>();
  if (activeReminders.results.length === 0) return [];

  // 登録ごとに steps / 配信済みを引く N+1 を避け、2クエリでまとめて取得する
  // (毎分の cron で走るため、件数に比例するクエリ数と CPU 時間を抑える)。
  const [allSteps, allDelivered] = await Promise.all([
    db.prepare(`SELECT rs.* FROM reminder_steps rs
                INNER JOIN reminders r ON r.id = rs.reminder_id
                WHERE r.is_active = 1
                ORDER BY rs.offset_minutes ASC`)
      .all<ReminderStepRow>(),
    db.prepare(`SELECT frd.friend_reminder_id, frd.reminder_step_id
                FROM friend_reminder_deliveries frd
                INNER JOIN friend_reminders fr ON fr.id = frd.friend_reminder_id
                WHERE fr.status = 'active'`)
      .all<{ friend_reminder_id: string; reminder_step_id: string }>(),
  ]);

  const stepsByReminder = new Map<string, ReminderStepRow[]>();
  for (const step of allSteps.results) {
    const list = stepsByReminder.get(step.reminder_id);
    if (list) list.push(step);
    else stepsByReminder.set(step.reminder_id, [step]);
  }
  const deliveredByFriendReminder = new Map<string, Set<string>>();
  for (const d of allDelivered.results) {
    const set = deliveredByFriendReminder.get(d.friend_reminder_id);
    if (set) set.add(d.reminder_step_id);
    else deliveredByFriendReminder.set(d.friend_reminder_id, new Set([d.reminder_step_id]));
  }

  const nowMs = new Date(now).getTime();
  const results: Array<FriendReminderRow & { steps: ReminderStepRow[] }> = [];
  for (const fr of activeReminders.results) {
    const steps = stepsByReminder.get(fr.reminder_id) ?? [];
    const deliveredIds = deliveredByFriendReminder.get(fr.id);
    const targetMs = new Date(fr.target_date).getTime();

    // 未配信で配信時刻が到来しているステップをフィルタ
    const dueSteps = steps.filter((step) => {
      if (deliveredIds?.has(step.id)) return false;
      return targetMs + step.offset_minutes * 60_000 <= nowMs;
    });

    if (dueSteps.length > 0) {
      results.push({ ...fr, steps: dueSteps });
    }
  }
  return results;
}

/** 配信済みを記録 */
export async function markReminderStepDelivered(db: D1Database, friendReminderId: string, reminderStepId: string): Promise<void> {
  const id = crypto.randomUUID();
  await db.prepare(`INSERT OR IGNORE INTO friend_reminder_deliveries (id, friend_reminder_id, reminder_step_id) VALUES (?, ?, ?)`)
    .bind(id, friendReminderId, reminderStepId).run();
}

/** 全ステップ配信済みならcompletedにする */
export async function completeReminderIfDone(db: D1Database, friendReminderId: string, reminderId: string): Promise<void> {
  const totalSteps = await db.prepare(`SELECT COUNT(*) as count FROM reminder_steps WHERE reminder_id = ?`)
    .bind(reminderId).first<{ count: number }>();
  const deliveredSteps = await db.prepare(`SELECT COUNT(*) as count FROM friend_reminder_deliveries WHERE friend_reminder_id = ?`)
    .bind(friendReminderId).first<{ count: number }>();

  if (totalSteps && deliveredSteps && deliveredSteps.count >= totalSteps.count) {
    await db.prepare(`UPDATE friend_reminders SET status = 'completed', updated_at = ? WHERE id = ?`)
      .bind(jstNow(), friendReminderId).run();
  }
}
