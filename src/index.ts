import { neon } from '@neondatabase/serverless';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  DATABASE_URL: string;
  ALLOWED_ORIGINS?: string;
}

type Db = (query: string, params?: unknown[]) => Promise<Row[]>;
type Row = Record<string, unknown>;

const app = new Hono<{ Bindings: Env }>();

function allowedOrigin(env: Env) {
  const configured = (env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes('*') ? '*' : configured;
}

app.use('*', async (c, next) => {
  const result = cors({
    origin: allowedOrigin(c.env),
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Store-Slug', 'X-Cart-Key'],
    maxAge: 86400,
  });
  return result(c, next);
});

app.use('*', async (c, next) => {
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
  // Explicitly apply CORS after the route as well, including normal error responses.
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Store-Slug, X-Cart-Key');
});

app.get('/', (c) => c.json({ ok: true, message: 'Neon Store API is running', service: 'neon-store-api' }));
app.get('/health', (c) => c.json({ ok: true, service: 'neon-store-api' }));

// Backward-compatible catalog alias for mobile clients.
app.use('/api/products', async (c) => {
  const url = new URL(c.req.url);
  if (url.pathname === '/api/products') {
    url.pathname = '/api/v1/products';
    return app.fetch(new Request(url, c.req.raw), c.env, c.executionCtx);
  }
});

function getDb(env: Env): Db {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  return neon(env.DATABASE_URL) as unknown as Db;
}

function getStoreSlug(c: { req: { query: (key: string) => string | undefined; header: (key: string) => string | undefined } }) {
  return (c.req.query('store') || c.req.header('X-Store-Slug') || '').trim();
}

async function findActiveStore(db: Db, slug: string): Promise<Row | null> {
  if (!slug) return null;
  const rows = await db(
    `select id, slug, display_name, logo_url, description, email, phone, currency, timezone
       from app.companies
      where slug = $1 and status = 'active'
      limit 1`,
    [slug],
  ) as Row[];
  return rows[0] || null;
}

function publicStore(store: Row) {
  return {
    id: store.id,
    slug: store.slug,
    displayName: store.display_name,
    logoUrl: store.logo_url,
    description: store.description,
    email: store.email,
    phone: store.phone,
    currency: store.currency,
    timezone: store.timezone,
  };
}

function error(c: any, status: 400 | 401 | 404 | 409 | 500, message: string) {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Store-Slug, X-Cart-Key');
  return c.json({ ok: false, error: { code: message.toUpperCase().replaceAll(' ', '_'), message } }, status);
}

async function requireStore(c: any, db: Db): Promise<Row | Response> {
  const slug = getStoreSlug(c);
  if (!slug) return error(c, 400, 'store is required');
  const store = await findActiveStore(db, slug);
  if (!store) return error(c, 404, 'store not found');
  return store;
}

function productJsonSql() {
  return `
    json_build_object(
      'id', p.id,
      'sku', p.sku,
      'name', p.name,
      'slug', p.slug,
      'description', p.description,
      'shortDescription', p.short_description,
      'status', p.status,
      'price', p.price,
      'compareAtPrice', p.compare_at_price,
      'currency', p.currency,
      'weightGrams', p.weight_grams,
      'brand', p.brand,
      'sellerName', p.seller_name,
      'trustedSeller', p.trusted_seller,
      'freeShipping', p.free_shipping,
      'isFeatured', p.is_featured,
      'isFlashDeal', p.is_flash_deal,
      'badge', p.badge,
      'rating', p.rating,
      'reviewCount', p.review_count,
      'metadata', p.metadata,
      'publishedAt', p.published_at,
      'category', case when cat.id is null then null else json_build_object(
        'id', cat.id, 'name', cat.name, 'slug', cat.slug, 'icon', cat.icon, 'imageUrl', cat.image_url
      ) end,
      'images', coalesce((select json_agg(json_build_object(
        'id', pi.id, 'url', pi.url, 'altText', pi.alt_text, 'sortOrder', pi.sort_order, 'isPrimary', pi.is_primary
      ) order by pi.sort_order, pi.created_at) from app.product_images pi where pi.product_id = p.id), '[]'::json),
      'variants', coalesce((select json_agg(json_build_object(
        'id', v.id, 'sku', v.sku, 'name', v.name, 'options', v.options,
        'price', coalesce(v.price, p.price), 'compareAtPrice', v.compare_at_price,
        'weightGrams', v.weight_grams, 'isActive', v.is_active
      ) order by v.created_at) from app.product_variants v where v.product_id = p.id and v.is_active), '[]'::json),
      'availableQuantity', coalesce((select sum(greatest(i.quantity_on_hand - i.quantity_reserved, 0)) from app.inventory i where i.product_id = p.id and i.company_id = p.company_id), 0),
      'stockQuantity', coalesce((select sum(greatest(i.quantity_on_hand - i.quantity_reserved, 0)) from app.inventory i where i.product_id = p.id and i.company_id = p.company_id), 0)
    )`;
}

app.get('/api/v1/stores/:slug', async (c) => {
  try {
    const store = await findActiveStore(getDb(c.env), c.req.param('slug'));
    return store ? c.json({ ok: true, data: publicStore(store) }) : error(c, 404, 'store not found');
  } catch (e) {
    console.error(e);
    return error(c, 500, 'database error');
  }
});

app.get('/api/v1/categories', async (c) => {
  try {
    const db = getDb(c.env);
    const store = await requireStore(c, db);
    if (store instanceof Response) return store;
    const rows = await db(
      `select id, parent_id, name, slug, icon, image_url, sort_order
         from app.categories
        where company_id = $1 and is_active
        order by sort_order, name`,
      [store.id],
    ) as Row[];
    return c.json({ ok: true, data: rows.map((r) => ({
      id: r.id, parentId: r.parent_id, name: r.name, slug: r.slug,
      icon: r.icon, imageUrl: r.image_url, sortOrder: r.sort_order,
    })) });
  } catch (e) {
    console.error(e);
    return error(c, 500, 'database error');
  }
});

app.get('/api/v1/products', async (c) => {
  try {
    const db = getDb(c.env);
    const store = await requireStore(c, db);
    if (store instanceof Response) return store;

    const page = Math.max(Number.parseInt(c.req.query('page') || '1', 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(c.req.query('limit') || '24', 10) || 24, 1), 100);
    const offset = (page - 1) * limit;
    const values: unknown[] = [store.id];
    const where = [`p.company_id = $1`, `p.status = 'active'`];

    const search = (c.req.query('search') || '').trim();
    if (search) {
      values.push(search);
      where.push(`to_tsvector('simple', coalesce(p.name, '') || ' ' || coalesce(p.description, '')) @@ plainto_tsquery('simple', $${values.length})`);
    }
    const category = (c.req.query('category') || '').trim();
    if (category) {
      values.push(category);
      where.push(`cat.slug = $${values.length}`);
    }
    for (const [key, column] of [['featured', 'p.is_featured'], ['flash_deal', 'p.is_flash_deal']] as const) {
      const value = c.req.query(key);
      if (value === 'true' || value === 'false') {
        values.push(value === 'true');
        where.push(`${column} = $${values.length}`);
      }
    }

    const sort = c.req.query('sort') || 'newest';
    const orderBy = sort === 'price_asc' ? 'p.price asc, p.created_at desc'
      : sort === 'price_desc' ? 'p.price desc, p.created_at desc'
      : sort === 'rating' ? 'p.rating desc, p.review_count desc, p.created_at desc'
      : sort === 'name' ? 'p.name asc'
      : 'p.published_at desc nulls last, p.created_at desc';

    const count = await db(
      `select count(*)::int as total from app.products p
       left join app.categories cat on cat.id = p.category_id and cat.company_id = p.company_id
       where ${where.join(' and ')}`,
      values,
    ) as Row[];

    const listValues = [...values, limit, offset];
    const rows = await db(
      `select ${productJsonSql()} as product
         from app.products p
         left join app.categories cat on cat.id = p.category_id and cat.company_id = p.company_id
        where ${where.join(' and ')}
        order by ${orderBy}
        limit $${listValues.length - 1} offset $${listValues.length}`,
      listValues,
    ) as Row[];

    const total = Number(count[0]?.total || 0);
    return c.json({ ok: true, data: rows.map((r) => r.product), pagination: {
      page, limit, total, pages: Math.ceil(total / limit), hasNext: offset + rows.length < total,
    } });
  } catch (e) {
    console.error(e);
    return error(c, 500, 'database error');
  }
});

app.get('/api/v1/products/:slug', async (c) => {
  try {
    const db = getDb(c.env);
    const store = await requireStore(c, db);
    if (store instanceof Response) return store;
    const rows = await db(
      `select ${productJsonSql()} as product
         from app.products p
         left join app.categories cat on cat.id = p.category_id and cat.company_id = p.company_id
        where p.company_id = $1 and p.slug = $2 and p.status = 'active'
        limit 1`,
      [store.id, c.req.param('slug')],
    ) as Row[];
    return rows[0] ? c.json({ ok: true, data: rows[0].product }) : error(c, 404, 'product not found');
  } catch (e) {
    console.error(e);
    return error(c, 500, 'database error');
  }
});



// -------- Customer authentication (opaque bearer sessions) --------
const SESSION_DAYS = 30;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const iterations = 120000;
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256);
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, expected] = stored.split('$');
  if (algorithm !== 'pbkdf2' || !iterationsText || !saltText || !expected) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new Uint8Array(base64ToBytes(saltText)), iterations: Number(iterationsText), hash: 'SHA-256' }, key, 256);
  return bytesToBase64(new Uint8Array(bits)) === expected;
}

