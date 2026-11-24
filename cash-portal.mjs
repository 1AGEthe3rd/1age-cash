// Cash-native account actions over the *actual* approved 1AGE World runtime.
// Never invent a replacement sphere, starfield, or generic Godot/WebGL fallback.

const root = document.querySelector('#cash-scene');
const status = document.querySelector('#cash-connection');
const label = document.querySelector('#cash-balance');
const caption = document.querySelector('#cash-balance-caption');
const dialog = document.querySelector('#cash-panel');
const content = document.querySelector('#cash-panel-content');
const title = document.querySelector('#cash-panel-title');
const hint = document.querySelector('#cash-hint');
const actions = [...document.querySelectorAll('#cash-actions button')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const tabs = ['balance', 'add', 'activity', 'use'];
const hologramMenu = document.querySelector('#oneage-hologram-menu');
let panelTrigger = null;
const state = { account: null, connected: false, checkoutEnabled: false, busy: false, selected: 'balance' };
const amount = n => (n / 100).toFixed(2);
const textNode = (tag, value, className = '') => {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = value;
  if (className) node.className = className;
  return node;
};
const note = (message) => textNode('p', message, 'pending-state');
const paragraph = (message) => textNode('p', message, 'panel-text');

async function bearer() {
  // A verified account SDK must provide a short-lived credential in memory.
  // No localStorage tokens, demo passwords or browser-generated account identities.
  const getToken = window.OneAgeIdentity?.getAccessToken;
  return typeof getToken === 'function' ? await getToken() : null;
}

async function api(path, payload) {
  const token = await bearer();
  if (!token) throw Error('Sign-in with a secure 1AGE identity is not connected yet.');
  const response = await fetch('/api/cash/' + path, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: { Authorization: 'Bearer ' + token, ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(12000)
  });
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    throw Error('The secure Cash backend is not connected to this website.');
  }
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'Unable to connect to your Cash account.');
  return result;
}
async function loadAccount() {
  try {
    const info = await api('me');
    if (!Number.isSafeInteger(info.balance_minor) || !Array.isArray(info.transactions)) throw Error('Invalid account response');
    state.connected = true;
    state.account = info;
    status.textContent = info.suspended ? 'Account temporarily limited' : 'Account connected';
    status.classList.toggle('connected', !info.suspended);
    label.textContent = amount(Math.max(0, info.balance_minor));
    caption.textContent = '1AGE Cash credits';
    state.checkoutEnabled = info.checkout_test_enabled === true;
  } catch {
    state.connected = false;
    state.account = null;
    state.checkoutEnabled = false;
    status.classList.remove('connected');
    status.textContent = 'Secure account not connected';
    label.textContent = '—';
    caption.textContent = 'Sign in required for your balance';
  }
}
function activate(name, open = true) {
  if (!tabs.includes(name)) name = 'balance';
  state.selected = name;
  for (const item of actions) item.setAttribute('aria-current', item.dataset.action === name ? 'true' : 'false');
  hint.textContent = ({ balance:'See your available 1AGE Cash', add:'Add credits with a secure checkout', activity:'Review your Cash history', use:'Use Cash in eligible 1AGE apps' })[name];
  if (open) renderPanel(name);
}
function renderPanel(name) {
  title.textContent = ({balance:'Cash Balance',add:'Add Cash',activity:'Activity',use:'Use Cash',about:'About 1AGE Cash',menu:'1AGE'})[name] || '1AGE Cash';
  // Restore focus to the original scene control, even after switching from
  // the 1AGE hologram menu into its settings view while the dialog is open.
  if (!dialog.open) panelTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  content.replaceChildren();
  hologramMenu?.setAttribute('aria-expanded', name === 'menu' ? 'true' : 'false');
  if (name === 'menu') {
    // Only Store and Blog belong in the universal first-party content group.
    // Home and settings are separate utilities, not additional Store/Blog apps.
    const links = textNode('nav', undefined, 'holo-menu-links');
    links.setAttribute('aria-label', '1AGE Store and Blog');
    for (const [name,href] of [['Store','https://1age.store/'],['Blog','https://1age.blog/']]) {
      const anchor = textNode('a', name, 'holo-menu-link');
      anchor.href = href; anchor.rel = 'noopener noreferrer';
      links.append(anchor);
    }
    content.append(links);
    const utilities = textNode('div', undefined, 'holo-menu-utilities');
    const settings = textNode('button', 'Cash settings', 'holo-menu-utility');
    settings.type='button'; settings.addEventListener('click',()=>renderPanel('about'));
    const home = textNode('a','Back to 1AGE.com','holo-menu-utility');
    home.href='https://1age.com/'; home.rel='noopener noreferrer';
    utilities.append(settings,home);
    content.append(utilities);
  } else if (name === 'about') {
    content.append(paragraph('1AGE Cash is an internal account credit for eligible experiences inside 1AGE. A wallet and blockchain address are not required.'));
    content.append(paragraph('It is separate from the $1AGE cryptocurrency and from 1AGE Exchange. Cash is not a deposit, investment, or transferable digital currency.'));
  } else if (name === 'balance') {
    content.append(textNode('div', state.connected ? amount(Math.max(0, state.account.balance_minor)) + ' Cash' : '—', 'panel-value'));
    content.append(state.connected ? paragraph('Your balance is maintained by the secure server. Your transaction history is available in Activity.') : note('The account service and 1AGE Page sign-in have not been linked to this public site. No balance is invented or stored in your browser.'));
    if (state.account?.suspended) content.append(note('Spending and new credits are temporarily restricted pending review.'));
  } else if (name === 'add') {
    content.append(paragraph('Choose a one-time amount. Payment processing and credit issuance must be verified by the server.'));
    const options = [500, 1000, 2000];
    for (const cents of options) {
      const button = textNode('button', 'Test $' + amount(cents) + ' · ' + amount(cents) + ' Cash', 'panel-action');
      button.style.margin = '0 8px 8px 0';
      button.disabled = !state.connected || !state.checkoutEnabled || !!state.account?.suspended;
      button.addEventListener('click', async () => {
        if (state.busy || !state.checkoutEnabled) return;
        state.busy = true;
        button.disabled = true;
        try {
          const result = await api('checkout', { amount_cents: cents, request_key: crypto.randomUUID() });
          const target = new URL(result.url);
          if (target.protocol !== 'https:' || !(target.hostname === 'checkout.stripe.com' || target.hostname.endsWith('.checkout.stripe.com'))) throw Error('Unexpected checkout destination');
          window.location.assign(target.href);
        } catch (error) {
          content.prepend(note(error.message));
          state.busy = false;
          button.disabled = false;
        }
      });
      content.append(button);
    }
    content.append(note(state.checkoutEnabled && state.connected ? 'Stripe sandbox only. No real cards or charges. Test credits cannot be spent as real value.' : 'Payment setup is not enabled on this site. The 3D interface is ready; secure account hosting, Stripe payment review, and webhooks must be completed first.'));
  } else if (name === 'activity') {
    if (!state.account) content.append(note('Sign in to a secure Cash account to see actual transactions. No sample transactions are displayed as real.'));
    else if (!state.account.transactions.length) content.append(paragraph('No transactions yet.'));
    else {
      const list = textNode('ul', undefined, 'panel-list');
      for (const event of state.account.transactions.slice(0, 20)) {
        const line = textNode('li');
        line.append(textNode('span', String(event.reason || event.kind || 'Cash activity')));
        line.append(textNode('strong', (event.delta_minor > 0 ? '+' : '') + amount(event.delta_minor)));
        list.append(line);
      }
      content.append(list);
    }
  } else if (name === 'use') {
    content.append(paragraph('1AGE Cash will support eligible purchases and experiences in connected first-party applications.'));
    const list = textNode('ul', undefined, 'panel-list');
    for (const [name, href] of [['World', 'https://1age.world/'],['Games', 'https://1age.games/'],['Quest', 'https://1age.quest/'],['Store', 'https://1age.store/']]) {
      const li = textNode('li');
      const anchor = textNode('a', 'Explore ' + name);
      anchor.href = href; anchor.rel = 'noopener noreferrer';
      li.append(anchor); list.append(li);
    }
    content.append(list);
    content.append(note('These links do not indicate that Cash spending is enabled in each app. Verified spending endpoints and eligibility rules are a separate integration milestone.'));
  }
  if (!dialog.open) dialog.showModal();
}

