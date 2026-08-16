import { describe, expect, test, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

// `@line-crm/db` の関数のうち、テスト対象の挙動を観測するために必要なものだけ
// モックする。normalizeBlocks / deriveBlocksFromLegacy / deriveLegacyFromBlocks /
// parseBlocks は実装をそのまま使いたい（reservation 判定が正しく走ることまで含めて検証）。
const dbMocks = vi.hoisted(() => ({
  getLpPages: vi.fn(),
  getLpPageById: vi.fn(),
  getLpPageBySlug: vi.fn(),
  createLpPage: vi.fn(),
  updateLpPage: vi.fn(),
  deleteLpPage: vi.fn(),
  createLpView: vi.fn(),
  getLpViews: vi.fn(),
  isLpAccessible: vi.fn(),
  computeLpExpiryMs: vi.fn(),
  getFriendByLineUserId: vi.fn(),
}));

vi.mock('@line-crm/db', async () => {
  const actual = await vi.importActual<typeof import('@line-crm/db')>('@line-crm/db');
  return {
    ...actual,
    ...dbMocks,
  };
});

const { lpPages } = await import('./lp-pages.js');

type TestEnv = { Bindings: { DB: D1Database } };

function setupApp(): Hono<TestEnv> {
  const app = new Hono<TestEnv>();
  app.use('*', async (c, next) => {
    c.env = { DB: {} as D1Database };
    await next();
  });
  app.route('/', lpPages);
  return app;
}

const reservationBlock = {
  id: 'b1',
  type: 'reservation' as const,
  reservationType: 'event' as const,
  eventId: 'evt-1',
  menuId: null,
  label: '予約お申し込み',
  style: 'primary' as const,
};
const markdownBlock = { id: 'b0', type: 'markdown' as const, text: 'hello' };

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getLpPageBySlug.mockResolvedValue(null); // slug 重複なし
  dbMocks.createLpPage.mockImplementation(async (_db, payload) => ({
    id: 'lp-1',
    line_account_id: payload.lineAccountId ?? null,
    name: payload.name,
    slug: payload.slug,
    video_url: payload.videoUrl ?? null,
    body: payload.body ?? null,
    blocks: JSON.stringify(payload.blocks ?? []),
    access_window_mode: payload.accessWindowMode,
    absolute_starts_at: null,
    absolute_ends_at: null,
    relative_days_after_friend_add: null,
    expired_redirect_url: payload.expiredRedirectUrl,
    not_friend_redirect_url: null,
    is_active: 1,
    view_count: 0,
    created_at: '2026-06-07T00:00:00.000Z',
    updated_at: '2026-06-07T00:00:00.000Z',
  }));
});

describe('POST /api/lp-pages — reservation block requires lineAccountId', () => {
  test('rejects when blocks contain reservation and lineAccountId is omitted', async () => {
    const app = setupApp();
    const res = await app.request('/api/lp-pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'テスト',
        blocks: [markdownBlock, reservationBlock],
        accessWindowMode: 'none',
        expiredRedirectUrl: 'https://example.com/expired',
      }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/lineAccountId is required when blocks contain a reservation/);
    expect(dbMocks.createLpPage).not.toHaveBeenCalled();
  });

  test('rejects when blocks contain reservation and lineAccountId is empty string', async () => {
    const app = setupApp();
    const res = await app.request('/api/lp-pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'テスト',
        blocks: [reservationBlock],
        accessWindowMode: 'none',
        expiredRedirectUrl: 'https://example.com/expired',
        lineAccountId: '',
      }),
    });
    expect(res.status).toBe(400);
    expect(dbMocks.createLpPage).not.toHaveBeenCalled();
  });

  test('accepts when blocks contain reservation and lineAccountId is provided', async () => {
    const app = setupApp();
    const res = await app.request('/api/lp-pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'テスト',
        blocks: [reservationBlock],
        accessWindowMode: 'none',
        expiredRedirectUrl: 'https://example.com/expired',
        lineAccountId: 'acc-1',
      }),
    });
    expect(res.status).toBe(201);
    expect(dbMocks.createLpPage).toHaveBeenCalledOnce();
  });

  test('accepts when blocks do NOT contain reservation and lineAccountId is omitted', async () => {
    const app = setupApp();
    const res = await app.request('/api/lp-pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'テスト',
        blocks: [markdownBlock],
        accessWindowMode: 'none',
        expiredRedirectUrl: 'https://example.com/expired',
      }),
    });
    expect(res.status).toBe(201);
    expect(dbMocks.createLpPage).toHaveBeenCalledOnce();
  });
});

describe('PUT /api/lp-pages/:id — reservation block requires lineAccountId', () => {
  const existingLp = {
    id: 'lp-1',
    line_account_id: 'acc-1',
    name: '既存LP',
    slug: 'test',
    video_url: null,
    body: null,
    blocks: JSON.stringify([markdownBlock]),
    access_window_mode: 'none' as const,
    absolute_starts_at: null,
    absolute_ends_at: null,
    relative_days_after_friend_add: null,
    expired_redirect_url: 'https://example.com/expired',
    not_friend_redirect_url: null,
    is_active: 1,
    view_count: 0,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  };

  test('rejects when explicitly setting lineAccountId to null while reservation block remains', async () => {
    dbMocks.getLpPageById.mockResolvedValue({
      ...existingLp,
      blocks: JSON.stringify([reservationBlock]),
    });
    const app = setupApp();
    const res = await app.request('/api/lp-pages/lp-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineAccountId: null }),
    });
    expect(res.status).toBe(400);
    expect(dbMocks.updateLpPage).not.toHaveBeenCalled();
  });

  test('rejects when adding reservation block to LP whose lineAccountId is already null', async () => {
    dbMocks.getLpPageById.mockResolvedValue({ ...existingLp, line_account_id: null });
    const app = setupApp();
    const res = await app.request('/api/lp-pages/lp-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: [reservationBlock] }),
    });
    expect(res.status).toBe(400);
    expect(dbMocks.updateLpPage).not.toHaveBeenCalled();
  });

  test('accepts when reservation block remains and existing lineAccountId is kept', async () => {
    dbMocks.getLpPageById.mockResolvedValue({
      ...existingLp,
      blocks: JSON.stringify([reservationBlock]),
    });
    dbMocks.updateLpPage.mockResolvedValue({
      ...existingLp,
      blocks: JSON.stringify([reservationBlock]),
    });
    const app = setupApp();
    const res = await app.request('/api/lp-pages/lp-1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '名前変更だけ' }),
    });
    expect(res.status).toBe(200);
    expect(dbMocks.updateLpPage).toHaveBeenCalledOnce();
  });
});
