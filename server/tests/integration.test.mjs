// GitHub Actions integration test. Uses a local throwaway Postgres database,
// a fake sk_test_ key, and Stripe's signed *test-event generator*.
// No Stripe API operations, account mutations, charges, or live webhooks occur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import Stripe from 'stripe';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('Postgres-backed integration requires TEST_DATABASE_URL', {skip:true},()=>{});
} else {
  const stripe = new Stripe('sk_test_example_only_no_network');
  const webhookSecret='whsec_local_integration_only';
  const endpoint='http://127.0.0.1:4329/api/cash/webhook';
  const pool = new pg.Pool({ connectionString: url });
  let child;
  async function waitUntilReady() {
    for(let i=0;i<50;i++) {
      try {
        const r=await fetch('http://127.0.0.1:4329/healthz');
        if(r.ok)return;
      } catch {}
      await new Promise(r=>setTimeout(r,150));
    }
    throw Error('Test backend did not start');
  }
  function sendSigned(data, options={}) {
    const payload=JSON.stringify(data);
    const signature=stripe.webhooks.generateTestHeaderString({payload,secret:webhookSecret});
    return fetch(endpoint,{method:'POST',
      headers:{'stripe-signature':options.invalidSignature?'broken':signature,'content-type':'application/json'},
      body:payload});
  }
  test('signed paid -> duplicate ignored -> partial/full refunds -> no fake auth', async()=>{
    try {
      await pool.query(await readFile(join(root,'schema.sql'),'utf8'));
      const owner='https://identity.example/#test-user';
      const id=randomUUID();
      await pool.query('INSERT INTO cash_accounts(owner_id) VALUES($1) ON CONFLICT DO NOTHING',[owner]);
      await pool.query(
        'INSERT INTO cash_orders(id,owner_id,request_key,amount_cents,stripe_session_id) VALUES($1,$2,$3,$4,$5)',
        [id,owner,randomUUID(),1000,'cs_test_example_1']);
      child=spawn(process.execPath,['index.mjs'],{
        cwd:root,stdio:['ignore','pipe','pipe'],
        env:{...process.env,
          PORT:'4329',
          DATABASE_URL:url,
          AUTH_ISSUER:'https://identity.example/',
          AUTH_AUDIENCE:'cash-api',
          AUTH_JWKS_URL:'https://identity.example/jwks.json',
          STRIPE_SECRET_KEY:'sk_test_example_only_no_network',
          STRIPE_WEBHOOK_SECRET:webhookSecret,
          CASH_ENABLE_TEST_CHECKOUT:'false'
        }
      });
      let logs='';
      child.stderr.on('data',d=>logs+=d.toString());
      child.stdout.on('data',d=>logs+=d.toString());
      await waitUntilReady();
      // Future same-origin hosting must serve the original cosmic Cash entry
      // without exposing private server source files or database migrations.
      const site = await fetch('http://127.0.0.1:4329/');
      assert.equal(site.status, 200);
      const markup = await site.text();
      assert.ok(markup.includes('https://1age.world/?platform=cash'));
      assert.ok(markup.includes('cash-portal.mjs'));
      assert.equal((await fetch('http://127.0.0.1:4329/server/index.mjs')).status,404);
      assert.equal((await fetch('http://127.0.0.1:4329/server/schema.sql')).status,404);
      assert.equal((await fetch('http://127.0.0.1:4329/docs/CASH-3D-STRIPE-SANDBOX-001.md')).status,404);
      const noAuth=await fetch('http://127.0.0.1:4329/api/cash/me');
      assert.equal(noAuth.status,401);
      const paidEvent={
        id:'evt_cash_paid_test_1',type:'checkout.session.completed',livemode:false,
        data:{object:{
          id:'cs_test_example_1',client_reference_id:id,mode:'payment',currency:'usd',
          amount_total:1000,payment_status:'paid',payment_intent:'pi_test_example_1',
          metadata:{order_id:id,product:'oneage_cash_test'}
        }}
      };
      assert.equal((await sendSigned(paidEvent)).status,200,logs);
      const balance=async()=>Number((await pool.query('SELECT balance_minor FROM cash_accounts WHERE owner_id=$1',[owner])).rows[0].balance_minor);
      assert.equal(await balance(),1000);
      assert.equal((await sendSigned(paidEvent)).status,200);
      assert.equal(await balance(),1000);
      assert.equal((await sendSigned({...paidEvent,id:'evt_cash_paid_test_2'})).status,200);
      assert.equal(await balance(),1000);

      const partial={id:'evt_cash_refund_test_1',type:'charge.refunded',livemode:false,
        data:{object:{payment_intent:'pi_test_example_1',currency:'usd',amount:1000,amount_refunded:400}}};
      assert.equal((await sendSigned(partial)).status,200);
      assert.equal(await balance(),600);
      assert.equal((await sendSigned({...partial,id:'evt_cash_refund_test_1b'})).status,200);
      assert.equal(await balance(),600);
      assert.equal((await sendSigned({...partial,id:'evt_cash_refund_test_2',
        data:{object:{...partial.data.object,amount_refunded:1000}}})).status,200);
      assert.equal(await balance(),0);
      const forged={...paidEvent,id:'evt_cash_forged'};
      assert.equal((await sendSigned(forged,{invalidSignature:true})).status,400);
      assert.equal(await balance(),0);
      const entries=await pool.query('SELECT kind,delta_minor FROM cash_ledger WHERE owner_id=$1 ORDER BY id',[owner]);
      assert.deepEqual(entries.rows.map(x=>[x.kind,Number(x.delta_minor)]),
        [['stripe_test_credit',1000],['stripe_test_refund',-400],['stripe_test_refund',-600]]);
    } finally {
      child?.kill();
      await pool.end();
    }
  },{timeout:30000});
}
