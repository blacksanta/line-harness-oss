import { describe, it, expect } from 'vitest';
import {
  isLpAccessible,
  computeLpExpiryMs,
  parseBlocks,
  deriveBlocksFromLegacy,
  deriveLegacyFromBlocks,
  normalizeBlocks,
  type LpPage,
} from '@line-crm/db';

const baseLp: LpPage = {
  id: 'lp_1',
  line_account_id: null,
  name: 'テスト',
  slug: 'test',
  video_url: 'https://www.youtube.com/watch?v=xxx',
  body: null,
  blocks: null,
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

describe('parseBlocks', () => {
  it('null は []', () => {
    expect(parseBlocks(null)).toEqual([]);
  });

  it('空文字は []', () => {
    expect(parseBlocks('')).toEqual([]);
  });

  it('不正JSONは []', () => {
    expect(parseBlocks('{not json}')).toEqual([]);
  });

  it('配列でない場合は []', () => {
    expect(parseBlocks('{"type":"video"}')).toEqual([]);
  });

  it('正常な配列はそのまま返す', () => {
    const raw = JSON.stringify([
      { id: 'a', type: 'video', url: 'https://example.com/v' },
      { id: 'b', type: 'markdown', text: 'hello' },
    ]);
    expect(parseBlocks(raw)).toHaveLength(2);
  });

  it('typeが文字列でない要素は除外', () => {
    const raw = JSON.stringify([
      { id: 'a', type: 'video', url: 'https://example.com/v' },
      { id: 'b' },
      'not-an-object',
    ]);
    expect(parseBlocks(raw)).toHaveLength(1);
  });
});

describe('deriveBlocksFromLegacy', () => {
  it('video のみ → [video]', () => {
    const r = deriveBlocksFromLegacy('https://youtu.be/x', null);
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('video');
  });

  it('body のみ → [markdown]', () => {
    const r = deriveBlocksFromLegacy(null, '# title');
    expect(r).toHaveLength(1);
    expect(r[0].type).toBe('markdown');
  });

  it('両方 → [video, markdown]', () => {
    const r = deriveBlocksFromLegacy('https://youtu.be/x', '# title');
    expect(r.map((b) => b.type)).toEqual(['video', 'markdown']);
  });

  it('両方なし → []', () => {
    expect(deriveBlocksFromLegacy(null, null)).toEqual([]);
  });

  it('空白文字のみは扱わない', () => {
    expect(deriveBlocksFromLegacy('   ', '  ')).toEqual([]);
  });
});

describe('deriveLegacyFromBlocks', () => {
  it('最初の video が videoUrl になる', () => {
    const r = deriveLegacyFromBlocks([
      { id: '1', type: 'video', url: 'https://a/1' },
      { id: '2', type: 'video', url: 'https://a/2' },
    ]);
    expect(r.videoUrl).toBe('https://a/1');
  });

  it('markdown 複数は --- で連結', () => {
    const r = deriveLegacyFromBlocks([
      { id: '1', type: 'markdown', text: 'intro' },
      { id: '2', type: 'markdown', text: 'outro' },
    ]);
    expect(r.body).toBe('intro\n\n---\n\noutro');
  });

  it('video/markdown が無い場合は null/null', () => {
    const r = deriveLegacyFromBlocks([{ id: '1', type: 'divider' }]);
    expect(r).toEqual({ videoUrl: null, body: null });
  });
});

describe('normalizeBlocks', () => {
  it('id 欠落は自動採番', () => {
    const r = normalizeBlocks([{ type: 'markdown', text: 'hi' }]);
    expect(r[0].id).toBeTruthy();
  });

  it('未知の type は throw', () => {
    expect(() => normalizeBlocks([{ type: 'unknown' }])).toThrow();
  });

  it('video.url 必須', () => {
    expect(() => normalizeBlocks([{ type: 'video', url: '' }])).toThrow();
  });

  it('button.label/href 必須', () => {
    expect(() => normalizeBlocks([{ type: 'button', label: '', href: 'x' }])).toThrow();
    expect(() => normalizeBlocks([{ type: 'button', label: 'ok', href: '' }])).toThrow();
  });

  it('divider はフィールド不要', () => {
    const r = normalizeBlocks([{ type: 'divider' }]);
    expect(r[0]).toMatchObject({ type: 'divider' });
  });

  it('image の alt/href は省略可', () => {
    const r = normalizeBlocks([{ type: 'image', url: 'https://x' }]);
    expect(r[0]).toMatchObject({ type: 'image', url: 'https://x', alt: null, href: null });
  });

  it('配列でない入力は throw', () => {
    expect(() => normalizeBlocks('not-an-array' as never)).toThrow();
  });
});
