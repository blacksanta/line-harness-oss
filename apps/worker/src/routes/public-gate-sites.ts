import { Hono } from 'hono';
import {
  getPublicGateSites,
  getPublicGateSiteById,
  createPublicGateSite,
  updatePublicGateSite,
  deletePublicGateSite,
  parseAllowedReturnOrigins,
} from '@line-crm/db';
import type { PublicGateSite } from '@line-crm/db';
import type { Env } from '../index.js';

const publicGateSites = new Hono<Env>();

function serialize(site: PublicGateSite) {
  return {
    id: site.id,
    siteKey: site.site_key,
    requiredTagId: site.required_tag_id,
    allowedReturnOrigins: parseAllowedReturnOrigins(site.allowed_return_origins),
    headerImageR2Key: site.header_image_r2_key,
    isActive: Boolean(site.is_active),
    createdAt: site.created_at,
    updatedAt: site.updated_at,
  };
}

const MAX_HEADER_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

// GET /api/public-gate-sites — list all
publicGateSites.get('/api/public-gate-sites', async (c) => {
  try {
    const sites = await getPublicGateSites(c.env.DB);
    return c.json({ success: true, data: sites.map(serialize) });
  } catch (err) {
    console.error('GET /api/public-gate-sites error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/public-gate-sites — create
publicGateSites.post('/api/public-gate-sites', async (c) => {
  try {
    const body = await c.req.json<{
      siteKey: string;
      requiredTagId: string;
      allowedReturnOrigins: string[];
    }>();

    if (!body.siteKey || !body.requiredTagId || !Array.isArray(body.allowedReturnOrigins)) {
      return c.json(
        { success: false, error: 'siteKey, requiredTagId, and allowedReturnOrigins are required' },
        400,
      );
    }

    const site = await createPublicGateSite(c.env.DB, {
      siteKey: body.siteKey,
      requiredTagId: body.requiredTagId,
      allowedReturnOrigins: body.allowedReturnOrigins,
    });
    return c.json({ success: true, data: serialize(site) }, 201);
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE constraint')) {
      return c.json({ success: false, error: 'このsite_keyは既に使われています' }, 409);
    }
    console.error('POST /api/public-gate-sites error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PUT /api/public-gate-sites/:id — update
publicGateSites.put('/api/public-gate-sites/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      requiredTagId?: string;
      allowedReturnOrigins?: string[];
      isActive?: boolean;
    }>();

    const updated = await updatePublicGateSite(c.env.DB, id, {
      requiredTagId: body.requiredTagId,
      allowedReturnOrigins: body.allowedReturnOrigins,
      isActive: body.isActive,
    });

    if (!updated) {
      return c.json({ success: false, error: 'Public gate site not found' }, 404);
    }
    return c.json({ success: true, data: serialize(updated) });
  } catch (err) {
    console.error('PUT /api/public-gate-sites/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/public-gate-sites/:id/image — ヘッダー画像アップロード
publicGateSites.post('/api/public-gate-sites/:id/image', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getPublicGateSiteById(c.env.DB, id);
    if (!existing) {
      return c.json({ success: false, error: 'Public gate site not found' }, 404);
    }

    const contentType = c.req.header('content-type') ?? '';
    if (contentType !== 'image/png' && contentType !== 'image/jpeg') {
      return c.json({ success: false, error: 'content-type must be image/png or image/jpeg' }, 400);
    }

    const buf = new Uint8Array(await c.req.arrayBuffer());
    if (buf.byteLength === 0) {
      return c.json({ success: false, error: 'empty file' }, 400);
    }
    if (buf.byteLength > MAX_HEADER_IMAGE_BYTES) {
      return c.json({ success: false, error: `file too large (max ${MAX_HEADER_IMAGE_BYTES} bytes)` }, 400);
    }

    const ext = contentType === 'image/png' ? 'png' : 'jpg';
    const key = `public-gate-sites/${id}/${Date.now()}.${ext}`;
    await c.env.IMAGES.put(key, buf, { httpMetadata: { contentType } });

    const updated = await updatePublicGateSite(c.env.DB, id, { headerImageR2Key: key });
    return c.json({ success: true, data: serialize(updated!) });
  } catch (err) {
    console.error('POST /api/public-gate-sites/:id/image error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/public-gate-sites/:id
publicGateSites.delete('/api/public-gate-sites/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getPublicGateSiteById(c.env.DB, id);
    if (!existing) {
      return c.json({ success: false, error: 'Public gate site not found' }, 404);
    }
    await deletePublicGateSite(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/public-gate-sites/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/public-gate-images/:key — ヘッダー画像配信。認証不要（note-site等の
// <img src> から直接取得するため）。auth.ts のpublic allowlistに追加が必要。
// public-gate-sites/ prefix 以外は404でガードし、バケット内の他オブジェクトを
// 誤って公開しないようにする。
publicGateSites.get('/api/public-gate-images/:key{.+}', async (c) => {
  const key = c.req.param('key');
  if (!key.startsWith('public-gate-sites/')) return c.notFound();
  const obj = await c.env.IMAGES.get(key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  });
});

export { publicGateSites };
