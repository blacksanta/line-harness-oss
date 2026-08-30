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
    isActive: Boolean(site.is_active),
    createdAt: site.created_at,
    updatedAt: site.updated_at,
  };
}

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

export { publicGateSites };
