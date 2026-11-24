import test from 'node:test';
import assert from 'node:assert/strict';
import { createCashIdentity } from '../../cash-identity.mjs';
function mock() {
  return {authenticated:false,token:null,async init(opts){this.opts=opts;},async login(opts){this.loginOpts=opts;},async logout(opts){this.logoutOpts=opts;},async updateToken(){this.refreshes=(this.refreshes||0)+1;},clearToken(){this.token=null;this.authenticated=false;}};
}
test('PKCE login, token memory, concurrent refresh and logout',async()=>{
  const sdk=mock(),adapter=createCashIdentity({sdk,origin:'https://cash.example.test'});
  await adapter.init();assert.equal(sdk.opts.pkceMethod,'S256');assert.equal(sdk.opts.flow,'standard');assert.equal(await adapter.getAccessToken(),null);
  await adapter.login();assert.equal(sdk.loginOpts.redirectUri,'https://cash.example.test/');
  sdk.authenticated=true;sdk.token='example-in-memory';
  assert.deepEqual(await Promise.all([adapter.getAccessToken(),adapter.getAccessToken()]),['example-in-memory','example-in-memory']);
  assert.equal(sdk.refreshes,1);
  await adapter.logout();assert.equal(await adapter.getAccessToken(),null);assert.equal(sdk.token,null);
});
test('refresh failure clears identity and does not return expired credentials',async()=>{
  const sdk=mock(),adapter=createCashIdentity({sdk,origin:'https://cash.example.test'});
  await adapter.init();sdk.authenticated=true;sdk.token='expired';sdk.updateToken=async()=>{throw Error('expired');};
  assert.equal(await adapter.getAccessToken(),null);assert.equal(adapter.signedIn(),false);
});