hologramMenu?.addEventListener('click', () => renderPanel('menu'));
document.querySelector('#close-panel').addEventListener('click', () => dialog.close());
actions.forEach(button => button.addEventListener('click', () => activate(button.dataset.action)));
dialog.addEventListener('close', () => {
  hologramMenu?.setAttribute('aria-expanded','false');
  panelTrigger?.focus({preventScroll:true});
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && dialog.open) dialog.close();
  else if (!dialog.open && !event.target.matches('input,textarea,button,a')) {
    if (event.key === 'ArrowLeft') selectOffset(-1);
    else if (event.key === 'ArrowRight') selectOffset(1);
    else if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); activate(state.selected);}
  }
});
function selectOffset(delta) {
  const index = tabs.indexOf(state.selected);
  activate(tabs[(index + delta + tabs.length) % tabs.length], false);
}

// Actual 1AGE World export is loaded as a separate origin. Godot and its original
// six platforms, Earth, ring, stars and exact gamepad stay under World's control.
// Cash account data/tokens are NEVER sent through postMessage or into the iframe.
// A successful iframe 'load' event only means its HTML loaded, NOT that Godot,
 // all World resources or the rotating globe are fully ready.
const worldFrame = document.querySelector('#oneage-world');
const worldStatus = document.querySelector('#world-status');
if (worldFrame && worldStatus) {
  worldFrame.addEventListener('load', () => {
    worldStatus.hidden = true;
  }, {once:true});
  worldFrame.addEventListener('error', () => {
    worldStatus.textContent = '1AGE World could not load. Use Open World to visit the real environment.';
    worldStatus.hidden = false;
  });
}
activate('balance', false);
loadAccount();
window.addEventListener('oneage:identity-ready', () => loadAccount());
