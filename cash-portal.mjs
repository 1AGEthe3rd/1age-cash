import * as THREE from './experiences/shared/vendor/three.module.js';
import { subscribeInput } from './experiences/shared/gamepad.mjs';

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
  title.textContent = ({balance:'Cash Balance',add:'Add Cash',activity:'Activity',use:'Use Cash',about:'About 1AGE Cash'})[name] || '1AGE Cash';
  content.replaceChildren();
  if (name === 'about') {
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

document.querySelector('#cash-info').addEventListener('click', () => renderPanel('about'));
document.querySelector('#close-panel').addEventListener('click', () => dialog.close());
actions.forEach(button => button.addEventListener('click', () => activate(button.dataset.action)));
dialog.addEventListener('close', () => root.focus({preventScroll:true}));
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

let renderer, scene, camera, core, stations = [], frames = 0, previousTime = 0, angle = 0, pitch = .10, dragging = null;
const objects = [];
const selectRay = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const isCoarse = matchMedia('(pointer:coarse)').matches;

function wordSprite(value, width=768, height=160) {
  const canvas = document.createElement('canvas');
  canvas.width=width; canvas.height=height;
  const c=canvas.getContext('2d');
  c.clearRect(0,0,width,height);
  c.font='650 62px system-ui';
  c.fillStyle='#dfffea';c.textAlign='center';c.fillText(value,width/2,height*.65);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2.8,.6),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}));
  return mesh;
}
function ring(radius, color, thickness=.018, segments=80) {
  const m=new THREE.Mesh(
    new THREE.TorusGeometry(radius,thickness,7,segments),
    new THREE.MeshBasicMaterial({color,transparent:true,opacity:.82,depthWrite:false})
  );
  m.rotation.x=Math.PI/2;
  return m;
}
function createScene() {
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5));
  root.append(renderer.domElement);
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(48,1,.1,100);
  scene.add(new THREE.HemisphereLight(0x86f9bb,0x07140c,2.2));
  const key=new THREE.PointLight(0xcffff0,68,35);key.position.set(4,7,7);scene.add(key);
  const fill=new THREE.PointLight(0x0bfd83,30,23);fill.position.set(-6,0,5);scene.add(fill);
  // An original 3D vault, not a copied World scene or a flat CSS circle.
  const vaultMaterial=new THREE.MeshPhysicalMaterial({
    color:0x125f3a,metalness:.54,roughness:.20,transparent:true,opacity:.88,
    clearcoat:1,clearcoatRoughness:.15,emissive:0x08351f,emissiveIntensity:.6
  });
  core=new THREE.Group();
  const shell=new THREE.Mesh(new THREE.IcosahedronGeometry(1.75,2),vaultMaterial);
  core.add(shell);
  const inner=new THREE.Mesh(new THREE.IcosahedronGeometry(1.45,1),
    new THREE.MeshStandardMaterial({color:0x05130b,emissive:0x12774b,emissiveIntensity:.20,wireframe:true}));
  core.add(inner);
  for (const [r,tilt] of [[2.18,.13],[2.4,-.26],[2.62,.42]]) {
    const orbit=ring(r,0x1bfd9c,r===2.18?.020:.009);
    orbit.rotation.set(Math.PI/2+tilt,0,tilt*1.5);
    core.add(orbit);
  }
  core.position.y=.25;scene.add(core);
  const stage=new THREE.Mesh(new THREE.CylinderGeometry(4.9,5.25,.27,84),
    new THREE.MeshStandardMaterial({color:0x051910,metalness:.72,roughness:.28}));
  stage.position.y=-2.5;scene.add(stage);
  const edge=ring(5.02,0x1bfd9c,.027,120);
  edge.position.y=-2.34;scene.add(edge);
  const rail=ring(6.7,0x28634d,.012,120);
  rail.position.y=-2.4;scene.add(rail);
  const nodeMat=new THREE.MeshStandardMaterial({
    color:0x0d4932,metalness:.56,roughness:.29,emissive:0x09291b,emissiveIntensity:.45
  });
  const stationRadius = 4.4;
  for(let i=0;i<tabs.length;i++){
    const a=i*Math.PI/2 + Math.PI/4;
    const group=new THREE.Group();
    group.position.set(Math.sin(a)*stationRadius,-1.55,Math.cos(a)*stationRadius);
    const stone=new THREE.Mesh(new THREE.CylinderGeometry(.66,.8,.23,32),nodeMat);
    group.add(stone);
    const halo=ring(.77,0x1bfd9c,.023,52);
    halo.position.y=.16;group.add(halo);
    const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.48,1),
      new THREE.MeshStandardMaterial({color:i===1?0x6cfbc0:0x215f45,metalness:.64,roughness:.20,emissive:0x0d7041,emissiveIntensity:.32}));
    gem.position.y=.75;group.add(gem);
    const tag=wordSprite(['BALANCE','ADD CASH','ACTIVITY','USE CASH'][i]);
    tag.position.set(0,-.32,0);tag.scale.set(.46,.46,.46);
    group.add(tag);
    group.userData.tab=tabs[i];
    scene.add(group);
    stations.push({group,gem,halo});
    objects.push(stone,gem);
  }
  let seed=1271;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const coords=[];
  for(let i=0;i<380;i++)coords.push((random()-.5)*50,(random()-.5)*35,(random()-.5)*35-14);
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));
  scene.add(new THREE.Points(geometry,new THREE.PointsMaterial({color:0x8cbba3,size:.028})));
  const ground=ring(9,0x16392a,.008,180);
  ground.position.y=-2.5;scene.add(ground);
  resize();
  new ResizeObserver(resize).observe(root);
  renderer.domElement.addEventListener('pointerdown', event=>{
    if(event.button!==0) return;
    dragging={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
    renderer.domElement.setPointerCapture(event.pointerId);
  });
  renderer.domElement.addEventListener('pointermove',event=>{
    if(dragging?.id!==event.pointerId)return;
    const dx=event.clientX-dragging.x,dy=event.clientY-dragging.y;
    if(Math.abs(dx)+Math.abs(dy)>3)dragging.moved=true;
    angle-=dx*.006;
    pitch=Math.max(-.45,Math.min(.55,pitch+dy*.003));
    dragging.x=event.clientX;dragging.y=event.clientY;
  });
  renderer.domElement.addEventListener('pointerup',event=>{
    if(!dragging||dragging.id!==event.pointerId)return;
    const moved=dragging.moved;dragging=null;
    if(moved)return;
    const r=renderer.domElement.getBoundingClientRect();
    pointer.x=((event.clientX-r.left)/r.width)*2-1;
    pointer.y=-((event.clientY-r.top)/r.height)*2+1;
    selectRay.setFromCamera(pointer,camera);
    const hits=selectRay.intersectObjects(objects);
    if(hits.length){
      let parent=hits[0].object;
      while(parent&&!parent.userData?.tab)parent=parent.parent;
      if(parent?.userData?.tab)activate(parent.userData.tab);
    }
  });
  renderer.domElement.addEventListener('pointercancel',()=>{dragging=null});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!frames)frames=requestAnimationFrame(draw)});
  frames=requestAnimationFrame(draw);
}
function resize() {
  if(!renderer)return;
  const w=Math.max(1,root.clientWidth),h=Math.max(1,root.clientHeight);
  camera.aspect=w/h;
  camera.fov=w/h<.65?59:48;
  camera.position.set(0,2.1,w/h<.65?25:14);
  camera.lookAt(0,-.10,0);
  camera.updateProjectionMatrix();
  renderer.setSize(w,h,false);
}
function draw(now) {
  frames=0;
  if(document.hidden)return;
  const dt=Math.min(.05,Math.max(0,(now-previousTime)/1000||0));previousTime=now;
  if(!reducedMotion.matches){
    core.rotation.y+=dt*.10;
    stations.forEach((station,i)=>{
      station.gem.rotation.y+=dt*.23;
      station.gem.position.y=.72+Math.sin(now/1000+i*2)*.04;
    });
  }
  for(const station of stations){
    station.halo.material.color.setHex(station.group.userData.tab===state.selected?0xe2ffdc:0x1bfd9c);
  }
  camera.position.y=2.1+pitch*5;
  const dist=camera.aspect<.65?25:14;
  camera.position.z=Math.cos(angle)*dist;
  camera.position.x=Math.sin(angle)*dist;
  camera.lookAt(0,-.1,0);
  renderer.render(scene,camera);
  frames=requestAnimationFrame(draw);
}
const unsubscribe=subscribeInput((input,dt)=>{
  if(dialog.open)return;
  angle+=input.look.x*dt*1.4;
  pitch=Math.max(-.45,Math.min(.55,pitch+input.look.y*dt*.75));
  if(Math.abs(input.move.x)>.85&&!state.lastNavPressed){
    selectOffset(input.move.x>0?1:-1);
    state.lastNavPressed=true;
  }
  if(Math.abs(input.move.x)<.25)state.lastNavPressed=false;
});
try{createScene()}catch(error){
  root.querySelector('.scene-fallback').hidden=false;
  console.warn('Cash 3D scene not available',error?.message);
}
activate('balance',false);
loadAccount();
// Tokens remain in memory; the login integration will notify this UI after
// secure Page identity becomes available. No user credentials are collected.
window.addEventListener('oneage:identity-ready',()=>loadAccount());
addEventListener('pagehide',()=>{
  unsubscribe();
  cancelAnimationFrame(frames);
  renderer?.dispose();
});
