// 外部サイト（Cloudflare Pages Functions等）向けの短命ゲートトークン。
// webinar-token.ts と同型のHMAC-SHA256。フル DRM ではなく「認可済みブラウザ
// かどうか」を site 単位で示すのが目的。line_user_id は含めない — 発行先の
// サイトは「誰か」を知る必要がなく、知らない方が漏洩時の被害も小さい。

function b64url(buf: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
}

export async function signGateToken(
  secret: string,
  site: string,
  expEpochSeconds: number,
): Promise<string> {
  const sig = await hmac(secret, `${site}:${expEpochSeconds}`);
  return `${expEpochSeconds}.${sig}`;
}

export async function verifyGateToken(
  secret: string,
  site: string,
  token: string,
  nowEpochSeconds: number,
): Promise<boolean> {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp < nowEpochSeconds) return false;
  const expected = await hmac(secret, `${site}:${exp}`);
  const actual = token.slice(dot + 1);
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return diff === 0;
}
