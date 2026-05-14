import { jstNow } from './utils.js';
// =============================================================================
// LP Pages — 視聴期限付きランディングページ（UTAGE風）
// =============================================================================

export type ContentType = 'video' | 'page';
export type AccessWindowMode = 'absolute' | 'relative' | 'both' | 'none';
export type AccessReason = 'expired' | 'not_yet' | 'not_friend' | 'inactive';
export type AccessResultStatus = 'allowed' | 'expired' | 'not_yet' | 'not_friend' | 'inactive';

export interface LpPage {
  id: string;
  line_account_id: string | null;
  name: string;
  slug: string;

  content_type: ContentType;
  video_url: string | null;
  body: string | null;

  access_window_mode: AccessWindowMode;
  absolute_starts_at: string | null;
  absolute_ends_at: string | null;
  relative_days_after_friend_add: number | null;

  expired_redirect_url: string;
  not_friend_redirect_url: string | null;

  is_active: number;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface LpView {
  id: string;
  lp_page_id: string;
  friend_id: string | null;
  line_user_id: string | null;
  viewed_at: string;
  user_agent: string | null;
  referrer: string | null;
  access_result: AccessResultStatus;
  reason: string | null;
}

// ── 期限判定（純粋関数：テスト容易） ────────────────────────────────────────
export type AccessResult =
  | { allowed: true }
  | { allowed: false; reason: AccessReason; redirectUrl: string };

export function isLpAccessible(
  lp: LpPage,
  friend: { id: string; created_at: string } | null,
  now: Date = new Date(),
): AccessResult {
  if (!lp.is_active) {
    return { allowed: false, reason: 'inactive', redirectUrl: lp.expired_redirect_url };
  }
  if (!friend) {
    return {
      allowed: false,
      reason: 'not_friend',
      redirectUrl: lp.not_friend_redirect_url ?? lp.expired_redirect_url,
    };
  }

  const nowMs = now.getTime();

  if (lp.access_window_mode === 'absolute' || lp.access_window_mode === 'both') {
    if (lp.absolute_starts_at && nowMs < new Date(lp.absolute_starts_at).getTime()) {
      return { allowed: false, reason: 'not_yet', redirectUrl: lp.expired_redirect_url };
    }
    if (lp.absolute_ends_at && nowMs > new Date(lp.absolute_ends_at).getTime()) {
      return { allowed: false, reason: 'expired', redirectUrl: lp.expired_redirect_url };
    }
  }

  if (lp.access_window_mode === 'relative' || lp.access_window_mode === 'both') {
    const days = lp.relative_days_after_friend_add ?? 0;
    const limit = new Date(friend.created_at).getTime() + days * 86_400_000;
    if (nowMs > limit) {
      return { allowed: false, reason: 'expired', redirectUrl: lp.expired_redirect_url };
    }
  }

  return { allowed: true };
}

// ── 期限ミリ秒の集約算出（カウントダウン用） ────────────────────────────────
export function computeLpExpiryMs(
  lp: LpPage,
  friend: { created_at: string } | null,
): number | null {
  if (lp.access_window_mode === 'none') return null;

  let absMs: number | null = null;
  let relMs: number | null = null;

  if (lp.access_window_mode === 'absolute' || lp.access_window_mode === 'both') {
    if (lp.absolute_ends_at) absMs = new Date(lp.absolute_ends_at).getTime();
  }
  if (lp.access_window_mode === 'relative' || lp.access_window_mode === 'both') {
    if (friend && lp.relative_days_after_friend_add != null) {
      relMs =
        new Date(friend.created_at).getTime() +
        lp.relative_days_after_friend_add * 86_400_000;
    }
  }

  if (absMs !== null && relMs !== null) return Math.min(absMs, relMs);
  return absMs ?? relMs;
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function getLpPages(db: D1Database): Promise<LpPage[]> {
  const result = await db
    .prepare(`SELECT * FROM lp_pages ORDER BY created_at DESC`)
    .all<LpPage>();
  return result.results;
}

export async function getLpPageById(db: D1Database, id: string): Promise<LpPage | null> {
  return db.prepare(`SELECT * FROM lp_pages WHERE id = ?`).bind(id).first<LpPage>();
}

export async function getLpPageBySlug(db: D1Database, slug: string): Promise<LpPage | null> {
  return db.prepare(`SELECT * FROM lp_pages WHERE slug = ?`).bind(slug).first<LpPage>();
}

export interface CreateLpPageInput {
  name: string;
  slug: string;
  contentType: ContentType;
  videoUrl?: string | null;
  body?: string | null;
  accessWindowMode: AccessWindowMode;
  absoluteStartsAt?: string | null;
  absoluteEndsAt?: string | null;
  relativeDaysAfterFriendAdd?: number | null;
  expiredRedirectUrl: string;
  notFriendRedirectUrl?: string | null;
  lineAccountId?: string | null;
  isActive?: boolean;
}

export async function createLpPage(db: D1Database, input: CreateLpPageInput): Promise<LpPage> {
  const id = crypto.randomUUID();
  const now = jstNow();

  await db
    .prepare(
      `INSERT INTO lp_pages
         (id, line_account_id, name, slug,
          content_type, video_url, body,
          access_window_mode, absolute_starts_at, absolute_ends_at, relative_days_after_friend_add,
          expired_redirect_url, not_friend_redirect_url,
          is_active, view_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      id,
      input.lineAccountId ?? null,
      input.name,
      input.slug,
      input.contentType,
      input.videoUrl ?? null,
      input.body ?? null,
      input.accessWindowMode,
      input.absoluteStartsAt ?? null,
      input.absoluteEndsAt ?? null,
      input.relativeDaysAfterFriendAdd ?? null,
      input.expiredRedirectUrl,
      input.notFriendRedirectUrl ?? null,
      input.isActive === false ? 0 : 1,
      now,
      now,
    )
    .run();

  return (await getLpPageById(db, id))!;
}

export interface UpdateLpPageInput {
  name?: string;
  slug?: string;
  contentType?: ContentType;
  videoUrl?: string | null;
  body?: string | null;
  accessWindowMode?: AccessWindowMode;
  absoluteStartsAt?: string | null;
  absoluteEndsAt?: string | null;
  relativeDaysAfterFriendAdd?: number | null;
  expiredRedirectUrl?: string;
  notFriendRedirectUrl?: string | null;
  lineAccountId?: string | null;
  isActive?: boolean;
}

export async function updateLpPage(
  db: D1Database,
  id: string,
  input: UpdateLpPageInput,
): Promise<LpPage | null> {
  const existing = await getLpPageById(db, id);
  if (!existing) return null;

  const now = jstNow();
  await db
    .prepare(
      `UPDATE lp_pages
         SET line_account_id = ?,
             name = ?,
             slug = ?,
             content_type = ?,
             video_url = ?,
             body = ?,
             access_window_mode = ?,
             absolute_starts_at = ?,
             absolute_ends_at = ?,
             relative_days_after_friend_add = ?,
             expired_redirect_url = ?,
             not_friend_redirect_url = ?,
             is_active = ?,
             updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      'lineAccountId' in input ? (input.lineAccountId ?? null) : existing.line_account_id,
      input.name ?? existing.name,
      input.slug ?? existing.slug,
      input.contentType ?? existing.content_type,
      'videoUrl' in input ? (input.videoUrl ?? null) : existing.video_url,
      'body' in input ? (input.body ?? null) : existing.body,
      input.accessWindowMode ?? existing.access_window_mode,
      'absoluteStartsAt' in input ? (input.absoluteStartsAt ?? null) : existing.absolute_starts_at,
      'absoluteEndsAt' in input ? (input.absoluteEndsAt ?? null) : existing.absolute_ends_at,
      'relativeDaysAfterFriendAdd' in input
        ? (input.relativeDaysAfterFriendAdd ?? null)
        : existing.relative_days_after_friend_add,
      input.expiredRedirectUrl ?? existing.expired_redirect_url,
      'notFriendRedirectUrl' in input
        ? (input.notFriendRedirectUrl ?? null)
        : existing.not_friend_redirect_url,
      'isActive' in input ? (input.isActive ? 1 : 0) : existing.is_active,
      now,
      id,
    )
    .run();

  return getLpPageById(db, id);
}

export async function deleteLpPage(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM lp_pages WHERE id = ?`).bind(id).run();
}

// ── Views ───────────────────────────────────────────────────────────────────

export interface CreateLpViewInput {
  lpPageId: string;
  friendId?: string | null;
  lineUserId?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  accessResult: AccessResultStatus;
  reason?: string | null;
}

export async function createLpView(
  db: D1Database,
  input: CreateLpViewInput,
): Promise<LpView> {
  const id = crypto.randomUUID();
  const now = jstNow();

  await db
    .prepare(
      `INSERT INTO lp_views
         (id, lp_page_id, friend_id, line_user_id, viewed_at, user_agent, referrer, access_result, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.lpPageId,
      input.friendId ?? null,
      input.lineUserId ?? null,
      now,
      input.userAgent ?? null,
      input.referrer ?? null,
      input.accessResult,
      input.reason ?? null,
    )
    .run();

  if (input.accessResult === 'allowed') {
    await db
      .prepare(`UPDATE lp_pages SET view_count = view_count + 1, updated_at = ? WHERE id = ?`)
      .bind(now, input.lpPageId)
      .run();
  }

  return (await db
    .prepare(`SELECT * FROM lp_views WHERE id = ?`)
    .bind(id)
    .first<LpView>())!;
}

export async function getLpViews(
  db: D1Database,
  lpPageId: string,
  limit = 200,
): Promise<Array<LpView & { friend_name: string | null }>> {
  const result = await db
    .prepare(
      `SELECT v.*, f.display_name as friend_name FROM lp_views v
         LEFT JOIN friends f ON f.id = v.friend_id
        WHERE v.lp_page_id = ?
        ORDER BY v.viewed_at DESC
        LIMIT ?`,
    )
    .bind(lpPageId, limit)
    .all<LpView & { friend_name: string | null }>();
  return result.results;
}
