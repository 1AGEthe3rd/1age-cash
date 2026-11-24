/**
 * 1AGE Cash sandbox backend.
 * - NO live Stripe keys or charges. Explicitly requires sk_test_ key.
 * - NO wallet / crypto / peer transfers, no real funds or cash-out.
 * - Same-origin API expected behind a dedicated HTTPS reverse proxy.
 * - Production deployment forbidden pending payment-provider and legal review.
 */
import express from 'express';
import pg from 'pg';
import Stripe from 'stripe';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import {
  TEST_MAX_OUTSTANDING_MINOR, availableMinor,
  validateTopupAmount, validateRequestKey, refundDifference, isSafeOwner
} from './policy.mjs';
import { parseCatalog } from './catalog.mjs';
import { redeemCash, RedemptionError } from './redemption.mjs';
import { attachCashSite } from './static-site.mjs';

const required = ['DATABASE_URL', 'AUTH_ISSUER', 'AUTH_AUDIENCE', 'AUTH_JWKS_URL'];
for (const key of required) if (!process.env[key]) throw Error('Missing required environment configuration: ' + key);
if (!process.env.AUTH_ISSUER.startsWith('https://') ||
    !process.env.AUTH_JWKS_URL.startsWith('https://')) throw Error('Identity issuer and JWKS must use HTTPS.');

const checkoutEnabled = process.env.CASH_ENABLE_TEST_CHECKOUT === 'true';
const redemptionEnabled = process.env.CASH_ENABLE_REDEMPTION === 'true';
const redemptionCatalog = parseCatalog(process.env.CASH_CATALOG_JSON || '[]');
const key = process.env.STRIPE_SECRET_KEY;
if (key && !key.startsWith('sk_test_')) throw Error('Refusing to use a non-test Stripe secret key.');
if (checkoutEnabled && (!key || !process.env.STRIPE_WEBHOOK_SECRET ||
    !process.env.CASH_PUBLIC_URL?.startsWith('https://'))) {
  throw Error('Sandbox Checkout requires test Stripe key, webhook secret and HTTPS public URL.');
}
const stripe = key ? new Stripe(key) : null;
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined
});
const jwks = createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL));
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
});
const json = express.json({ limit: '16kb' });
function errorResponse(res, status, message) { res.status(status).json({ error: message }); }

async function identity(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
  if (!token) return errorResponse(res, 401, 'Secure 1AGE sign-in required.');
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: process.env.AUTH_ISSUER,
      audience: process.env.AUTH_AUDIENCE,
      algorithms: ['RS256', 'ES256'],
      clockTolerance: 5
    });
    if (!isSafeOwner(payload.sub)) throw Error('Invalid token subject');
    req.ownerId = process.env.AUTH_ISSUER + '#' + payload.sub;
    next();
  } catch {
    errorResponse(res, 401, 'Invalid or expired secure identity.');
  }
}
async function account(ownerId, client = pool) {
  await client.query(
    'INSERT INTO cash_accounts(owner_id) VALUES($1) ON CONFLICT (owner_id) DO NOTHING',
    [ownerId]
  );
  const result = await client.query(
    'SELECT owner_id, balance_minor, frozen FROM cash_accounts WHERE owner_id=$1', [ownerId]);
  return result.rows[0];
}

app.get('/healthz', (req, res) => res.json({ status: 'sandbox', accepts_live_payments: false }));

app.get('/api/cash/me', identity, async (req, res) => {
  try {
    const current = await account(req.ownerId);
    const history = await pool.query(
      'SELECT delta_minor, kind, description, created_at FROM cash_ledger WHERE owner_id=$1 ORDER BY id DESC LIMIT 20',
      [req.ownerId]
    );
    res.json({
      balance_minor: availableMinor(Number(current.balance_minor)),
      suspended: current.frozen || Number(current.balance_minor) < 0,
      debt_minor: Math.max(0, -Number(current.balance_minor)),
      checkout_test_enabled: checkoutEnabled,
      redemption_enabled: redemptionEnabled && redemptionCatalog.length > 0,
      transactions: history.rows.map(row => ({
        delta_minor: Number(row.delta_minor), kind: row.kind,
        reason: row.description, created_at: row.created_at
      }))
    });
  } catch (error) {
    console.error('cash account fetch error', error.message);
    errorResponse(res, 503, 'Cash account is temporarily unavailable.');
  }
});

// This list is server-owned. Products are not redeemable until an approved
// first-party catalog has been configured on the deployed API.
app.get('/api/cash/catalog', (req, res) => {
  res.json({ items: redemptionEnabled ? redemptionCatalog : [], redemption_enabled: redemptionEnabled && redemptionCatalog.length > 0 });
});

