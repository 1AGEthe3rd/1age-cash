export const TEST_TOPUP_AMOUNTS = Object.freeze([500, 1000, 2000]);
export const TEST_MAX_OUTSTANDING_MINOR = 25000;

// One USD cent = one internal minor unit; 100 minor units = one Cash credit.
// This is a test-mode accounting convention, NOT a legal redemption promise.
export function validateTopupAmount(value) {
  if (!Number.isSafeInteger(value) || !TEST_TOPUP_AMOUNTS.includes(value)) {
    throw new RangeError('Choose an approved test Cash amount.');
  }
  return value;
}
export function validateRequestKey(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{20,50}$/i.test(value)) {
    throw new TypeError('A valid request key is required.');
  }
  return value;
}
export function isSafeOwner(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 255;
}
export function availableMinor(balance) {
  if (!Number.isSafeInteger(balance)) throw new TypeError('Invalid account balance.');
  return Math.max(0, balance);
}
export function refundDifference(amountCents, previousRefunded, currentRefunded) {
  for (const value of [amountCents, previousRefunded, currentRefunded]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('Invalid refund amount.');
  }
  if (currentRefunded > amountCents) throw new RangeError('Refund exceeds original payment.');
  if (currentRefunded <= previousRefunded) return 0; // Stripe duplicates/out-of-order older events
  return currentRefunded - previousRefunded;
}
export function canSpend(balanceMinor, priceMinor, frozen) {
  return !frozen && Number.isSafeInteger(balanceMinor) &&
    Number.isSafeInteger(priceMinor) && priceMinor > 0 && balanceMinor >= priceMinor;
}
