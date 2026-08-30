import { jstNow } from './utils.js';
// =============================================================================
// Public Gate Sites — /public-gate/* が参照する外部サイトのゲート設定
// =============================================================================

export interface PublicGateSite {
  id: string;
  site_key: string;
  required_tag_id: string;
  allowed_return_origins: string; // JSON配列文字列
  is_active: number;
  created_at: string;
  updated_at: string;
}

export function parseAllowedReturnOrigins(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

// ── Queries ─────────────────────────────────────────────────────────────────

export async function getPublicGateSites(db: D1Database): Promise<PublicGateSite[]> {
  const result = await db
    .prepare(`SELECT * FROM public_gate_sites ORDER BY created_at DESC`)
    .all<PublicGateSite>();
  return result.results;
}

export async function getPublicGateSiteById(
  db: D1Database,
  id: string,
): Promise<PublicGateSite | null> {
  return db.prepare(`SELECT * FROM public_gate_sites WHERE id = ?`).bind(id).first<PublicGateSite>();
}

export async function getPublicGateSiteBySiteKey(
  db: D1Database,
  siteKey: string,
): Promise<PublicGateSite | null> {
  return db
    .prepare(`SELECT * FROM public_gate_sites WHERE site_key = ? AND is_active = 1`)
    .bind(siteKey)
    .first<PublicGateSite>();
}

// ── Mutations ───────────────────────────────────────────────────────────────

export interface CreatePublicGateSiteInput {
  siteKey: string;
  requiredTagId: string;
  allowedReturnOrigins: string[];
}

export async function createPublicGateSite(
  db: D1Database,
  input: CreatePublicGateSiteInput,
): Promise<PublicGateSite> {
  const id = crypto.randomUUID();
  const now = jstNow();

  await db
    .prepare(
      `INSERT INTO public_gate_sites (id, site_key, required_tag_id, allowed_return_origins, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(id, input.siteKey, input.requiredTagId, JSON.stringify(input.allowedReturnOrigins), now, now)
    .run();

  return (await getPublicGateSiteById(db, id))!;
}

export interface UpdatePublicGateSiteInput {
  requiredTagId?: string;
  allowedReturnOrigins?: string[];
  isActive?: boolean;
}

export async function updatePublicGateSite(
  db: D1Database,
  id: string,
  updates: UpdatePublicGateSiteInput,
): Promise<PublicGateSite | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.requiredTagId !== undefined) {
    fields.push('required_tag_id = ?');
    values.push(updates.requiredTagId);
  }
  if (updates.allowedReturnOrigins !== undefined) {
    fields.push('allowed_return_origins = ?');
    values.push(JSON.stringify(updates.allowedReturnOrigins));
  }
  if (updates.isActive !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.isActive ? 1 : 0);
  }

  if (fields.length === 0) return getPublicGateSiteById(db, id);

  fields.push('updated_at = ?');
  values.push(jstNow());
  values.push(id);

  await db
    .prepare(`UPDATE public_gate_sites SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return getPublicGateSiteById(db, id);
}

export async function deletePublicGateSite(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM public_gate_sites WHERE id = ?`).bind(id).run();
}