// Return evidence of existing internal entitlements only; no external game
// claims or purchase fulfilment should rely on client-visible flags alone.
app.get('/api/cash/entitlements', identity, async (req, res) => {
  try {
    const rows = await pool.query(
      'SELECT sku,app,granted_at FROM cash_entitlements WHERE owner_id=$1 ORDER BY granted_at DESC LIMIT 100',
      [req.ownerId]
    );
    res.json({ items: rows.rows });
  } catch (error) {
    console.error('Cash entitlement query failed', error.message);
    errorResponse(res, 503, 'Entitlements temporarily unavailable.');
  }
});

app.post('/api/cash/redeem', json, identity, async (req, res) => {
  if (!redemptionEnabled || !redemptionCatalog.length) {
    return errorResponse(res, 503, 'Cash redemptions are not enabled.');
  }
  try {
    const item = await redeemCash(pool, {
      ownerId: req.ownerId,
      sku: req.body?.sku,
      requestKey: req.body?.request_key,
      catalog: redemptionCatalog
    });
    return res.status(item.replayed ? 200 : 201).json(item);
  } catch (error) {
    if (error instanceof RedemptionError) return errorResponse(res, error.status, error.message);
    console.error('Cash redemption failed', error.message);
    return errorResponse(res, 503, 'Unable to complete Cash redemption.');
  }
});

app.post('/api/cash/checkout', json, identity, async (req, res) => {
  if (!checkoutEnabled || !stripe) return errorResponse(res, 503, 'Sandbox checkout is not enabled.');
  let amountCents, requestKey;
  try {
    amountCents = validateTopupAmount(req.body?.amount_cents);
    requestKey = validateRequestKey(req.body?.request_key);
  } catch {
    return errorResponse(res, 400, 'Invalid test checkout request.');
  }
  let client;
  const orderId = randomUUID();
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await account(req.ownerId, client);
    const locked = await client.query('SELECT balance_minor, frozen FROM cash_accounts WHERE owner_id=$1 FOR UPDATE', [req.ownerId]);
    const current = locked.rows[0];
    if (current.frozen || Number(current.balance_minor) < 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 403, 'Account is restricted.');
    }
    const reserved = await client.query(
      "SELECT COALESCE(SUM(amount_cents),0) AS reserved FROM cash_orders WHERE owner_id=$1 AND state='pending' AND created_at>now()-interval '1 day'",
      [req.ownerId]
    );
    if (Number(current.balance_minor) + Number(reserved.rows[0].reserved) + amountCents > TEST_MAX_OUTSTANDING_MINOR) {
      await client.query('ROLLBACK');
      return errorResponse(res, 400, 'Sandbox Cash balance limit reached.');
    }
    const inserted = await client.query(
      'INSERT INTO cash_orders(id,owner_id,request_key,amount_cents) VALUES($1,$2,$3,$4) ON CONFLICT(owner_id,request_key) DO NOTHING RETURNING id',
      [orderId, req.ownerId, requestKey, amountCents]
    );
    if (!inserted.rowCount) {
      await client.query('ROLLBACK');
      return errorResponse(res, 409, 'Checkout request already exists. Refresh instead of retrying payment.');
    }
    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('cash checkout reservation error', error.message);
    return errorResponse(res, 503, 'Unable to create test checkout.');
  } finally { client?.release(); }
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      client_reference_id: orderId,
      line_items: [{
        price_data: {
          currency: 'usd', unit_amount: amountCents,
          product_data: { name: '1AGE Cash sandbox credits', description: 'Nonredeemable internal test credits; no real value.' }
        },
        quantity: 1
      }],
      metadata: { order_id: orderId, product: 'oneage_cash_test' },
      success_url: process.env.CASH_PUBLIC_URL + '?checkout=return',
      cancel_url: process.env.CASH_PUBLIC_URL + '?checkout=cancelled'
    }, { idempotencyKey: 'cash_sandbox_' + orderId });
    await pool.query('UPDATE cash_orders SET stripe_session_id=$1 WHERE id=$2', [session.id, orderId]);
    res.json({ url: session.url, order_id: orderId, test_mode: true });
  } catch (error) {
    console.error('stripe sandbox checkout error', error.message);
    errorResponse(res, 503, 'Stripe test checkout is temporarily unavailable.');
  }
});

