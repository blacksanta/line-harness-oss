// 外部の静的サイト（Cloudflare Pages等、この monorepo の外）を LINE Login +
// タグ保有で閲覧ゲートするための汎用ルート。
//
// GET /public-gate/authorize?site=<key>&return=<url>
//   → LINE Login (access.line.me/oauth2/v2.1/authorize) へリダイレクト
// GET /public-gate/callback
//   → code を交換し id_token を検証、友だち + 必須タグを確認して
//     signGateToken を発行、return 先へ `?gate=<token>` を付けてリダイレクト
//
// 対象サイトは SITE_GATE_CONFIG に列挙する（DB マイグレーション不要）。
// 友だちでない / タグを持たない場合は「認可失敗」の簡易ページを返す（return
// 先へは進めない — フェイルクローズ）。

import { Hono } from 'hono';
import { getFriendByLineUserId, getFriendTags } from '@line-crm/db';
import { safeRedirectTarget } from '../lib/safe-redirect.js';
import { signGateToken } from '../lib/gate-token.js';
import { loginUnconfiguredPage } from '../lib/login-unconfigured.js';
import type { Env } from '../index.js';

const SITE_GATE_CONFIG: Record<string, { requiredTag: string; allowedReturnOrigins: string[] }> = {
  'kr-note': {
    requiredTag: 'note_purchased',
    allowedReturnOrigins: ['https://kr-note-3887c3.pages.dev'],
  },
};

function encodeState(state: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(state)));
}
function decodeState(encoded: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(encoded), (ch) => ch.charCodeAt(0)));
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function gateMessagePage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', 'Helvetica Neue', system-ui, sans-serif; background: #f5f7f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 20px; box-shadow: 0 2px 20px rgba(0,0,0,0.06); text-align: center; max-width: 480px; width: 90%; padding: 48px 32px; border: 1px solid rgba(0,0,0,0.04); }
    h2 { font-size: 18px; color: #333; margin-bottom: 16px; }
    p { font-size: 14px; color: #666; line-height: 1.8; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}

function isReturnOriginAllowed(target: string, allowedOrigins: string[]): boolean {
  if (target.startsWith('/')) return true; // root-relative は同一サイト内なので許可
  try {
    return allowedOrigins.includes(new URL(target).origin);
  } catch {
    return false;
  }
}

export const publicGateRoutes = new Hono<Env>();

publicGateRoutes.get('/public-gate/authorize', async (c) => {
  const site = c.req.query('site') || '';
  const config = SITE_GATE_CONFIG[site];
  if (!config) return c.text('unknown site', 404);

  const rawReturn = c.req.query('return') || '';
  const safeReturn = safeRedirectTarget(rawReturn);
  if (!safeReturn || !isReturnOriginAllowed(safeReturn, config.allowedReturnOrigins)) {
    return c.text('invalid return target', 400);
  }

  const channelId = c.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) return c.html(loginUnconfiguredPage(), 503);

  const baseUrl = new URL(c.req.url).origin;
  const state = encodeState(JSON.stringify({ site, return: safeReturn }));
  const loginUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
  loginUrl.searchParams.set('response_type', 'code');
  loginUrl.searchParams.set('client_id', channelId);
  loginUrl.searchParams.set('redirect_uri', `${baseUrl}/public-gate/callback`);
  loginUrl.searchParams.set('scope', 'profile openid');
  loginUrl.searchParams.set('state', state);

  return c.redirect(loginUrl.toString());
});

publicGateRoutes.get('/public-gate/callback', async (c) => {
  const code = c.req.query('code');
  const error = c.req.query('error');
  const stateParam = c.req.query('state') || '';

  let site = '';
  let returnTarget = '';
  try {
    const parsed = JSON.parse(decodeState(stateParam));
    site = parsed.site || '';
    returnTarget = parsed.return || '';
  } catch {
    // ignore
  }

  const config = SITE_GATE_CONFIG[site];
  if (!config) return c.text('unknown site', 404);
  // return は /authorize を経由しない state からも来うる（サイト側が直接
  // access.line.me へ遷移するケース）ため、/authorize と独立にここでも検証する。
  const safeReturn = safeRedirectTarget(returnTarget);
  if (!safeReturn || !isReturnOriginAllowed(safeReturn, config.allowedReturnOrigins)) {
    return c.text('invalid return target', 400);
  }
  returnTarget = safeReturn;
  if (error || !code) return c.html(gateMessagePage('ログインに失敗しました', 'もう一度お試しください。'), 400);

  const loginChannelId = c.env.LINE_LOGIN_CHANNEL_ID;
  const loginChannelSecret = c.env.LINE_LOGIN_CHANNEL_SECRET;
  const gateSecret = c.env.PUBLIC_GATE_SECRET;
  if (!loginChannelId || !loginChannelSecret) return c.html(loginUnconfiguredPage(), 503);
  if (!gateSecret) return c.html(gateMessagePage('設定エラー', 'この機能は現在利用できません。'), 503);

  const baseUrl = new URL(c.req.url).origin;
  const callbackUrl = `${baseUrl}/public-gate/callback`;

  const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
      client_id: loginChannelId,
      client_secret: loginChannelSecret,
    }),
  });
  if (!tokenRes.ok) {
    console.error('public-gate token exchange failed:', await tokenRes.text());
    return c.html(gateMessagePage('ログインに失敗しました', 'もう一度お試しください。'), 400);
  }
  const tokens = await tokenRes.json<{ id_token: string }>();

  const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: tokens.id_token, client_id: loginChannelId }),
  });
  if (!verifyRes.ok) {
    console.error('public-gate id_token verify failed:', await verifyRes.text());
    return c.html(gateMessagePage('ログインに失敗しました', 'もう一度お試しください。'), 400);
  }
  const verified = await verifyRes.json<{ sub?: string }>();
  if (!verified.sub) return c.html(gateMessagePage('ログインに失敗しました', 'もう一度お試しください。'), 400);

  const friend = await getFriendByLineUserId(c.env.DB, verified.sub);
  if (!friend || friend.is_following === 0) {
    return c.html(
      gateMessagePage(
        '友だち追加が必要です',
        'この内容を読むには、まず公式LINEアカウントを友だち追加してください。追加後、あらためてこのページを開き直してください。',
      ),
      403,
    );
  }

  const tags = await getFriendTags(c.env.DB, friend.id);
  const hasRequiredTag = tags.some((t) => t.name === config.requiredTag);
  if (!hasRequiredTag) {
    return c.html(
      gateMessagePage(
        '購入確認ができませんでした',
        'このコンテンツの購入が確認できませんでした。心当たりがある場合は、LINE公式アカウントまでお問い合わせください。',
      ),
      403,
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const gateToken = await signGateToken(gateSecret, site, nowSeconds + 300);
  const redirectUrl = new URL(returnTarget, baseUrl);
  redirectUrl.searchParams.set('gate', gateToken);
  return c.redirect(redirectUrl.toString());
});
