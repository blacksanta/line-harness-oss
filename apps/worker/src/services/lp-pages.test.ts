import { describe, it, expect } from 'vitest';
import { isLpAccessible, computeLpExpiryMs, type LpPage } from '@line-crm/db';

const baseLp: LpPage = {
  id: 'lp_1',
  line_account_id: null,
  name: 'テスト',
  slug: 'test',
  video_url: 'https://www.youtube.com/watch?v=xxx',
  body: null,
  access_window_mode: 'none',
  absolute_starts_at: null,
  absolute_ends_at: null,
  relative_days_after_friend_add: null,
  expired_redirect_url: 'https://example.com/expired',
  not_friend_redirect_url: null,
  is_active: 1,
  view_count: 0,
  created_at: '2026-05-01T00:00:00.000+09:00',
  updated_at: '2026-05-01T00:00:00.000+09:00',
};

const friend = { id: 'f_1', created_at: '2026-05-01T00:00:00.000+09:00' };

describe('isLpAccessible', () => {
  it('is_active=0 なら inactive で拒否', () => {
    const r = isLpAccessible({ ...baseLp, is_active: 0 }, friend, new Date('2026-05-02T00:00:00+09:00'));
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('inactive');
  });

  it('friend=null なら not_friend で拒否', () => {
    const r = isLpAccessible(baseLp, null);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.reason).toBe('not_friend');
      expect(r.redirectUrl).toBe('https://example.com/expired');
    }
  });

  it('not_friend_redirect_url が設定されていればそちらを使う', () => {
    const r = isLpAccessible(
      { ...baseLp, not_friend_redirect_url: 'https://example.com/add-friend' },
      null,
    );
    if (!r.allowed) expect(r.redirectUrl).toBe('https://example.com/add-friend');
  });

  it('access_window_mode=none なら友だちなら常にOK', () => {
    expect(isLpAccessible(baseLp, friend).allowed).toBe(true);
  });

  describe('absolute モード', () => {
    const lp: LpPage = {
      ...baseLp,
      access_window_mode: 'absolute',
      absolute_starts_at: '2026-05-10T00:00:00.000+09:00',
      absolute_ends_at: '2026-05-20T23:59:59.000+09:00',
    };

    it('開始前は not_yet', () => {
      const r = isLpAccessible(lp, friend, new Date('2026-05-09T23:00:00+09:00'));
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.reason).toBe('not_yet');
    });

    it('期間内はOK', () => {
      expect(isLpAccessible(lp, friend, new Date('2026-05-15T12:00:00+09:00')).allowed).toBe(true);
    });

    it('終了後は expired', () => {
      const r = isLpAccessible(lp, friend, new Date('2026-05-21T00:00:01+09:00'));
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.reason).toBe('expired');
    });

    it('starts_at だけ設定でも動く', () => {
      const lp2 = { ...lp, absolute_ends_at: null };
      expect(isLpAccessible(lp2, friend, new Date('2030-01-01+09:00')).allowed).toBe(true);
    });
  });

  describe('relative モード（友だち登録から N 日）', () => {
    const lp: LpPage = {
      ...baseLp,
      access_window_mode: 'relative',
      relative_days_after_friend_add: 7,
    };
    const f7 = { id: 'f_x', created_at: '2026-05-01T00:00:00.000+09:00' };

    it('登録直後はOK', () => {
      expect(isLpAccessible(lp, f7, new Date('2026-05-01T01:00:00+09:00')).allowed).toBe(true);
    });

    it('6日後はOK', () => {
      expect(isLpAccessible(lp, f7, new Date('2026-05-07T23:00:00+09:00')).allowed).toBe(true);
    });

    it('7日+1秒で expired', () => {
      const r = isLpAccessible(lp, f7, new Date('2026-05-08T00:00:01+09:00'));
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.reason).toBe('expired');
    });
  });

  describe('both モード（AND）', () => {
    const lp: LpPage = {
      ...baseLp,
      access_window_mode: 'both',
      absolute_starts_at: '2026-05-10T00:00:00.000+09:00',
      absolute_ends_at: '2026-05-20T23:59:59.000+09:00',
      relative_days_after_friend_add: 7,
    };
    const f10 = { id: 'f_y', created_at: '2026-05-10T00:00:00.000+09:00' };

    it('絶対期間内かつ相対期間内：OK', () => {
      expect(isLpAccessible(lp, f10, new Date('2026-05-12T12:00:00+09:00')).allowed).toBe(true);
    });

    it('絶対期間内だが相対期限切れ：expired', () => {
      const r = isLpAccessible(lp, f10, new Date('2026-05-18T00:00:00+09:00'));
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.reason).toBe('expired');
    });

    it('絶対開始前：not_yet（絶対期間が先に評価される）', () => {
      const r = isLpAccessible(lp, f10, new Date('2026-05-09T00:00:00+09:00'));
      expect(r.allowed).toBe(false);
      if (!r.allowed) expect(r.reason).toBe('not_yet');
    });
  });
});