app.post('/api/cash/webhook', express.raw({ type: 'application/json', limit: '64kb' }), async (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return errorResponse(res, 503, 'Webhook is disabled.');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return errorResponse(res, 400, 'Webhook signature verification failed.');
  }
  // Sandbox test events only, never mix live and test ledgers.
  if (event.livemode !== false) return errorResponse(res, 400, 'Live payment events are not accepted.');
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const eventInsert = await client.query(
      'INSERT INTO cash_stripe_events(event_id,type) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING event_id',
      [event.id, event.type]
    );
    if (!eventInsert.rowCount) {
      await client.query('COMMIT');
      return res.json({ received: true, duplicate: true });
    }
    if (['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)) {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      const result = await client.query('SELECT * FROM cash_orders WHERE id::text=$1 FOR UPDATE', [orderId]);
      const order = result.rows[0];
      if (!order || session.id !== order.stripe_session_id ||
          session.client_reference_id !== order.id ||
          session.mode !== 'payment' || session.currency !== 'usd' ||
          session.amount_total !== order.amount_cents ||
          session.payment_status !== 'paid' ||
          session.metadata?.product !== 'oneage_cash_test' ||
          typeof session.payment_intent !== 'string') {
        throw Error('Unmatched or unpaid Stripe session; defer webhook for investigation.');
      }
      if (order.granted_minor === 0) {
        const locked = await client.query('SELECT balance_minor,frozen FROM cash_accounts WHERE owner_id=$1 FOR UPDATE', [order.owner_id]);
        if (!locked.rowCount || locked.rows[0].frozen ||
            Number(locked.rows[0].balance_minor) + order.amount_cents > TEST_MAX_OUTSTANDING_MINOR) {
          throw Error('Credit limit exceeded or account frozen; manual review required.');
        }
        await client.query(
          "UPDATE cash_orders SET granted_minor=$1,state='paid',stripe_payment_intent_id=$2 WHERE id=$3",
          [order.amount_cents, session.payment_intent, order.id]
        );
        await client.query('UPDATE cash_accounts SET balance_minor=balance_minor+$1,updated_at=now() WHERE owner_id=$2',
          [order.amount_cents, order.owner_id]);
        await client.query('INSERT INTO cash_ledger(owner_id,delta_minor,kind,source_key,description) VALUES($1,$2,$3,$4,$5)',
          [order.owner_id, order.amount_cents, 'stripe_test_credit', 'checkout:' + order.id, 'Stripe sandbox top-up']);
      }
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object;
      const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
      if (!paymentIntentId) throw Error('Refund without payment intent: manual investigation.');
      const result = await client.query(
        'SELECT * FROM cash_orders WHERE stripe_payment_intent_id=$1 FOR UPDATE', [paymentIntentId]);
      const order = result.rows[0];
      if (!order || !order.granted_minor || charge.currency !== 'usd' || charge.amount !== order.amount_cents) {
        throw Error('Refund event arrived before its matching credit or differs from original amount.');
      }
      const refund = refundDifference(order.amount_cents,order.refunded_minor,charge.amount_refunded);
      if (refund > 0) {
        await client.query(
          "UPDATE cash_orders SET refunded_minor=$1,state=CASE WHEN $1=amount_cents THEN 'refunded' ELSE 'partially_refunded' END WHERE id=$2",
          [charge.amount_refunded,order.id]);
        await client.query(
          'UPDATE cash_accounts SET balance_minor=balance_minor-$1, frozen=(frozen OR balance_minor-$1<0),updated_at=now() WHERE owner_id=$2',
          [refund,order.owner_id]);
        await client.query('INSERT INTO cash_ledger(owner_id,delta_minor,kind,source_key,description) VALUES($1,$2,$3,$4,$5)',
          [order.owner_id,-refund,'stripe_test_refund','refund:'+order.id+':'+charge.amount_refunded,'Stripe sandbox refund reversal']);
      }
    } else if (event.type === 'charge.dispute.created') {
      const paymentIntentId = event.data.object.payment_intent;
      if (typeof paymentIntentId === 'string') {
        await client.query(
          'UPDATE cash_accounts SET frozen=TRUE,updated_at=now() WHERE owner_id IN (SELECT owner_id FROM cash_orders WHERE stripe_payment_intent_id=$1)',
          [paymentIntentId]);
      }
      // Disputes are frozen for manual investigation. Do not auto-unfreeze.
    }
    await client.query('COMMIT');
    res.json({ received: true });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error('cash webhook deferred for investigation', event.id, event.type, error.message);
    errorResponse(res, 503, 'Webhook deferred for secure review.');
  } finally { client?.release(); }
});

// The same-origin Cash page can be served from a future HTTPS API host.
// No DNS change occurs by adding these routes.
attachCashSite(app);

const port = Number(process.env.PORT || 4242);
app.listen(port, () => console.log('1AGE Cash sandbox API listening on port ' + port));
