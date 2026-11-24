import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEST_TOPUP_AMOUNTS, TEST_MAX_OUTSTANDING_MINOR,
  validateTopupAmount, validateRequestKey, availableMinor,
  refundDifference, canSpend, isSafeOwner
} from '../policy.mjs';

test('test-only topups are fixed server-side amounts', () => {
  assert.deepEqual(TEST_TOPUP_AMOUNTS, [500, 1000, 2000]);
  for(const value of TEST_TOPUP_AMOUNTS)assert.equal(validateTopupAmount(value),value);
  for(const bad of [0, 1, 10, 100, 501, 2500, 1000000, 1.5, '500', null, -500])
    assert.throws(()=>validateTopupAmount(bad),RangeError);
  assert.equal(TEST_MAX_OUTSTANDING_MINOR,25000);
});
test('request keys and identity subjects are validated', () => {
  assert.equal(validateRequestKey('f1d134f8-1100-4000-8000-e9ab001f0934'),'f1d134f8-1100-4000-8000-e9ab001f0934');
  assert.throws(()=>validateRequestKey('short'),TypeError);
  assert.throws(()=>validateRequestKey(''),TypeError);
  assert.equal(isSafeOwner('auth0|user-1'),true);
  assert.equal(isSafeOwner(''),false);
});
test('refund events only reverse the unrefunded amount', () => {
  assert.equal(refundDifference(2000,0,2000),2000);
  assert.equal(refundDifference(2000,0,400),400);
  assert.equal(refundDifference(2000,400,900),500);
  assert.equal(refundDifference(2000,900,900),0);
  assert.equal(refundDifference(2000,900,500),0);
  assert.throws(()=>refundDifference(2000,500,2200),RangeError);
  assert.throws(()=>refundDifference(100,0,-1),RangeError);
});
test('negative refund balance is never available to spend', () => {
  assert.equal(availableMinor(200),200);
  assert.equal(availableMinor(-500),0);
  assert.equal(canSpend(200,100,false),true);
  assert.equal(canSpend(200,200,false),true);
  assert.equal(canSpend(200,201,false),false);
  assert.equal(canSpend(-1,1,false),false);
  assert.equal(canSpend(200,100,true),false);
  assert.equal(canSpend(0,0,false),false);
});