describe('computeLpExpiryMs', () => {
  it('none モードは null', () => {
    expect(computeLpExpiryMs(baseLp, friend)).toBeNull();
  });

  it('absolute モード: end の epoch ms を返す', () => {
    const lp: LpPage = {
      ...baseLp,
      access_window_mode: 'absolute',
      absolute_ends_at: '2026-05-20T23:59:59.000+09:00',
    };
    expect(computeLpExpiryMs(lp, friend)).toBe(
      new Date('2026-05-20T23:59:59.000+09:00').getTime(),
    );
  });

  it('absolute モードで end が null なら null', () => {
    const lp: LpPage = { ...baseLp, access_window_mode: 'absolute' };
    expect(computeLpExpiryMs(lp, friend)).toBeNull();
  });

  it('relative モード: friend.created_at + N日', () => {
    const lp: LpPage = {
      ...baseLp,
      access_window_mode: 'relative',
      relative_days_after_friend_add: 7,
    };
    const f = { created_at: '2026-05-01T00:00:00.000+09:00' };
    expect(computeLpExpiryMs(lp, f)).toBe(
      new Date('2026-05-08T00:00:00.000+09:00').getTime(),
    );
  });

  it('relative モード: friend が null なら null', () => {
    const lp: LpPage = {
      ...baseLp,
      access_window_mode: 'relative',
      relative_days_after_friend_add: 7,
    };
    expect(computeLpExpiryMs(lp, null)).toBeNull();
  });

  it('relative モード: 日数が null なら null', () => {
    const lp: LpPage = {
      ...baseLp,
      access_window_mode: 'relative',
      relative_days_after_friend_add: null,
    };
    expect(computeLpExpiryMs(lp, friend)).toBeNull();
  });

  it('both モード: 早い方（absolute）を返す', () => {
    const lp: LpPage = {
      ...baseLp,
      access_window_mode: 'both',
      absolute_ends_at: '2026-05-05T00:00:00.000+09:00',
      relative_days_after_friend_add: 30,
    };
    const f = { created_at: '2026-05-01T00:00:00.000+09:00' };
    expect(computeLpExpiryMs(lp, f)).toBe(
      new Date('2026-05-05T00:00:00.000+09:00').getTime(),
    );
  });

  it('both モード: 早い方（relative）を返す', () => {
    const lp: LpPage = {
      ...baseLp,
      access_window_mode: 'both',
      absolute_ends_at: '2026-06-01T00:00:00.000+09:00',
      relative_days_after_friend_add: 3,
    };
    const f = { created_at: '2026-05-01T00:00:00.000+09:00' };
    expect(computeLpExpiryMs(lp, f)).toBe(
      new Date('2026-05-04T00:00:00.000+09:00').getTime(),
    );
  });

  it('both モード: 片方しか設定が無ければ設定された方を返す', () => {
    const lp: LpPage = {
      ...baseLp,
      access_window_mode: 'both',
      absolute_ends_at: '2026-05-05T00:00:00.000+09:00',
      relative_days_after_friend_add: null,
    };
    expect(computeLpExpiryMs(lp, friend)).toBe(
      new Date('2026-05-05T00:00:00.000+09:00').getTime(),
    );
  });

  it('both モード: 両方未設定なら null', () => {
    const lp: LpPage = { ...baseLp, access_window_mode: 'both' };
    expect(computeLpExpiryMs(lp, friend)).toBeNull();
  });
});
