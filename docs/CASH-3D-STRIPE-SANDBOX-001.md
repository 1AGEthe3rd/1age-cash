# 1AGE Cash — Build 001: Cash-native 3D + Stripe sandbox

## Role and constraints
1AGE Cash is an **off-chain, wallet-free internal credit balance**, distinct from the $1AGE cryptocurrency and from the 1AGE Exchange virtual financial platform. It is not a bank, P2P money transfer, redeemable token or investment. Its use is limited to approved first-party 1AGE goods and experiences.

## Source changes
The root homepage previously embedded a 1AGE World iframe. This branch builds a native, original Three.js 3D Cash center with a rotating vault and selectable Balance, Add Cash, Activity and Use Cash stations. It preserves the older local test application at /application.html and reuses vendored Three.js plus the original shared L/R gamepad module.

The new user interface intentionally displays **no fictitious account balance, test money posed as real, or completed real purchases**. Account state is read from a server only after a verified 1AGE identity SDK is connected.

## Server reference implementation
- Node 22 / Express API in server/index.mjs, not deployable through GitHub Pages alone.
- PostgreSQL database schema in server/schema.sql for accounts, orders, append-only ledger entries, and Stripe webhook event IDs.
- JWT validation via issuer + audience + JWKS, rejecting unsigned or invalid tokens.
- One-time Stripe-hosted Checkout in **test mode only**, fixed preset values (500, 1000, 2000 minor units).
- Verified signed Stripe webhooks add credits only when the matched session is confirmed paid; never because of a redirect.
- Unique order keys, ledger source keys and webhook IDs prevent duplicate postings; PostgreSQL order/account locks protect concurrent updates.
- Partial/full refunds use cumulative refund amounts to debit only new reversal differences. Insufficient remaining balance freezes the account.
- Disputes freeze accounts for manual review. Do not mistake this for complete chargeback reconciliation.
- Test account upper balance target: 25000 minor units ($250 equivalent), subject to future compliance review.
- No user-to-user transfers, conversion, merchant settlement, cash-out, production signups, or live Stripe payments.

## Dependencies NOT connected yet
1. Production Page identity or other approved OIDC provider issuing signed short-lived access tokens and integrating with the browser through OneAgeIdentity.getAccessToken(). Page's current local-test credentials are not suitable for public use.
2. Secure hosted PostgreSQL, migrations, backups and monitoring.
3. Persistent HTTPS Node API and webhook receiver, ideally served from the same approved origin; static GitHub Pages alone cannot run this backend or proxy API requests.
4. Explicit Stripe agreement for the specific closed-loop prepaid-credits product model. Do not assume Stripe permits it just because a test account is connected.
5. Legal/consumer-protection and tax assessment of stored credits, refund rules, jurisdictions, maximum balance, and whether use across entities makes the arrangement open-loop.
6. Real test-mode webhook and authenticated integration tests, rate limits, fraud/dispute policies, reconciliation and rollback capability.
7. Signed app-specific spending orders, double-entry/entitlement reconciliation, issuer/merchant boundaries and purchasing policies before spend is enabled anywhere.
8. Separate founder approval before changing DNS, merging this branch or enabling actual financial processing.

## Required environment for a future HTTPS backend
- DATABASE_URL: PostgreSQL connection URL
- AUTH_ISSUER: approved HTTPS OIDC issuer
- AUTH_AUDIENCE: Cash API audience
- AUTH_JWKS_URL: issuer HTTPS JWKS
- PORT: optional, default 4242
- CASH_ENABLE_TEST_CHECKOUT: false by default; only true when approved for sandbox testing
- STRIPE_SECRET_KEY: sk_test_... (test-only key; code rejects any live key)
- STRIPE_WEBHOOK_SECRET: whsec_... (never commit)
- CASH_PUBLIC_URL: HTTPS public preview destination
- DB_SSL: true where required

Apply server/schema.sql first. The backend must be reverse-proxied with TLS and correct routing. Do not commit credentials or make a direct public API endpoint with unprotected CORS.

## API contract
- GET /api/cash/me: authenticated user balance, last 20 ledger entries, account freeze flag, sandbox availability
- POST /api/cash/checkout: test-only preset load amounts; unique request key and Stripe-hosted test checkout link
- POST /api/cash/webhook: verified test Stripe webhooks with idempotent credit/refund bookkeeping
- GET /healthz: always reports sandbox status

## Approval gates
- Browser-render the real Cash WebGL scene on desktop and iPhone-size portrait/landscape viewports.
- Verify actual touch/gamepad controls, navigation, and WebGL failure fallback.
- Verify no public fake balances or payments and no real checkout enabled.
- Test identity JWT failures, safe concurrent ledger writes, partial refunds, duplicate/out-of-order webhooks, disputes and spending integration after relevant hosting is connected.
- Conduct secure payment and legal review; ask Stripe about this exact product.
- Share actual screenshots, draft PR and results with founder before merging.
- Obtain a separate explicit authorization for any later real-money launch.

**Status: unmerged, non-monetary foundation. Not yet a fully operational payment or credit service.**

## Original World integration

The Cash draft embeds `https://1age.world/?entry=cash` from the restored 1AGE World export. The published Godot scene reads the `entry` parameter. Earlier app wrappers use `platform`, which the restored export does not read. The iframe delegates gamepad and fullscreen support to World. Account panels are an overlay on the same Cash origin. The draft does not send credentials into World or change the ledger and sandbox server.

### Shared rule for other 1AGE apps

Use the approved World export for the real rotating Earth, starfield, and controls. Each app needs a verified dedicated World platform and must open that platform. A URL parameter alone does not establish that a platform exists or has the right spawn. Retain each app's working functionality and link it at its World platform. Keep the Search and Studio navigation scoped to their established roles. Do not substitute generic scenes or remove existing app functionality.

The source audit found the legacy `platform` parameter in Space, Games, Quest, Exchange, Cash, Store, Shop, Blog, Plus, Design and App. Page has its own orbital identity renderer. Confirm each platform in the approved World export before porting the Cash pattern. Preserve Page's profiles and discovery, and leave Space's HQ1 route and the Studio dial accessible.
