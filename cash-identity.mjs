// Official Keycloak adapter; credentials stay in SDK memory, not the World iframe.
export function createCashIdentity({ sdk, origin, notify = () => {} }) {
  const redirectUri = new URL('/', origin).href;
  let ready = false, signedOut = false, refreshing = null;
  const signedIn = () => ready && !signedOut && sdk.authenticated === true && typeof sdk.token === 'string';
  const invalidate = () => { signedOut = true; sdk.clearToken(); notify(); };
  sdk.onAuthLogout = () => { signedOut = true; notify(); };
  sdk.onAuthRefreshError = invalidate;
  async function getAccessToken() {
    if (!signedIn()) return null;
    try {
      if (!refreshing) refreshing = Promise.resolve().then(()=>sdk.updateToken(30)).finally(()=>{refreshing=null;});
      await refreshing;
      return signedIn() ? sdk.token : null;
    } catch { invalidate(); return null; }
  }
  sdk.onTokenExpired = () => { void getAccessToken(); };
  return {
    signedIn,
    async init() {
      await sdk.init({flow:'standard',pkceMethod:'S256',checkLoginIframe:false,redirectUri,responseMode:'fragment'});
      ready = true; notify();
    },
    async login() {
      if (!ready) throw Error('Identity is not ready');
      await sdk.login({redirectUri});
    },
    async logout() {
      signedOut = true; notify();
      try { await sdk.logout({redirectUri}); }
      finally { sdk.clearToken(); }
    },
    getAccessToken
  };
}

export async function initializeIdentity() {
  if (location.protocol !== 'https:') return null;
  const response = await fetch('/api/cash/identity-config',{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000)});
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
  const config = await response.json();
  if (config.enabled !== true || config.clientId !== '1age-cash') return null;
  const issuer = new URL(config.issuer);
  if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash || issuer.pathname !== '/realms/1age') throw Error('Unexpected identity issuer');
  const {default:Keycloak} = await import('/identity-sdk.mjs');
  const sdk = new Keycloak({url:issuer.origin,realm:'1age',clientId:config.clientId});
  const adapter = createCashIdentity({sdk,origin:location.origin,notify:()=>window.dispatchEvent(new Event('oneage:identity-ready'))});
  await adapter.init();
  window.OneAgeIdentity = adapter;
  window.dispatchEvent(new Event('oneage:identity-ready'));
  return adapter;
}
