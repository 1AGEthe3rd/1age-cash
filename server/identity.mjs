// Shared 1AGE identity boundary: verify access tokens, never browser handles.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { isSafeOwner } from './policy.mjs';

function httpsEndpoint(value, name) {
  let url;
  try { url = new URL(value); } catch { throw Error(name + ' must be an absolute HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw Error(name + ' must be HTTPS without credentials or fragments');
  return url;
}

export function identityConfig(env) {
  const issuer = env.AUTH_ISSUER;
  const audience = env.AUTH_AUDIENCE;
  const jwksUrl = env.AUTH_JWKS_URL;
  httpsEndpoint(issuer, 'AUTH_ISSUER');
  httpsEndpoint(jwksUrl, 'AUTH_JWKS_URL');
  if (new URL(issuer).search) throw Error('AUTH_ISSUER cannot contain a query');
  if (typeof audience !== 'string' || !audience.trim() || audience !== audience.trim())
    throw Error('AUTH_AUDIENCE must be the dedicated Cash API audience');
  return { issuer, audience, jwksUrl };
}

export function createIdentityVerifier(config, key = createRemoteJWKSet(new URL(config.jwksUrl))) {
  return async token => {
    const { payload } = await jwtVerify(token, key, {
      issuer: config.issuer, audience: config.audience,
      algorithms: ['RS256', 'ES256'],
      requiredClaims: ['sub', 'iat', 'exp'],
      maxTokenAge: '15m', clockTolerance: 5
    });
    if (!isSafeOwner(payload.sub) || /[\u0000-\u001f\u007f]/u.test(payload.sub))
      throw Error('Invalid token subject');
    if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) ||
        payload.exp <= payload.iat || payload.exp - payload.iat > 900)
      throw Error('Invalid access token lifetime');
    // Preserve the existing account key format. Never use an email or handle.
    return config.issuer + '#' + payload.sub;
  };
}
