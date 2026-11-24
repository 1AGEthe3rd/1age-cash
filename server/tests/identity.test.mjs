import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { identityConfig, createIdentityVerifier } from '../identity.mjs';

const config = identityConfig({ AUTH_ISSUER:'https://id.example.test/realm/1age',
  AUTH_AUDIENCE:'cash-api', AUTH_JWKS_URL:'https://id.example.test/jwks' });

test('identity configuration rejects missing and non-HTTPS endpoints', () => {
  const valid = {AUTH_ISSUER:config.issuer, AUTH_AUDIENCE:config.audience, AUTH_JWKS_URL:config.jwksUrl};
  for (const invalid of [{AUTH_ISSUER:undefined},{AUTH_ISSUER:'http://id.example.test'},
    {AUTH_ISSUER:'https://id.example.test/#fragment'},{AUTH_JWKS_URL:'https://user:pass@id.example.test/jwks'},
    {AUTH_AUDIENCE:''}]) assert.throws(()=>identityConfig({...valid,...invalid}));
});

test('signed short-lived Cash tokens only; isolate owners and reject bad claims', async () => {
  const {privateKey, publicKey} = await generateKeyPair('RS256');
  const foreign = await generateKeyPair('RS256');
  const verify = createIdentityVerifier(config, publicKey);
  const now = Math.floor(Date.now()/1000);
  const valid = {iss:config.issuer,aud:config.audience,sub:'account-001',iat:now,exp:now+300};
  const sign = (claims,key=privateKey)=>new SignJWT(claims).setProtectedHeader({alg:'RS256'}).sign(key);
  assert.equal(await verify(await sign(valid)), config.issuer+'#account-001');
  assert.notEqual(await verify(await sign({...valid,sub:'account-002'})),config.issuer+'#account-001');
  for (const claims of [
    {...valid,iss:'https://other.example.test'}, {...valid,aud:'page-browser'},
    {...valid,sub:''}, {...valid,sub:'bad\nsubject'}, {...valid,exp:now-30,iat:now-60},
    {...valid,iat:now-1000,exp:now+60}, {...valid,exp:now+1800},
    {iss:valid.iss,aud:valid.aud,sub:valid.sub,iat:now},
    {iss:valid.iss,aud:valid.aud,sub:valid.sub,exp:now+300}
  ]) await assert.rejects(async()=>verify(await sign(claims)));
  await assert.rejects(async()=>verify(await sign(valid,foreign.privateKey)));
  await assert.rejects(()=>verify('not-a-token'));
  const cashBrowser = createIdentityVerifier({...config,browserClient:'1age-cash'},publicKey);
  assert.equal(await cashBrowser(await sign({...valid,azp:'1age-cash',typ:'Bearer'})),config.issuer+'#account-001');
  await assert.rejects(async()=>cashBrowser(await sign({...valid,azp:'1age-page',typ:'Bearer'})));
  await assert.rejects(async()=>cashBrowser(await sign({...valid,azp:'1age-cash',typ:'ID'})));
});
