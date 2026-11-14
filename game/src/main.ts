import * as THREE from 'three';
import './style.css';
import { createObeliscoWorld, type ObeliscoWorldData } from './world/createObeliscoWorld';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('No #app root');

const scene = new THREE.Scene();
// Clear Buenos Aires daylight: blue sky, warm sun and distant atmospheric fade.
scene.background = new THREE.Color('#83c9f2');
scene.fog = new THREE.Fog('#a9d8ef', 1050, 2050);
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 2400);
const renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio <= 1.5, powerPreference: 'high-performance' });
const maxPixelRatio = Math.min(devicePixelRatio, 1.25);
let currentPixelRatio = maxPixelRatio;
renderer.setPixelRatio(currentPixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xd8efff, 0x756b58, 1.45));
scene.add(new THREE.AmbientLight(0xffffff, 0.18));
const sun = new THREE.DirectionalLight(0xfff4df, 2.25);
sun.position.set(-120, 180, 90);
scene.add(sun);

// A small, static set of soft cumulus clouds. Instancing keeps this to one draw call.
const cloudGeometry = new THREE.SphereGeometry(1, 8, 6);
const cloudMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, opacity: 0.88, depthWrite: false,
  fog: false
});
const cloudPuffs = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, 36);
cloudPuffs.frustumCulled = true;
cloudPuffs.renderOrder = 1;
const cloudDummy = new THREE.Object3D();
const cloudClusters = [
  [-620, 205, -520, 1.0], [-260, 230, -760, .8], [180, 215, -680, .9],
  [610, 225, -470, 1.1], [820, 205, 40, .75], [520, 235, 610, .9],
  [-40, 220, 780, .8], [-570, 210, 520, .85], [-900, 230, -80, .7]
];
let cloudIndex = 0;
for (const [cx, cy, cz, size] of cloudClusters) {
  for (let puff = 0; puff < 4; puff++) {
    const angle = puff * Math.PI * .5 + .35;
    cloudDummy.position.set(cx + Math.cos(angle) * 15 * size, cy + (puff % 2) * 3, cz + Math.sin(angle) * 12 * size);
    cloudDummy.scale.set(22 * size, 5.5 * size, 13 * size);
    cloudDummy.updateMatrix();
    cloudPuffs.setMatrixAt(cloudIndex++, cloudDummy.matrix);
  }
}
cloudPuffs.instanceMatrix.needsUpdate = true;
scene.add(cloudPuffs);

const world = new THREE.Group();
scene.add(world);
let colliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; height?: number }> = [];
let worldReady = false;
type RenderChunk = { group: THREE.Group; detail: THREE.Group; x: number; z: number; visible: boolean; detailVisible: boolean };
let renderChunks: RenderChunk[] = [];
let lastChunkUpdate = 0;
const colliderGrid = new Map<string, typeof colliders>();
const COLLIDER_CELL_SIZE = 64;
let worldAttribution = 'Cargando fuentes geográficas…';

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">BA</span><div><strong>BUENOS AIRES</strong><small>PERFECTA <i>/</i> OBELISCO</small></div></div>
    <div class="location" id="location-label"><span class="live-dot"></span> OBELISCO · SAN NICOLÁS · BUENOS AIRES</div>
  </header>
  <div class="center-message" id="start-panel">
    <p>BUENOS AIRES · NIVEL 01</p><h1>El corazón<br><em>porteño.</em></h1>
    <span>Entrenamiento urbano · enfrentate a bots en el centro porteño.</span>
    <button id="start-button" disabled>PREPARANDO EL MUNDO…</button>
    <small id="load-status">Cargando edificios, calles y comercios reales.</small>
  </div>
  <div class="compass" role="img" aria-label="Brújula: norte, este, sur y oeste">
    <div class="compass-dial" id="compass-dial">
      <span class="compass-north">N</span><span class="compass-east">E</span>
      <span class="compass-south">S</span><span class="compass-west">O</span>
      <i class="compass-needle"></i>
    </div>
    <i class="compass-center"></i>
  </div>
  <div class="reticle"><i></i><i></i></div>
  <div class="bottom-panel">
    <div><small>MOVERSE</small><strong>W A S D</strong></div><div><small>SALTAR</small><strong>SPACE</strong></div>
    <div><small>VOLAR</small><strong>2× SPACE</strong></div><div><small>BAJAR</small><strong>SHIFT</strong></div>
    <div class="mode" id="mode">A PIE</div>
  </div>
  <div class="hint" id="hint">WASD mover · mouse apuntar · click disparar · R recargar · 1–4 cambiar arma</div>
  <div class="map-attribution" id="map-attribution"></div>
  <section class="combat-hud" id="combat-hud" aria-live="polite">
    <div class="combat-stats"><span><small>VIDA</small><b id="player-health">100</b></span><span><small>BAJAS</small><b id="player-kills">0</b></span><span><small>BOTS</small><b id="bots-left">0</b></span></div>
    <div class="weapon-readout"><div><small id="weapon-slot">1 · RIFLE</small><strong id="weapon-name">M4A1</strong></div><div class="ammo"><b id="ammo-current">30</b><i>/</i><span id="ammo-reserve">120</span></div></div>
  </section>
  <div class="combat-toast" id="combat-toast"></div>

