import { describe, expect, test } from 'vitest';
import { signGateToken, verifyGateToken } from './gate-token.js';

const SECRET = 'test-secret';
const NOW = 1_800_000_000;

describe('gate token', () => {
  test('sign → verify が通る', async () => {
    const token = await signGateToken(SECRET, 'kr-note', NOW + 3600);
    expect(await verifyGateToken(SECRET, 'kr-note', token, NOW)).toBe(true);
  });

  test('期限切れは reject', async () => {
    const token = await signGateToken(SECRET, 'kr-note', NOW - 1);
    expect(await verifyGateToken(SECRET, 'kr-note', token, NOW)).toBe(false);
  });

  test('site が違うと reject', async () => {
    const token = await signGateToken(SECRET, 'kr-note', NOW + 3600);
    expect(await verifyGateToken(SECRET, 'other-site', token, NOW)).toBe(false);
  });

  test('secret が違うと reject', async () => {
    const token = await signGateToken('another', 'kr-note', NOW + 3600);
    expect(await verifyGateToken(SECRET, 'kr-note', token, NOW)).toBe(false);
  });

  test('改ざん・不正形式は reject', async () => {
    const token = await signGateToken(SECRET, 'kr-note', NOW + 3600);
    expect(await verifyGateToken(SECRET, 'kr-note', token + 'x', NOW)).toBe(false);
    expect(await verifyGateToken(SECRET, 'kr-note', 'garbage', NOW)).toBe(false);
    expect(await verifyGateToken(SECRET, 'kr-note', '', NOW)).toBe(false);
  });
});
