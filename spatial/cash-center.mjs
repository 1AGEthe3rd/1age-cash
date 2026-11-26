import * as THREE from '../experiences/shared/vendor/three.module.js';
import {createWalker} from './walking.mjs';
import {createFloorMaterial,addArchitecture,addContactShade} from './architecture.mjs';
const $=s=>document.querySelector(s),stage=$('#scene'),status=$('#status'),panel=$('#panel'),body=$('#panel-body');
const icon=new URL('./cash-icon.svg',import.meta.url).href;
let walker=null,quality=1.5,resize=()=>{};
function show(tab='home'){
 body.replaceChildren();$('#panel-title').textContent=({home:'1AGE Cash',add:'Add Cash',activity:'Activity',use:'Use Cash',menu:'1AGE'})[tab]||'1AGE Cash';
 const make=(tag,content,parent=body)=>{const e=document.createElement(tag);e.textContent=content;parent.append(e);return e;};
 const button=(name,fn,parent=body)=>{const b=make('button',name,parent);b.type='button';b.addEventListener('click',fn);return b;};
 const link=(name,url)=>{const a=make('a',name);a.href=url;return a;};
 if(tab==='home'){
 const img=make('img','');img.src=icon;img.alt='';img.width=56;img.height=56;
 make('div','—').className='cash-value';make('p','Secure account not connected in this preview.');
 button('Add Cash',()=>show('add'));button('Activity',()=>show('activity'));button('Use Cash',()=>show('use'));link('Open existing Cash account interface','../');
 }else if(tab==='add'){
 make('p','Choose an example amount. No order or charge will be created.');
 const group=make('div','');group.className='cash-amounts';let choice=null;
 const summary=make('p','Select an amount to preview.');
 for(const amount of [5,10,20]){const b=button('$'+amount,()=>{choice=amount;for(const other of group.children)other.setAttribute('aria-pressed',String(other===b));summary.textContent='Selected: $'+choice+'. Purchases are not enabled.';},group);b.setAttribute('aria-pressed','false');}
 const checkout=button('Checkout unavailable',()=>{});checkout.disabled=true;
 make('p','Secure identity, verified payment processing and ledger approval are required before real purchases can be enabled.');
 button('Back',()=>show());
 }else if(tab==='activity'){
 make('p','No secure account connected. Real activity is not available in this preview.');link('Open existing Cash account interface','../');button('Back',()=>show());
 }else if(tab==='use'){
 make('p','Cash is intended for eligible first-party digital purchases and rewards. Spending is not enabled here.');
 for(const [n,url] of [['Games','https://1age.games/'],['Quest','https://1age.quest/'],['Space','https://1age.space/']])link(n,url);
 button('Back',()=>show());
 }else{
 link('1AGE World','https://1age.world/');link('1AGE.com','https://1age.com/');link('Existing Cash interface','../');
 const label=make('label','Graphics resolution');const select=make('select','',label);for(const [n,v] of [['Low','0.8'],['Balanced','1.5'],['High','2']])select.add(new Option(n,v));select.value=String(quality);select.onchange=()=>{quality=Number(select.value);resize();};button('Cash',()=>show());
 }
 make('p','Internal account credits · not cryptocurrency or withdrawable funds.');
 walker?.clear();if(!panel.open)panel.showModal();
}
$('#cash-shortcut').onclick=()=>show();$('#interact').onclick=()=>show();$('#menu').onclick=()=>show('menu');$('#reset').onclick=()=>{walker?.clear();walker?.reset();};
panel.addEventListener('close',()=>walker?.clear());
try{
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x03060d);
 const camera=new THREE.PerspectiveCamera(64,1,.08,260),renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;stage.append(renderer.domElement);
 const std=(color,metalness=.2,roughness=.45)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
 const dark=std(0x15232d,.4),alloy=std(0xc4d0d6,.4,.32),floor=createFloorMaterial(),cyan=new THREE.MeshBasicMaterial({color:0x9cdeff});
 const glass=new THREE.MeshPhysicalMaterial({color:0x9edaff,transparent:true,opacity:.075,depthWrite:false,side:THREE.DoubleSide});
 const mesh=(g,m,x,y,z,parent=scene)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);parent.add(o);return o;};
 const cyl=(a,b,h,m,x,y,z,parent=scene)=>mesh(new THREE.CylinderGeometry(a,b,h,64),m,x,y,z,parent);
 const ring=(r,t,m,y,parent=scene)=>{const o=mesh(new THREE.TorusGeometry(r,t,8,96),m,0,y,0,parent);o.rotation.x=Math.PI/2;return o;};
 scene.add(new THREE.HemisphereLight(0xe2f1ff,0x465564,1.7));const sun=new THREE.DirectionalLight(0xe5f0ff,1.7);sun.position.set(-12,14,-8);scene.add(sun);
 cyl(11.4,11.5,.32,floor,0,-.16,0);cyl(11.4,11.4,.35,dark,0,5.6,0);mesh(new THREE.CylinderGeometry(10.95,10.95,4.95,96,1,true),glass,0,2.72,0);addArchitecture(scene);ring(10.75,.045,cyan,.026);ring(4,.025,cyan,.026);
 let seed=47;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),points=[];for(let i=0;i<2400;i++){const a=rand()*Math.PI*2,v=rand()*2-1,r=106+rand()*32;points.push(Math.cos(a)*Math.sqrt(1-v*v)*r,v*r,Math.sin(a)*Math.sqrt(1-v*v)*r);}
 const stars=new THREE.BufferGeometry();stars.setAttribute('position',new THREE.Float32BufferAttribute(points,3));scene.add(new THREE.Points(stars,new THREE.PointsMaterial({color:0xdceaff,size:.19})));
 const earthMat=std(0x447eb2,0,.9),earth=mesh(new THREE.SphereGeometry(14,48,32),earthMat,-18,9,-47);earth.rotation.z=.18;
 new THREE.TextureLoader().load(new URL('../experiences/shared/world-surface.png',import.meta.url).href,t=>{t.colorSpace=THREE.SRGBColorSpace;earthMat.map=t;earthMat.color.set(0xffffff);earthMat.needsUpdate=true;},undefined,()=>{});
 mesh(new THREE.SphereGeometry(2.6,24,16),std(0xa7abb5,0,1),21,9,-57);
 const hub=new THREE.Group();scene.add(hub);addContactShade(scene,0,0,2.5);cyl(1.8,2,.2,dark,0,.1,0,hub);cyl(1.3,1.6,.6,alloy,0,.5,0,hub);ring(1.4,.04,cyan,.87,hub);
 const hologram=new THREE.Group();hologram.position.y=2.35;hub.add(hologram);
 const token=cyl(.86,.86,.10,alloy,0,0,0,hologram);token.rotation.x=Math.PI/2;
 const faceMat=new THREE.MeshBasicMaterial({color:0x92dcff,transparent:true,side:THREE.FrontSide});new THREE.TextureLoader().load(icon,t=>{t.colorSpace=THREE.SRGBColorSpace;faceMat.map=t;faceMat.color.set(0xffffff);faceMat.needsUpdate=true;});
 for(const side of [-1,1]){const face=mesh(new THREE.CircleGeometry(.84,64),faceMat,0,0,side*.055,hologram);if(side<0)face.rotation.y=Math.PI;}
 ring(1.08,.024,cyan,1.5,hub);ring(1.02,.024,cyan,3.33,hub);
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
 walker=createWalker(camera,renderer.domElement,{radius:10.15,eyeHeight:1.75,spawn:[0,1.75,6.5],obstacles:[{x:0,z:0,r:2}],paused:()=>panel.open,onTap:e=>{const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);if(ray.intersectObject(hub,true).length)show();}});
 addEventListener('keydown',e=>{if(e.code==='KeyE'&&!panel.open&&!e.repeat&&!e.target?.closest?.('input,textarea,select'))show();});
 resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio,quality));renderer.setSize(innerWidth,innerHeight);};resize();addEventListener('resize',resize);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();renderer.setAnimationLoop(null);status.textContent='3D unavailable. Cash controls still work.';});
 let last=performance.now();status.textContent='';renderer.setAnimationLoop(now=>{const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;walker.update(dt);earth.rotation.y+=dt*.025;hologram.rotation.y+=dt*.45;renderer.render(scene,camera);});
}catch(error){console.error(error);status.textContent='3D unavailable. Cash controls still work.';}
