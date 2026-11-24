# 1AGE Identity — Build 001 (2026-11-24)

Status: review branch only. No identity provider, public sign-up, Railway deployment, DNS change, live Stripe, or redemption enabled.

## Shared identity architecture
1AGE Page remains the identity/profile product. A single trusted OpenID Connect provider owns credential handling, verified email, MFA, recovery and stable subjects; Cash, Page, World and other apps are distinct clients of that provider. Use a maintained provider rather than a home-grown password or token service. Existing Page local-test handles and sessions are not real identities and must not be migrated as verified accounts. Page profiles are app data keyed by the verified issuer and subject, not by mutable handle or email.

## Provider provisioning (required before Cash deploy)
Select an approved provider/account and use its actual HTTPS discovery document. For staging create an isolated realm/tenant, disable public registration until review, enable email verification/recovery and administrator MFA, and register an approved staging test user. Use authorization code + PKCE (S256), exact HTTPS redirect/logout allowlists, state and nonce, no implicit/password grant, and no client secret in browser code. Give the Cash API a dedicated audience distinct from the browser client ID. Configure signed RS256 or ES256 access tokens with iat, exp, sub and a lifetime of at most 15 minutes. ID tokens are not API credentials. Use access tokens in memory; no localStorage or cross-origin World iframe token messages.

Set the Cash Railway staging values from verified provider metadata:
- AUTH_ISSUER: exact issuer (including trailing slash if applicable)
- AUTH_JWKS_URL: exact HTTPS jwks_uri
- AUTH_AUDIENCE: dedicated Cash resource audience
Do not use example URLs or fabricate credentials. Never commit provider admin passwords, client secrets, signing keys or user tokens. Confirm token audience and claims with the actual provider before deploying.

## Cash adapter
Cash already expects window.OneAgeIdentity.getAccessToken() and listens for oneage:identity-ready. The next implementation must use the chosen provider's maintained OIDC SDK, implement sign-in, logout and token refresh, and clear account state when signed out. Never forward Cash credentials to the embedded World origin. Page sign-in integration follows the same provider using a separate client. No change to the existing World runtime, holograms or gamepad is authorized in this build.

## Test and release gates
Unit tests cover invalid signature, foreign issuer/audience, missing expiry/issued-at, stale or excessive lifetime and subject isolation. Run npm test and npm run check, including PostgreSQL integration on staging before deployment approval. Verify a genuine user can authenticate, that account balances persist and that another user cannot access them. Verify database TLS, least-privilege roles, backups, and actual schema readiness (healthz alone does not establish database health). Keep checkout and redemption false, catalog empty, no live Stripe credentials. No DNS cutover or production deployment without separate approval.