`;
root.appendChild(hud);

const startPanel = hud.querySelector<HTMLDivElement>('#start-panel')!;
const startButton = hud.querySelector<HTMLButtonElement>('#start-button')!;
const loadStatus = hud.querySelector<HTMLElement>('#load-status')!;
const modeLabel = hud.querySelector<HTMLDivElement>('#mode')!;
const hint = hud.querySelector<HTMLDivElement>('#hint')!;
const mapAttribution = hud.querySelector<HTMLDivElement>('#map-attribution')!;
const compassDial = hud.querySelector<HTMLDivElement>('#compass-dial')!;
const combatHud = hud.querySelector<HTMLElement>('#combat-hud')!;
const healthReadout = hud.querySelector<HTMLElement>('#player-health')!;
const killsReadout = hud.querySelector<HTMLElement>('#player-kills')!;
const botsReadout = hud.querySelector<HTMLElement>('#bots-left')!;
const weaponNameReadout = hud.querySelector<HTMLElement>('#weapon-name')!;
const weaponSlotReadout = hud.querySelector<HTMLElement>('#weapon-slot')!;
const ammoCurrentReadout = hud.querySelector<HTMLElement>('#ammo-current')!;
const ammoReserveReadout = hud.querySelector<HTMLElement>('#ammo-reserve')!;
const combatToast = hud.querySelector<HTMLElement>('#combat-toast')!;

fetch('data/obelisco-world.json')
  .then(response => {
    if (!response.ok) throw new Error('Los datos 3D del Obelisco todavía no están publicados.');
    return response.json() as Promise<ObeliscoWorldData>;
  })
  .then(data => {
    colliders = createObeliscoWorld(world, data);
    renderChunks = world.children
      .filter((child): child is THREE.Group => child instanceof THREE.Group && child.userData.renderChunk === true)
      .map(group => ({ group, detail: group.userData.detailGroup as THREE.Group, x: group.userData.centerX as number, z: group.userData.centerZ as number, visible: true, detailVisible: true }));
    for (const collider of colliders) {
      const minX=Math.floor(collider.minX/COLLIDER_CELL_SIZE), maxX=Math.floor(collider.maxX/COLLIDER_CELL_SIZE);
      const minZ=Math.floor(collider.minZ/COLLIDER_CELL_SIZE), maxZ=Math.floor(collider.maxZ/COLLIDER_CELL_SIZE);
      for(let gx=minX;gx<=maxX;gx++) for(let gz=minZ;gz<=maxZ;gz++) {
        const key=`${gx},${gz}`, bucket=colliderGrid.get(key);
        if(bucket) bucket.push(collider); else colliderGrid.set(key,[collider]);
      }
    }
    worldAttribution = '© OpenStreetMap contributors · Buenos Aires Ciudad (CC BY 2.5 AR) · comercios y cartelería identificados por nombre';
    mapAttribution.textContent = worldAttribution;
    const pizzerias = data.counts?.pizzerias ?? 0;
    const businesses = data.counts?.named_businesses ?? 0;
    const facadeColors = data.counts?.facade_color_matches ?? 0;
    const currentFacades = data.counts?.facade_current_2026 ?? 0;
    loadStatus.textContent = `${businesses} locales · ${pizzerias} pizzerías · ${facadeColors} fachadas con color fotográfico · ${currentFacades} referencias fechadas en 2026`;
    startButton.disabled = false;
    startButton.textContent = 'ENTRAR AL OBELISCO →';
    worldReady = true;
    renderer.render(scene, camera);
  })
  .catch(error => {
    loadStatus.textContent = error instanceof Error ? error.message : 'No se pudo cargar el mapa.';
    startButton.textContent = 'MAPA EN PREPARACIÓN';
  });

const player = new THREE.Vector3(0, 1.72, 25);
const velocity = new THREE.Vector3();
const keys = new Set<string>();
let yaw = 0, pitch = 0, grounded = true, flying = false, started = false;
let lastSpace = 0, lastTime = performance.now();
const radius = .38, eyeHeight = 1.72;
const forward = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();

function updateCamera() {
  camera.position.copy(player);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  // World north is -Z; rotate the compass rose with the camera heading.
  compassDial.style.transform = `rotate(${THREE.MathUtils.radToDeg(yaw)}deg)`;
}
function updateChunkVisibility(now: number) {
  if (now - lastChunkUpdate < 180) return;
  lastChunkUpdate = now;
  const px = player.x, pz = player.z;
  for (const chunk of renderChunks) {
    const distance = Math.hypot(chunk.x - px, chunk.z - pz);
    const shouldShow = distance < 850;
    const shouldShowDetail = distance < 390;
    if (chunk.visible !== shouldShow) { chunk.group.visible = shouldShow; chunk.visible = shouldShow; }
    if (chunk.detailVisible !== shouldShowDetail) { chunk.detail.visible = shouldShowDetail; chunk.detailVisible = shouldShowDetail; }
  }
}
function blocked(x: number, z: number, y: number) {
  const gx = Math.floor(x / COLLIDER_CELL_SIZE), gz = Math.floor(z / COLLIDER_CELL_SIZE);
  const nearby = new Set<typeof colliders[number]>();
  for (let ox=-1; ox<=1; ox++) for (let oz=-1; oz<=1; oz++) {
    const bucket = colliderGrid.get(`${gx+ox},${gz+oz}`);
    if (bucket) for (const item of bucket) nearby.add(item);
  }
  for (const b of (nearby.size ? nearby : colliders)) {
    if (y - eyeHeight > (b.height ?? 999) + .2) continue;
    if (x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) return true;
  }
  return false;
}
function toggleFlight() {
  flying = !flying;
  velocity.y = 0;
  modeLabel.textContent = flying ? 'VUELO ACTIVADO' : 'A PIE';
  modeLabel.classList.toggle('flying', flying);
  hint.textContent = flying ? 'Vuelo: SPACE sube · SHIFT baja · doble SPACE desactiva' : 'Doble SPACE para volar · WASD para moverte';
}
function lockPointer() {
  try {
    const request = renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
    request?.catch(() => { hint.textContent = 'Mouse libre · WASD y SPACE siguen funcionando · Click para reintentar'; });
  } catch {
    hint.textContent = 'Mouse libre · WASD y SPACE siguen funcionando · Click para reintentar';
  }
}
startButton.addEventListener('click', () => {
  if (!worldReady) return;
  started = true;
  startPanel.classList.add('hidden');
  if(bots.length===0)spawnBots(10);
  combatHud.classList.add('active');
  renderer.setAnimationLoop(tick);
  lockPointer();
});
renderer.domElement.addEventListener('click', () => { if (started && document.pointerLockElement !== renderer.domElement) lockPointer(); });
document.addEventListener('pointerlockerror', () => { hint.textContent = 'No se pudo capturar el mouse · WASD y SPACE siguen funcionando'; });
document.addEventListener('pointerlockchange', () => {
  if (started && document.pointerLockElement !== renderer.domElement) hint.textContent = 'Mouse liberado · WASD para caminar · SPACE para saltar · Click para recuperar la cámara';
});
document.addEventListener('mousemove', event => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= event.movementX * .0022;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * .0022, -1.48, 1.48);
});
document.addEventListener('keydown', event => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.code === 'Space' && !event.repeat && started) {
    const now = performance.now();
    if (now - lastSpace < 360) toggleFlight();
    else if (!flying && grounded) { velocity.y = 7.2; grounded = false; }
    lastSpace = now;
  }
});
document.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());


type WeaponSpec = {name:string;slot:string;damage:number;fireDelay:number;magSize:number;reserve:number;reloadMs:number;automatic:boolean;spread:number};
type WeaponState = WeaponSpec & {ammo:number;reserveAmmo:number;nextShot:number;reloading:boolean;reloadEnd:number};
const weaponSpecs:WeaponSpec[]=[
 {name:'M4A1',slot:'1 · RIFLE',damage:27,fireDelay:105,magSize:30,reserve:120,reloadMs:1450,automatic:true,spread:.006},
 {name:'DESERT EAGLE',slot:'2 · PISTOLA',damage:68,fireDelay:390,magSize:7,reserve:49,reloadMs:1250,automatic:false,spread:.012},
 {name:'AWP',slot:'3 · FRANCOTIRADOR',damage:100,fireDelay:1050,magSize:5,reserve:30,reloadMs:1900,automatic:false,spread:.0015},
 {name:'AK-47',slot:'4 · RIFLE',damage:34,fireDelay:125,magSize:30,reserve:120,reloadMs:1600,automatic:true,spread:.009}
];
const weapons:WeaponState[]=weaponSpecs.map(w=>({...w,ammo:w.magSize,reserveAmmo:w.reserve,nextShot:0,reloading:false,reloadEnd:0}));
let activeWeapon=0,playerHealth=100,kills=0,fireHeld=false,nextBotSpawn=0,toastUntil=0;
const botMeshes:THREE.Mesh[]=[];
type Bot={group:THREE.Group;body:THREE.Mesh;head:THREE.Mesh;hp:number;nextAttack:number;nextThink:number;alive:boolean;strafe:number};
const bots:Bot[]=[];
const raycaster=new THREE.Raycaster();raycaster.far=260;
const tracerMaterial=new THREE.LineBasicMaterial({color:0xffdf91,transparent:true,opacity:.9});
const tracers:Array<{line:THREE.Line;expires:number}>=[];
const gunGroup=new THREE.Group();camera.add(gunGroup);gunGroup.position.set(.28,-.25,-.5);
const gunMetal=new THREE.MeshStandardMaterial({color:0x252a2b,metalness:.72,roughness:.36});
const gunDark=new THREE.MeshStandardMaterial({color:0x111516,metalness:.25,roughness:.62});
const gunGrip=new THREE.MeshStandardMaterial({color:0x3b3026,roughness:.95});
const gunSight=new THREE.MeshStandardMaterial({color:0x596365,metalness:.65,roughness:.4});
function gunBox(parent:THREE.Group,w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);parent.add(mesh);return mesh;
}
function buildWeaponModel(index:number){
 gunGroup.clear();gunGroup.scale.setScalar(index===2?1.28:index===1?.78:1);
 gunBox(gunGroup,.17,.15,.48,0,0,0,gunMetal);gunBox(gunGroup,.13,.1,.25,0,.105,-.05,gunDark);
 const length=index===2?.95:index===1?.38:.72;
 const barrel=new THREE.Mesh(new THREE.CylinderGeometry(index===1?.025:.018,index===1?.035:.025,length,8),gunMetal);
 barrel.rotation.x=Math.PI/2;barrel.position.set(0,.015,-.42-length/2);gunGroup.add(barrel);
 gunBox(gunGroup,.105,.22,.13,0,-.16,.12,gunGrip).rotation.x=-.18;
 gunBox(gunGroup,.12,.045,.24,0,-.105,-.02,gunDark);
 if(index===0||index===3){gunBox(gunGroup,.055,.08,.24,0,.105,-.24,gunSight);gunBox(gunGroup,.035,.09,.12,0,.16,-.24,gunDark);gunBox(gunGroup,.14,.08,.32,0,-.015,.27,gunDark);if(index===3)gunBox(gunGroup,.13,.18,.18,0,-.12,.27,gunGrip);}
 else if(index===1){gunBox(gunGroup,.045,.08,.12,0,.105,-.08,gunSight);gunBox(gunGroup,.13,.12,.15,0,-.1,.2,gunDark);}
 else{gunBox(gunGroup,.075,.1,.42,0,.13,-.28,gunDark);gunBox(gunGroup,.045,.06,.32,0,.205,-.28,gunSight);gunBox(gunGroup,.13,.12,.28,0,-.12,.22,gunGrip);}
 gunGroup.position.z=-.5;
}
function showToast(message:string,duration=1500){combatToast.textContent=message;combatToast.classList.add('visible');toastUntil=performance.now()+duration;}
function refreshCombatHud(){
 const w=weapons[activeWeapon];healthReadout.textContent=String(Math.max(0,Math.ceil(playerHealth)));healthReadout.classList.toggle('low',playerHealth<=30);
 killsReadout.textContent=String(kills);botsReadout.textContent=String(bots.filter(b=>b.alive).length);
 weaponNameReadout.textContent=w.name;weaponSlotReadout.textContent=w.slot;ammoCurrentReadout.textContent=w.reloading?'…':String(w.ammo);ammoReserveReadout.textContent=String(w.reserveAmmo);
}
function makeBot(x:number,z:number):Bot{
 const group=new THREE.Group(),uniform=new THREE.MeshStandardMaterial({color:0x394b50,roughness:.9}),armor=new THREE.MeshStandardMaterial({color:0x202a2d,metalness:.18,roughness:.7}),skin=new THREE.MeshStandardMaterial({color:0x98765e,roughness:1});
 const body=new THREE.Mesh(new THREE.CapsuleGeometry(.38,.72,3,6),uniform);body.position.y=1.05;group.add(body);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.25,8,6),skin);head.position.y=1.78;group.add(head);
 const helmet=new THREE.Mesh(new THREE.SphereGeometry(.27,8,5,0,Math.PI*2,0,Math.PI/2),armor);helmet.position.y=1.86;group.add(helmet);
 const rifle=gunBox(group,.09,.09,.62,0,1.15,-.42,gunDark);
 const bot:Bot={group,body,head,hp:100,nextAttack:performance.now()+700+Math.random()*900,nextThink:0,alive:true,strafe:Math.random()<.5?-1:1};
 for(const mesh of [body,head,helmet,rifle]){mesh.userData.bot=bot;botMeshes.push(mesh);}
 group.position.set(x,0,z);world.add(group);bots.push(bot);return bot;
}
function spawnBots(count=10){
 const spots=[[-42,-48],[42,-52],[-48,72],[48,78],[-25,-105],[28,-118],[-58,15],[58,20],[-22,132],[25,145],[-78,-85],[78,95],[0,-165],[0,175]];
 for(let i=0;i<count;i++){let [x,z]=spots[i%spots.length];if(blocked(x,z,1.72)){x+=i%2?18:-18;z+=(i%3)*12;}makeBot(x,z);}
 refreshCombatHud();
}
function switchWeapon(index:number){if(index<0||index>=weapons.length||index===activeWeapon)return;activeWeapon=index;buildWeaponModel(index);refreshCombatHud();}
function reloadWeapon(){
 const w=weapons[activeWeapon],now=performance.now();if(w.reloading||w.ammo===w.magSize||w.reserveAmmo<=0)return;
 w.reloading=true;w.reloadEnd=now+w.reloadMs;refreshCombatHud();showToast('RECARGANDO · '+w.name,w.reloadMs);
}
function finishReloads(now:number){for(const w of weapons)if(w.reloading&&now>=w.reloadEnd){const amount=Math.min(w.magSize-w.ammo,w.reserveAmmo);w.ammo+=amount;w.reserveAmmo-=amount;w.reloading=false;}}
function shootPlayer(now:number){
 const w=weapons[activeWeapon];if(w.reloading||now<w.nextShot)return;
 if(w.ammo<=0){showToast('SIN MUNICIÓN · R PARA RECARGAR',900);w.nextShot=now+250;return;}
 w.ammo--;w.nextShot=now+w.fireDelay;gunGroup.position.z=-.445;
 const spread=w.spread;raycaster.setFromCamera(new THREE.Vector2((Math.random()-.5)*spread,(Math.random()-.5)*spread),camera);
 const hits=raycaster.intersectObjects(botMeshes,false);let end=raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction,90);
 if(hits.length){const hit=hits[0],bot=hit.object.userData.bot as Bot|undefined;end.copy(hit.point);if(bot?.alive){const headshot=hit.object===bot.head;bot.hp-=w.damage*(headshot?1.65:1);if(bot.hp<=0){bot.alive=false;world.remove(bot.group);kills++;showToast(headshot?'¡TIRO A LA CABEZA!':'BOT ELIMINADO',950);nextBotSpawn=now+2300;}else showToast(headshot?'IMPACTO CRÍTICO':'IMPACTO',450);}}
 const geometry=new THREE.BufferGeometry().setFromPoints([camera.position.clone(),end]);const line=new THREE.Line(geometry,tracerMaterial);line.frustumCulled=false;scene.add(line);tracers.push({line,expires:now+65});refreshCombatHud();
}
function updateBots(dt:number,now:number){
 for(const bot of bots){if(!bot.alive)continue;const dx=player.x-bot.group.position.x,dz=player.z-bot.group.position.z,distance=Math.hypot(dx,dz);
  if(distance>5&&now>=bot.nextThink){bot.nextThink=now+180;const inv=1/(distance||1),speed=distance>17?2.65:1.15,sideX=-dz*inv*bot.strafe,sideZ=dx*inv*bot.strafe;
   const nx=bot.group.position.x+dx*inv*speed*dt+sideX*speed*.36*dt,nz=bot.group.position.z+dz*inv*speed*dt+sideZ*speed*.36*dt;
   if(!blocked(nx,bot.group.position.z,1.72))bot.group.position.x=nx;else bot.strafe*=-1;
   if(!blocked(bot.group.position.x,nz,1.72))bot.group.position.z=nz;bot.group.rotation.y=Math.atan2(dx,dz);
  }
  if(distance<72&&now>=bot.nextAttack){bot.nextAttack=now+950+Math.random()*750;if(Math.random()>.32&&Math.random()<Math.max(.18,1-distance/95)){playerHealth=Math.max(0,playerHealth-(5+Math.random()*7));refreshCombatHud();
   if(playerHealth<=0){started=false;document.exitPointerLock?.();startPanel.classList.remove('hidden');startButton.textContent='VOLVER A INTENTAR';showToast('TE ELIMINARON · BAJAS: '+kills,2500);playerHealth=100;kills=0;for(const b of bots){world.remove(b.group);b.alive=false;}bots.length=0;}
  }}
 }
 if(now>=nextBotSpawn&&bots.filter(b=>b.alive).length<10&&started){const a=Math.random()*Math.PI*2,d=65+Math.random()*25;let x=player.x+Math.cos(a)*d,z=player.z+Math.sin(a)*d;if(blocked(x,z,1.72)){x+=18;z-=18;}makeBot(x,z);nextBotSpawn=now+900;refreshCombatHud();}
}
function updateShooter(dt:number,now:number){
 finishReloads(now);if(fireHeld&&weapons[activeWeapon].automatic)shootPlayer(now);
 if(gunGroup.position.z>-.5)gunGroup.position.z=Math.max(-.5,gunGroup.position.z-dt*.8);
 updateBots(dt,now);
 for(let i=tracers.length-1;i>=0;i--)if(now>=tracers[i].expires){scene.remove(tracers[i].line);tracers[i].line.geometry.dispose();tracers.splice(i,1);}
 if(now>toastUntil)combatToast.classList.remove('visible');
}
buildWeaponModel(0);combatHud.classList.add('active');
renderer.domElement.addEventListener('mousedown',event=>{if(event.button!==0||!started)return;fireHeld=true;if(!weapons[activeWeapon].automatic)shootPlayer(performance.now());});
document.addEventListener('mouseup',event=>{if(event.button===0)fireHeld=false;});
document.addEventListener('keydown',event=>{if(!started||event.repeat)return;if(event.code==='Digit1')switchWeapon(0);if(event.code==='Digit2')switchWeapon(1);if(event.code==='Digit3')switchWeapon(2);if(event.code==='Digit4')switchWeapon(3);if(event.code==='KeyR')reloadWeapon();});
window.addEventListener('blur',()=>{fireHeld=false;});

let qualityWindowStart = performance.now();
let qualityFrameCount = 0;
function tick(now: number) {
  const frameMs = now - lastTime;
  const dt = Math.min(frameMs / 1000, .04);
  lastTime = now;
  qualityFrameCount++;
  if (now - qualityWindowStart >= 2000) {
    const averageFrameMs = (now - qualityWindowStart) / qualityFrameCount;
    const nextRatio = averageFrameMs > 22 ? Math.max(1, currentPixelRatio - .15)
      : averageFrameMs < 16 ? Math.min(maxPixelRatio, currentPixelRatio + .1) : currentPixelRatio;
    if (Math.abs(nextRatio - currentPixelRatio) >= .09) {
      currentPixelRatio = nextRatio;
      renderer.setPixelRatio(currentPixelRatio);
      renderer.setSize(innerWidth, innerHeight, false);
    }
    qualityWindowStart = now;
    qualityFrameCount = 0;
  }
  if (started) {
    updateShooter(dt,now);
    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    move.set(0, 0, 0);
    if (keys.has('KeyW')) move.add(forward);
    if (keys.has('KeyS')) move.sub(forward);
    if (keys.has('KeyD')) move.add(right);
    if (keys.has('KeyA')) move.sub(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar((keys.has('ShiftLeft') && !flying ? 7.2 : 5.2) * dt);
    if (flying) {
      let vertical = 0;
      if (keys.has('Space')) vertical += 1;
      if (keys.has('ShiftLeft') || keys.has('ShiftRight')) vertical -= 1;
      player.y = THREE.MathUtils.clamp(player.y + vertical * 7 * dt, 1.72, 90);
      velocity.y = 0;
    } else {
      velocity.y -= 19.6 * dt;
      player.y += velocity.y * dt;
      if (player.y <= eyeHeight) { player.y = eyeHeight; velocity.y = 0; grounded = true; }
    }
    const nx = player.x + move.x, nz = player.z + move.z;
    if (!blocked(nx, player.z, player.y)) player.x = nx;
    if (!blocked(player.x, nz, player.y)) player.z = nz;
    if (player.y < eyeHeight) { player.y = eyeHeight; velocity.y = 0; grounded = true; }
    updateCamera();
    updateChunkVisibility(now);
  }
  renderer.render(scene, camera);
}
updateCamera();
renderer.render(scene, camera);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (!started) renderer.render(scene, camera);
});
