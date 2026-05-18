import { jstNow } from './utils.js';
// =============================================================================
// LP Pages — 視聴期限付きランディングページ（UTAGE風）
// =============================================================================

export type AccessWindowMode = 'absolute' | 'relative' | 'both' | 'none';
export type AccessReason = 'expired' | 'not_yet' | 'not_friend' | 'inactive';
export type AccessResultStatus = 'allowed' | 'expired' | 'not_yet' | 'not_friend' | 'inactive';

// ── ブロック型 ──────────────────────────────────────────────────────────────
export type LpBlock =
  | { id: string; type: 'video'; url: string; caption?: string | null }
  | { id: string; type: 'markdown'; text: string }
  | { id: string; type: 'image'; url: string; alt?: string | null; href?: string | null }
  | {
      id: string;
      type: 'button';
      label: string;
      href: string;
      style?: 'primary' | 'secondary';
    }
  | { id: string; type: 'divider' };

export type LpBlockType = LpBlock['type'];

export interface LpPage {
  id: string;
  line_account_id: string | null;
  name: string;
  slug: string;

  video_url: string | null;
  body: string | null;
  blocks: string | null;

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

// ── ブロックヘルパ（純粋関数） ──────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseBlocks(raw: string | null | undefined): LpBlock[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((b): b is LpBlock => isPlainObject(b) && typeof b.type === 'string');
  } catch {
    return [];
  }
}

export function deriveBlocksFromLegacy(
  videoUrl: string | null | undefined,
  body: string | null | undefined,
): LpBlock[] {
  const out: LpBlock[] = [];
  if (videoUrl && videoUrl.trim()) {
    out.push({ id: crypto.randomUUID(), type: 'video', url: videoUrl });
  }
  if (body && body.trim()) {
    out.push({ id: crypto.randomUUID(), type: 'markdown', text: body });
  }
  return out;
}

export function deriveLegacyFromBlocks(blocks: LpBlock[]): {
  videoUrl: string | null;
  body: string | null;
} {
  const firstVideo = blocks.find(
    (b): b is Extract<LpBlock, { type: 'video' }> => b.type === 'video',
  );
  const markdowns = blocks.filter(
    (b): b is Extract<LpBlock, { type: 'markdown' }> => b.type === 'markdown',
  );
  return {
    videoUrl: firstVideo?.url ?? null,
    body: markdowns.length ? markdowns.map((b) => b.text).join('\n\n---\n\n') : null,
  };
}

/**
 * ブロックを正規化する。id が無ければ採番、type / 必須フィールドを検証。
 * 不正なブロックは Error を throw（API層が 400 で返す前提）。
 */
export function normalizeBlocks(blocks: unknown): LpBlock[] {
  if (!Array.isArray(blocks)) throw new Error('blocks must be an array');
  return blocks.map((raw, i) => {
    if (!isPlainObject(raw)) throw new Error(`blocks[${i}] must be an object`);
    const id = typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID();
    const type = raw.type;
    switch (type) {
      case 'video': {
        if (typeof raw.url !== 'string' || !raw.url.trim()) {
          throw new Error(`blocks[${i}].url is required for video`);
        }
        const caption =
          typeof raw.caption === 'string' ? raw.caption : raw.caption == null ? null : null;
        return { id, type: 'video', url: raw.url, caption };
      }
      case 'markdown': {
        if (typeof raw.text !== 'string') {
          throw new Error(`blocks[${i}].text is required for markdown`);
        }
        return { id, type: 'markdown', text: raw.text };
      }
      case 'image': {
        if (typeof raw.url !== 'string' || !raw.url.trim()) {
          throw new Error(`blocks[${i}].url is required for image`);
        }
        const alt = typeof raw.alt === 'string' ? raw.alt : null;
        const href = typeof raw.href === 'string' && raw.href.trim() ? raw.href : null;
        return { id, type: 'image', url: raw.url, alt, href };
      }
      case 'button': {
        if (typeof raw.label !== 'string' || !raw.label.trim()) {
          throw new Error(`blocks[${i}].label is required for button`);
        }
        if (typeof raw.href !== 'string' || !raw.href.trim()) {
          throw new Error(`blocks[${i}].href is required for button`);
        }
        const style = raw.style === 'secondary' ? 'secondary' : 'primary';
        return { id, type: 'button', label: raw.label, href: raw.href, style };
      }
      case 'divider':
        return { id, type: 'divider' };
      default:
        throw new Error(`blocks[${i}].type "${String(type)}" is not supported`);
    }
  });
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
  videoUrl?: string | null;
  body?: string | null;
  blocks?: LpBlock[] | null;
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
          video_url, body, blocks,
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
      input.videoUrl ?? null,
      input.body ?? null,
      input.blocks ? JSON.stringify(input.blocks) : null,
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
  videoUrl?: string | null;
  body?: string | null;
  blocks?: LpBlock[] | null;
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
             video_url = ?,
             body = ?,
             blocks = ?,
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
      'videoUrl' in input ? (input.videoUrl ?? null) : existing.video_url,
      'body' in input ? (input.body ?? null) : existing.body,
      'blocks' in input
        ? input.blocks
          ? JSON.stringify(input.blocks)
          : null
        : existing.blocks,
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
