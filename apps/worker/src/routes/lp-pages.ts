import { Hono } from 'hono';
import {
  getLpPages,
  getLpPageById,
  getLpPageBySlug,
  createLpPage,
  updateLpPage,
  deleteLpPage,
  createLpView,
  getLpViews,
  isLpAccessible,
  computeLpExpiryMs,
  getFriendByLineUserId,
  type LpPage,
} from '@line-crm/db';
import type { Env } from '../index.js';

const lpPages = new Hono<Env>();

function serializeLpPage(row: LpPage) {
  return {
    id: row.id,
    lineAccountId: row.line_account_id,
    name: row.name,
    slug: row.slug,
    contentType: row.content_type,
    videoUrl: row.video_url,
    body: row.body,
    accessWindowMode: row.access_window_mode,
    absoluteStartsAt: row.absolute_starts_at,
    absoluteEndsAt: row.absolute_ends_at,
    relativeDaysAfterFriendAdd: row.relative_days_after_friend_add,
    expiredRedirectUrl: row.expired_redirect_url,
    notFriendRedirectUrl: row.not_friend_redirect_url,
    isActive: Boolean(row.is_active),
    viewCount: row.view_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ── 管理API（要auth） ────────────────────────────────────────────────────────

lpPages.get('/api/lp-pages', async (c) => {
  try {
    const items = await getLpPages(c.env.DB);
    return c.json({ success: true, data: items.map(serializeLpPage) });
  } catch (err) {
    console.error('GET /api/lp-pages error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

lpPages.get('/api/lp-pages/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const lp = await getLpPageById(c.env.DB, id);
    if (!lp) return c.json({ success: false, error: 'LP not found' }, 404);
    return c.json({ success: true, data: serializeLpPage(lp) });
  } catch (err) {
    console.error('GET /api/lp-pages/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

lpPages.post('/api/lp-pages', async (c) => {
  try {
    const body = await c.req.json<{
      name: string;
      slug?: string;
      contentType: 'video' | 'page';
      videoUrl?: string | null;
      body?: string | null;
      accessWindowMode: 'absolute' | 'relative' | 'both' | 'none';
      absoluteStartsAt?: string | null;
      absoluteEndsAt?: string | null;
      relativeDaysAfterFriendAdd?: number | null;
      expiredRedirectUrl: string;
      notFriendRedirectUrl?: string | null;
      lineAccountId?: string | null;
      isActive?: boolean;
    }>();

    if (!body.name) return c.json({ success: false, error: 'name is required' }, 400);
    if (!body.contentType) return c.json({ success: false, error: 'contentType is required' }, 400);
    if (!body.expiredRedirectUrl) return c.json({ success: false, error: 'expiredRedirectUrl is required' }, 400);
    if (body.contentType === 'video' && !body.videoUrl) {
      return c.json({ success: false, error: 'videoUrl is required for video content' }, 400);
    }
    if (body.contentType === 'page' && !body.body) {
      return c.json({ success: false, error: 'body is required for page content' }, 400);
    }
    if ((body.accessWindowMode === 'relative' || body.accessWindowMode === 'both') && !body.relativeDaysAfterFriendAdd) {
      return c.json({ success: false, error: 'relativeDaysAfterFriendAdd is required for relative/both mode' }, 400);
    }

    const slug = body.slug?.trim() || crypto.randomUUID().slice(0, 8);

    const existing = await getLpPageBySlug(c.env.DB, slug);
    if (existing) {
      return c.json({ success: false, error: `slug "${slug}" is already taken` }, 409);
    }

    const lp = await createLpPage(c.env.DB, {
      name: body.name,
      slug,
      contentType: body.contentType,
      videoUrl: body.videoUrl ?? null,
      body: body.body ?? null,
      accessWindowMode: body.accessWindowMode,
      absoluteStartsAt: body.absoluteStartsAt ?? null,
      absoluteEndsAt: body.absoluteEndsAt ?? null,
      relativeDaysAfterFriendAdd: body.relativeDaysAfterFriendAdd ?? null,
      expiredRedirectUrl: body.expiredRedirectUrl,
      notFriendRedirectUrl: body.notFriendRedirectUrl ?? null,
      lineAccountId: body.lineAccountId ?? null,
      isActive: body.isActive,
    });

    const origin = new URL(c.req.url).origin;
    return c.json(
      {
        success: true,
        data: { ...serializeLpPage(lp), publicUrl: `${origin}/lp/${lp.slug}` },
      },
      201,
    );
  } catch (err) {
    console.error('POST /api/lp-pages error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

lpPages.put('/api/lp-pages/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<Record<string, unknown>>();

    const updates: Record<string, unknown> = {};
    const passthrough = [
      'name', 'slug', 'contentType', 'videoUrl', 'body',
      'accessWindowMode', 'absoluteStartsAt', 'absoluteEndsAt', 'relativeDaysAfterFriendAdd',
      'expiredRedirectUrl', 'notFriendRedirectUrl', 'lineAccountId', 'isActive',
    ] as const;
    for (const k of passthrough) {
      if (k in body) updates[k] = body[k];
    }

    if (typeof updates.slug === 'string') {
      const dup = await getLpPageBySlug(c.env.DB, updates.slug);
      if (dup && dup.id !== id) {
        return c.json({ success: false, error: `slug "${updates.slug}" is already taken` }, 409);
      }
    }

    const updated = await updateLpPage(c.env.DB, id, updates as never);
    if (!updated) return c.json({ success: false, error: 'LP not found' }, 404);

    return c.json({ success: true, data: serializeLpPage(updated) });
  } catch (err) {
    console.error('PUT /api/lp-pages/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

lpPages.delete('/api/lp-pages/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const lp = await getLpPageById(c.env.DB, id);
    if (!lp) return c.json({ success: false, error: 'LP not found' }, 404);
    await deleteLpPage(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/lp-pages/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

lpPages.get('/api/lp-pages/:id/views', async (c) => {
  try {
    const id = c.req.param('id');
    const lp = await getLpPageById(c.env.DB, id);
    if (!lp) return c.json({ success: false, error: 'LP not found' }, 404);
    const views = await getLpViews(c.env.DB, id);
    return c.json({ success: true, data: views });
  } catch (err) {
    console.error('GET /api/lp-pages/:id/views error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ── 公開API（auth middleware でスキップ済み） ────────────────────────────────

// LIFF クライアントが LP メタを取得（コンテンツ本体は含まない）
lpPages.get('/api/lp-pages/by-slug/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const lp = await getLpPageBySlug(c.env.DB, slug);
    if (!lp || !lp.is_active) return c.json({ success: false, error: 'LP not found' }, 404);
    return c.json({
      success: true,
      data: {
        id: lp.id,
        name: lp.name,
        slug: lp.slug,
        contentType: lp.content_type,
      },
    });
  } catch (err) {
    console.error('GET /api/lp-pages/by-slug/:slug error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// LIFF 認証後にここで期限判定 → コンテンツ返却 or リダイレクトURL返却
lpPages.post('/api/lp-pages/:id/check-access', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ lineUserId?: string }>();
    const lineUserId = body.lineUserId;

    const lp = await getLpPageById(c.env.DB, id);
    if (!lp) return c.json({ success: false, error: 'LP not found' }, 404);

    const friend = lineUserId ? await getFriendByLineUserId(c.env.DB, lineUserId) : null;

    const result = isLpAccessible(lp, friend ? { id: friend.id, created_at: friend.created_at } : null);

    const userAgent = c.req.header('user-agent') ?? null;
    const referrer = c.req.header('referer') ?? null;

    await createLpView(c.env.DB, {
      lpPageId: lp.id,
      friendId: friend?.id ?? null,
      lineUserId: lineUserId ?? null,
      userAgent,
      referrer,
      accessResult: result.allowed ? 'allowed' : result.reason,
      reason: result.allowed ? null : result.reason,
    });

    if (!result.allowed) {
      return c.json({ success: true, data: { allowed: false, redirectUrl: result.redirectUrl, reason: result.reason } });
    }

    return c.json({
      success: true,
      data: {
        allowed: true,
        payload: {
          contentType: lp.content_type,
          videoUrl: lp.video_url,
          body: lp.body,
          name: lp.name,
        },
        expiresAtMs: computeLpExpiryMs(
          lp,
          friend ? { created_at: friend.created_at } : null,
        ),
        serverNowMs: Date.now(),
        expiredRedirectUrl: lp.expired_redirect_url,
      },
    });
  } catch (err) {
    console.error('POST /api/lp-pages/:id/check-access error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { lpPages };
