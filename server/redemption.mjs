/**
 * Transactionally redeem Cash for a server-verified first-party entitlement.
 * No wallet, marketplace, peer payment or currency conversion.
 *
 * The in-app experience must independently verify the entitlement through an
 * authenticated server-to-server integration; this only records issuance.
 */
import { randomUUID } from 'node:crypto';
import { canSpend, validateRequestKey } from './policy.mjs';
import { findProduct } from './catalog.mjs';

export class RedemptionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function redeemCash(pool, { ownerId, sku, requestKey, catalog }) {
  const product = findProduct(catalog, sku);
  if (!product) throw new RedemptionError(404, 'This Cash item is not available.');
  try { validateRequestKey(requestKey); }
  catch { throw new RedemptionError(400, 'A valid unique request key is required.'); }
  if (typeof ownerId !== 'string' || !ownerId.length) {
    throw new RedemptionError(401, 'Secure identity required.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT balance_minor,frozen FROM cash_accounts WHERE owner_id=$1 FOR UPDATE',
      [ownerId]
    );
    if (!locked.rowCount) throw new RedemptionError(401, 'Cash account not yet activated.');
    const existing = await client.query(
      'SELECT id,sku,price_minor FROM cash_redemptions WHERE owner_id=$1 AND request_key=$2',
      [ownerId, requestKey]
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (row.sku !== product.sku) throw new RedemptionError(409, 'Request key already used for another item.');
      await client.query('COMMIT');
      return { redemption_id: row.id, sku: row.sku, price_minor: Number(row.price_minor), replayed: true };
    }
    const owned = await client.query(
      'SELECT 1 FROM cash_entitlements WHERE owner_id=$1 AND sku=$2', [ownerId, product.sku]
    );
    if (owned.rowCount) throw new RedemptionError(409, 'This first-party entitlement is already owned.');
    const account = locked.rows[0];
    if (!canSpend(Number(account.balance_minor), product.price_minor, account.frozen)) {
      throw new RedemptionError(403, 'Cash account restricted or insufficient credits.');
    }
    const redemptionId = randomUUID();
    await client.query(
      'INSERT INTO cash_redemptions(id,owner_id,request_key,sku,price_minor) VALUES($1,$2,$3,$4,$5)',
      [redemptionId, ownerId, requestKey, product.sku, product.price_minor]
    );
    await client.query(
      'UPDATE cash_accounts SET balance_minor=balance_minor-$1,updated_at=now() WHERE owner_id=$2',
      [product.price_minor, ownerId]
    );
    await client.query(
      'INSERT INTO cash_ledger(owner_id,delta_minor,kind,source_key,description) VALUES($1,$2,$3,$4,$5)',
      [ownerId, -product.price_minor, 'first_party_redemption',
        'redemption:' + redemptionId, 'First-party Cash item: ' + product.sku]
    );
    await client.query(
      'INSERT INTO cash_entitlements(redemption_id,owner_id,sku,app) VALUES($1,$2,$3,$4)',
      [redemptionId, ownerId, product.sku, product.app]
    );
    await client.query('COMMIT');
    return { redemption_id: redemptionId, sku: product.sku, price_minor: product.price_minor, replayed: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
