import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCatalog, findProduct } from '../catalog.mjs';
import { redeemCash, RedemptionError } from '../redemption.mjs';

const source = JSON.stringify([
  { sku: 'test_avatar', name: 'Test World avatar', app: 'world',
    price_minor: 300, first_party: true, non_transferable: true },
  { sku: 'test_stage', name: 'Test World stage', app: 'world',
    price_minor: 700, first_party: true, non_transferable: true }
]);
const catalog = parseCatalog(source);
const newKey = () => randomUUID();

test('launch is empty until a reviewed server catalog is configured', () => {
  assert.deepEqual(parseCatalog(''), []);
  assert.deepEqual(parseCatalog('[]'), []);
  assert.equal(catalog.length, 2);
  assert.equal(findProduct(catalog, 'test_avatar').price_minor, 300);
  assert.equal(findProduct(catalog, 'invalid'), undefined);
  assert.throws(() => parseCatalog('[{"sku":"test_avatar","name":"Fake","price_minor":10,"app":"world"}]'), TypeError);
  assert.throws(() => parseCatalog('[{"sku":"test_avatar","name":"Paid item","price_minor":10,"app":"exchange","first_party":true,"non_transferable":true}]'), TypeError);
  assert.throws(() => parseCatalog('[{"sku":"test_avatar","name":"Paid item","price_minor":10,"app":"world","first_party":true,"non_transferable":false}]'), TypeError);
  assert.throws(() => parseCatalog('{ "sku": "not_array" }'), TypeError);
  assert.throws(() => parseCatalog('not-json'), TypeError);
  assert.throws(() => parseCatalog(JSON.stringify([catalog[0],catalog[0]])), TypeError);
});

const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) {
  test('database redemption tests require TEST_DATABASE_URL', { skip: true }, () => {});
} else {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: dbUrl });
  after(async () => { await pool.end(); });
  const initSchema = async() => {
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    await pool.query(await readFile(join(root, 'schema.sql'), 'utf8'));
  };
  const createAccount = async(amount) => {
    const ownerId = 'https://identity.example/#redeem-' + randomUUID();
    await pool.query('INSERT INTO cash_accounts(owner_id,balance_minor) VALUES($1,$2)', [ownerId, amount]);
    return ownerId;
  };
  const balance = async ownerId => Number((await pool.query(
    'SELECT balance_minor FROM cash_accounts WHERE owner_id=$1', [ownerId])).rows[0].balance_minor);
  test('first-party redemption atomically debits and grants once', async () => {
    await initSchema();
    const ownerId = await createAccount(1000), requestKey = newKey();
    try {
      const purchased = await redeemCash(pool, {ownerId, sku:'test_avatar', requestKey, catalog});
      assert.equal(purchased.replayed, false);
      assert.equal(purchased.price_minor, 300);
      assert.equal(await balance(ownerId),700);
      const replay = await redeemCash(pool, {ownerId, sku:'test_avatar', requestKey, catalog});
      assert.equal(replay.replayed, true);
      assert.equal(replay.redemption_id, purchased.redemption_id);
      assert.equal(await balance(ownerId),700);
      await assert.rejects(redeemCash(pool, {ownerId, sku:'test_avatar',requestKey:newKey(),catalog}),
        error=>error instanceof RedemptionError && error.status===409);
      await assert.rejects(redeemCash(pool, {ownerId, sku:'test_stage',requestKey, catalog}),
        error=>error instanceof RedemptionError && error.status===409);
      const item = await redeemCash(pool, {ownerId, sku:'test_stage',requestKey:newKey(),catalog});
      assert.equal(item.price_minor,700);
      assert.equal(await balance(ownerId),0);
      const entitlements = await pool.query('SELECT sku FROM cash_entitlements WHERE owner_id=$1 ORDER BY sku', [ownerId]);
      assert.deepEqual(entitlements.rows.map(x=>x.sku), ['test_avatar','test_stage']);
      const ledger = await pool.query('SELECT delta_minor FROM cash_ledger WHERE owner_id=$1 ORDER BY id', [ownerId]);
      assert.deepEqual(ledger.rows.map(x=>Number(x.delta_minor)),[-300,-700]);
    } finally { await pool.query('DELETE FROM cash_entitlements WHERE owner_id=$1',[ownerId]); await pool.query('DELETE FROM cash_ledger WHERE owner_id=$1',[ownerId]); await pool.query('DELETE FROM cash_redemptions WHERE owner_id=$1',[ownerId]); await pool.query('DELETE FROM cash_accounts WHERE owner_id=$1',[ownerId]); }
  });
  test('insufficient and frozen accounts cannot spend', async () => {
    await initSchema();
    const ownerId = await createAccount(10);
    try {
      await assert.rejects(redeemCash(pool,{ownerId,sku:'test_avatar',requestKey:newKey(),catalog}),
        error=>error.status===403);
      await pool.query('UPDATE cash_accounts SET balance_minor=999,frozen=TRUE WHERE owner_id=$1',[ownerId]);
      await assert.rejects(redeemCash(pool,{ownerId,sku:'test_avatar',requestKey:newKey(),catalog}),
        error=>error.status===403);
      assert.equal(await balance(ownerId),999);
    } finally {await pool.query('DELETE FROM cash_accounts WHERE owner_id=$1',[ownerId]);}
  });
  test('concurrent requests for one unique item cannot double charge', async () => {
    await initSchema();
    const ownerId = await createAccount(1000);
    try {
      const results = await Promise.allSettled([
        redeemCash(pool,{ownerId,sku:'test_avatar',requestKey:newKey(),catalog}),
        redeemCash(pool,{ownerId,sku:'test_avatar',requestKey:newKey(),catalog})
      ]);
      assert.equal(results.filter(x=>x.status==='fulfilled').length, 1);
      assert.equal(results.filter(x=>x.status==='rejected').length, 1);
      assert.equal(await balance(ownerId),700);
      const ent = await pool.query('SELECT count(*)::int AS total FROM cash_entitlements WHERE owner_id=$1',[ownerId]);
      assert.equal(ent.rows[0].total,1);
    } finally {await pool.query('DELETE FROM cash_entitlements WHERE owner_id=$1',[ownerId]);await pool.query('DELETE FROM cash_ledger WHERE owner_id=$1',[ownerId]); await pool.query('DELETE FROM cash_redemptions WHERE owner_id=$1',[ownerId]);await pool.query('DELETE FROM cash_accounts WHERE owner_id=$1',[ownerId]);}
  });
}
