# 1AGE Cash — Official launch readiness (November 23, 2026)

**Status:** Engineering foundation in review. Customer balances and live paid Cash are NOT enabled.

## Product definition submitted for review

1AGE Cash is a wallet-free, nontransferable account credit issued by the verified 1AGE operating legal entity. It is intended only for first-party digital experiences that entity itself provides (initially eligible World, Games and Quest content, as separately verified). $1AGE cryptocurrency and 1AGE Exchange remain entirely separate.

The proposed purchase ratio is $1 per 1 Cash unit. It does NOT guarantee cash redemption, reserves, stablecoin exchange, or the right to sell credits to other users. No peer transfers, bank withdrawals, crypto exchange, cash prizes, gambling, third-party payees, or merchant settlement. Businesses that are independently operated cannot automatically be considered first-party merchants.

## Already developed
- Original approved 1AGE World cosmic experience with Cash holographic UI.
- Test-only Stripe Checkout and signed-webhook credit issuance.
- PostgreSQL account balances, orders, append-only ledger, refund reversals and dispute freeze.
- Authenticated Cash redemption into one-time first-party entitlements with transactional debits, server-defined prices and idempotent request keys.
- Same-origin static Cash site serving from a future HTTPS Node host; server source and migrations are NOT exposed.
- Automated test coverage for payment signatures, duplicate notifications, partial refunds and concurrent redemptions.

## Mandatory launch gates
1. **Stripe acceptance** — Obtain account-specific written eligibility for 1AGE's seller-maintained stored value, virtual credits and in-game purchases. Stripe's restricted business policy covers these categories; a generic Stripe explanation is not permission. Confirm any limits.
2. **Legal review** — Check applicable prepaid access, gift card/credit, consumer refund, taxes, record retention, unclaimed property, fraud, state licensing and merchant boundaries. FinCEN's closed-loop exclusion is not blanket approval.
3. **Identity** — Activate secure real OIDC sign-in, email verification/recovery and short-lived API tokens. The existing 1AGE Page identity is local-test-only.
4. **Hosting** — Deploy the Cash Node server and managed PostgreSQL, database migration, backups, monitoring and encrypted secrets to an authorized host (e.g. Railway after explicit connection). GitHub Pages alone cannot execute this backend.
5. **Payments** — Complete Stripe test Checkout with signed webhook, delayed/unpaid outcomes, refunds, disputes, replay/out-of-order events, payment-to-ledger reconciliation and alerts. Never credit balances from a browser return URL.
6. **Usable Cash purchases** — Configure only approved genuine first-party products, connect each to its actual app, and verify issued entitlements server-to-server. The catalog is EMPTY by default, with redemption disabled.
7. **Customer protections** — Publish Terms, Privacy, Refund/Cancellation policy, support channel, receipts, dispute procedures, risk limits and incident response.
8. **Security** — Verify account authorization, rate limits, database concurrency, token expiry, isolation, encryption, web application protections, secrets, dependency audit and backup restores.
9. **Release** — Founder reviews actual desktop/iPhone renders and account/transaction journeys, approves DNS/hosting cutover explicitly, and approves real Stripe credentials and charges separately.

## Default deployment state
CASH_ENABLE_TEST_CHECKOUT=false
CASH_ENABLE_REDEMPTION=false
CASH_CATALOG_JSON=[]
Stripe secret key must start with sk_test_. The server rejects a live Stripe key and live webhook events. Secrets belong in the host's encrypted environment, never GitHub.

## Proposed architecture
Run the original 1AGE Cash website and the Cash API on the SAME approved HTTPS origin using the allowlisted server static-site handler. Connect it to a managed PostgreSQL service and trusted OIDC provider; continue displaying the REAL 1AGE World, not a fabricated globe or sky. Only migrate the public 1age.cash domain after a tested staging deployment and explicit founder approval.

## Important distinction
A successful ledger debit produces a first-party entitlement record, not evidence that a game has delivered the corresponding item. Until the app verifies and fulfills it, do not describe cross-app spending as live.

**Current status: not yet operational for real customers, not permitted to take live Cash payments.**