function authToken(c: any): string | null {
  const header = c.req.header('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

async function sessionUser(c: any, db: Db, storeId: string): Promise<Row | null> {
  const token = authToken(c);
  if (!token) return null;
  const tokenHash = await sha256(token);
  const rows = await db(
    `select u.id as user_id, u.email, u.full_name, u.avatar_url, c.id as customer_id, s.company_id
       from app.auth_sessions s
       join app.users u on u.id = s.user_id
       join app.customers c on c.user_id = u.id and c.company_id = s.company_id
      where s.token_hash = $1 and s.company_id = $2 and s.expires_at > now()
      limit 1`,
    [tokenHash, storeId],
  );
  if (!rows[0]) return null;
  await db(`update app.auth_sessions set last_seen_at = now() where token_hash = $1`, [tokenHash]);
  return rows[0];
}

function publicCustomer(row: Row) {
  return { id: row.customer_id || row.id, userId: row.user_id, email: row.email, fullName: row.full_name, avatarUrl: row.avatar_url };
}

app.post('/api/v1/auth/register', async (c) => {
  try {
    const db = getDb(c.env);
    const body = await c.req.json<{ store?: string; email?: string; password?: string; fullName?: string; phone?: string }>();
    const store = await findActiveStore(db, (body.store || c.req.header('X-Store-Slug') || '').trim());
    if (!store) return error(c, 404, 'store not found');
    const email = (body.email || '').trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return error(c, 400, 'valid email is required');
    if (!body.password || body.password.length < 8) return error(c, 400, 'password must be at least 8 characters');
    const existing = await db(`select id from app.users where email = $1 limit 1`, [email]);
    if (existing[0]) return error(c, 400, 'email is already registered');
    const passwordHash = await hashPassword(body.password);
    const userRows = await db(
      `insert into app.users(email, full_name, password_hash) values ($1, $2, $3) returning id, email, full_name, avatar_url`,
      [email, body.fullName?.trim() || null, passwordHash],
    );
    const user = userRows[0];
    const customerRows = await db(
      `insert into app.customers(user_id, company_id, email, phone, full_name)
       values ($1, $2, $3, $4, $5)
       returning id as customer_id`,
      [user.id, store.id, email, body.phone?.trim() || null, body.fullName?.trim() || null],
    );
    const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
    await db(
      `insert into app.auth_sessions(user_id, company_id, token_hash, expires_at)
       values ($1, $2, $3, now() + ($4 || ' days')::interval)`,
      [user.id, store.id, await sha256(token), SESSION_DAYS],
    );
    return c.json({ ok: true, data: { token, expiresInDays: SESSION_DAYS, customer: publicCustomer({ ...user, ...customerRows[0] }) } }, 201);
  } catch (e) {
    console.error(e);
    return error(c, 500, 'registration failed');
  }
});

app.post('/api/v1/auth/login', async (c) => {
  try {
    const db = getDb(c.env);
    const body = await c.req.json<{ store?: string; email?: string; password?: string }>();
    const store = await findActiveStore(db, (body.store || c.req.header('X-Store-Slug') || '').trim());
    if (!store) return error(c, 404, 'store not found');
    const rows = await db(
      `select u.id as user_id, u.email, u.full_name, u.avatar_url, u.password_hash, c.id as customer_id
         from app.users u join app.customers c on c.user_id = u.id and c.company_id = $2
        where u.email = $1 limit 1`,
      [(body.email || '').trim().toLowerCase(), store.id],
    );
    if (!rows[0] || !rows[0].password_hash || !(await verifyPassword(body.password || '', String(rows[0].password_hash)))) return error(c, 401, 'invalid credentials');
    const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
    await db(`insert into app.auth_sessions(user_id, company_id, token_hash, expires_at) values ($1, $2, $3, now() + ($4 || ' days')::interval)`, [rows[0].user_id, store.id, await sha256(token), SESSION_DAYS]);
    return c.json({ ok: true, data: { token, expiresInDays: SESSION_DAYS, customer: publicCustomer(rows[0]) } });
  } catch (e) {
    console.error(e);
    return error(c, 500, 'login failed');
  }
});

app.get('/api/v1/auth/me', async (c) => {
  try {
    const db = getDb(c.env); const store = await requireStore(c, db);
    if (store instanceof Response) return store;
    const user = await sessionUser(c, db, String(store.id));
    return user ? c.json({ ok: true, data: publicCustomer(user) }) : error(c, 401, 'authentication required');
  } catch (e) { console.error(e); return error(c, 500, 'authentication failed'); }
});

app.post('/api/v1/auth/logout', async (c) => {
  try {
    const token = authToken(c); if (token) await getDb(c.env)(`delete from app.auth_sessions where token_hash = $1`, [await sha256(token)]);
    return c.json({ ok: true, data: { loggedOut: true } });
  } catch (e) { console.error(e); return error(c, 500, 'logout failed'); }
});

// -------- Cart: authenticated customers or anonymous X-Cart-Key --------
function cartKey(c: any): string | null { return (c.req.header('X-Cart-Key') || '').trim() || null; }

async function getCart(c: any, db: Db, store: Row, create = true): Promise<Row | null> {
  const user = await sessionUser(c, db, String(store.id));
  const key = user ? null : cartKey(c);
  if (!user && !key && !create) return null;
  if (!user && !key && create) return null;
  const found = user
    ? await db(`select * from app.carts where company_id = $1 and customer_id = $2 and status = 'active' limit 1`, [store.id, user.customer_id])
    : await db(`select * from app.carts where company_id = $1 and anonymous_key = $2 and status = 'active' limit 1`, [store.id, key]);
  if (found[0] || !create) return found[0] || null;
  const created = await db(`insert into app.carts(company_id, customer_id, anonymous_key, currency) values ($1, $2, $3, $4) returning *`, [store.id, user?.customer_id || null, key, store.currency]);
  return created[0] || null;
}

async function cartResponse(db: Db, cart: Row) {
  const items = await db(
    `select ci.id, ci.product_id, ci.variant_id, ci.quantity, ci.unit_price, ci.product_snapshot,
            p.name, p.slug, p.currency,
            coalesce((select pi.url from app.product_images pi where pi.product_id = p.id and pi.is_primary order by pi.sort_order limit 1),
                     (select pi.url from app.product_images pi where pi.product_id = p.id order by pi.sort_order limit 1)) as image_url
       from app.cart_items ci join app.products p on p.id = ci.product_id
      where ci.cart_id = $1 order by ci.created_at`, [cart.id]);
  const subtotal = items.reduce((sum, item) => sum + Number(item.unit_price) * Number(item.quantity), 0);
  return { id: cart.id, currency: cart.currency, status: cart.status, items: items.map((item) => ({
    id: item.id, productId: item.product_id, variantId: item.variant_id, quantity: item.quantity,
    unitPrice: item.unit_price, totalPrice: Number(item.unit_price) * Number(item.quantity),
    product: { id: item.product_id, name: item.name, slug: item.slug, imageUrl: item.image_url },
  })), subtotal: subtotal.toFixed(2), itemCount: items.reduce((sum, item) => sum + Number(item.quantity), 0) };
}

app.get('/api/v1/cart', async (c) => {
  try { const db = getDb(c.env); const store = await requireStore(c, db); if (store instanceof Response) return store; const cart = await getCart(c, db, store, true); if (!cart) return error(c, 400, 'X-Cart-Key is required for anonymous carts'); return c.json({ ok: true, data: await cartResponse(db, cart), cartKey: cart.anonymous_key || undefined }); }
  catch (e) { console.error(e); return error(c, 500, 'cart failed'); }
});

app.post('/api/v1/cart/items', async (c) => {
  try {
    const db = getDb(c.env); const store = await requireStore(c, db); if (store instanceof Response) return store;
    const body = await c.req.json<{ productId?: string; variantId?: string | null; quantity?: number }>();
    const quantity = Number(body.quantity); if (!body.productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) return error(c, 400, 'productId and valid quantity are required');
    const productRows = await db(`select p.id, p.name, p.sku, p.price, p.currency from app.products p where p.id = $1 and p.company_id = $2 and p.status = 'active' limit 1`, [body.productId, store.id]);
    if (!productRows[0]) return error(c, 404, 'product not found');
    let unitPrice = Number(productRows[0].price); let snapshot: any = { name: productRows[0].name, sku: productRows[0].sku, currency: productRows[0].currency };
    if (body.variantId) {
      const variants = await db(`select id, name, sku, price, options from app.product_variants where id = $1 and product_id = $2 and is_active limit 1`, [body.variantId, body.productId]);
      if (!variants[0]) return error(c, 404, 'variant not found');
      unitPrice = Number(variants[0].price ?? unitPrice); snapshot = { ...snapshot, variant: variants[0] };
    }
    const cart = await getCart(c, db, store, true); if (!cart) return error(c, 400, 'X-Cart-Key is required for anonymous carts');
    const existing = await db(`select id, quantity from app.cart_items where cart_id = $1 and product_id = $2 and variant_id is not distinct from $3 limit 1`, [cart.id, body.productId, body.variantId || null]);
    if (existing[0]) await db(`update app.cart_items set quantity = $1, unit_price = $2, product_snapshot = $3 where id = $4`, [Number(existing[0].quantity) + quantity, unitPrice, JSON.stringify(snapshot), existing[0].id]);
    else await db(`insert into app.cart_items(cart_id, product_id, variant_id, quantity, unit_price, product_snapshot) values ($1, $2, $3, $4, $5, $6)`, [cart.id, body.productId, body.variantId || null, quantity, unitPrice, JSON.stringify(snapshot)]);
    return c.json({ ok: true, data: await cartResponse(db, cart), cartKey: cart.anonymous_key || undefined });
  } catch (e) { console.error(e); return error(c, 500, 'cart update failed'); }
});

app.patch('/api/v1/cart/items/:id', async (c) => {
  try { const db = getDb(c.env); const store = await requireStore(c, db); if (store instanceof Response) return store; const cart = await getCart(c, db, store, false); if (!cart) return error(c, 404, 'cart not found'); const body = await c.req.json<{ quantity?: number }>(); const quantity = Number(body.quantity); if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) return error(c, 400, 'valid quantity is required'); await db(`update app.cart_items set quantity = $1, updated_at = now() where id = $2 and cart_id = $3`, [quantity, c.req.param('id'), cart.id]); return c.json({ ok: true, data: await cartResponse(db, cart) }); }
  catch (e) { console.error(e); return error(c, 500, 'cart update failed'); }
});

app.delete('/api/v1/cart/items/:id', async (c) => {
  try { const db = getDb(c.env); const store = await requireStore(c, db); if (store instanceof Response) return store; const cart = await getCart(c, db, store, false); if (!cart) return error(c, 404, 'cart not found'); await db(`delete from app.cart_items where id = $1 and cart_id = $2`, [c.req.param('id'), cart.id]); return c.json({ ok: true, data: await cartResponse(db, cart) }); }
  catch (e) { console.error(e); return error(c, 500, 'cart update failed'); }
});

app.delete('/api/v1/cart', async (c) => {
  try { const db = getDb(c.env); const store = await requireStore(c, db); if (store instanceof Response) return store; const cart = await getCart(c, db, store, false); if (cart) await db(`delete from app.cart_items where cart_id = $1`, [cart.id]); return c.json({ ok: true, data: { cleared: true } }); }
  catch (e) { console.error(e); return error(c, 500, 'cart clear failed'); }
});

app.notFound((c) => error(c, 404, 'route not found'));

app.onError((err, c) => {
  console.error(err);
  return error(c, 500, 'internal server error');
});

export default app;
