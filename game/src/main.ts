import * as THREE from 'three';
import './style.css';
import { createPrototypeWorld } from './world/createPrototypeWorld';
import { createObeliscoWorld, type ObeliscoWorldData } from './world/createObeliscoWorld';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('No #app root');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#aebfc0');
scene.fog = new THREE.Fog('#aebfc0', 75, 210);
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe8f3ff, 0x6f7566, 2));
const sun = new THREE.DirectionalLight(0xffedcf, 2.2);
sun.position.set(-35, 65, 25); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
const palermoGroup = new THREE.Group(); scene.add(palermoGroup);
const obeliscoGroup = new THREE.Group(); obeliscoGroup.visible = false; scene.add(obeliscoGroup);
let colliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; height?: number }> = createPrototypeWorld(palermoGroup);
let obeliscoColliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; height?: number }> = [];
let obeliscoReady = false;

const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">BA</span><div><strong>BUENOS AIRES</strong><small>PERFECTA <i>/</i> PLAYTEST 01</small></div></div>
    <div class="top-actions"><div class="location" id="location-label"><span class="live-dot"></span> PALERMO · BUENOS AIRES</div><div class="level-switch"><button class="level-button active" id="level-palermo">PALERMO</button><button class="level-button" id="level-obelisco" disabled>OBELISCO · CARGANDO</button></div></div>
  </header>
  <div class="center-message" id="start-panel">
    <p>PALERMO SOHO · BUILD 01</p><h1>La ciudad<br><em>es tuya.</em></h1>
    <span>Explorá las primeras calles de Buenos Aires.</span>
    <button id="start-button">ENTRAR AL MUNDO <b>→</b></button>
  </div>
  <div class="reticle"><i></i><i></i></div>
  <div class="bottom-panel">
    <div><small>MOVERSE</small><strong>W A S D</strong></div><div><small>SALTAR</small><strong>SPACE</strong></div>
    <div><small>VOLAR</small><strong>2× SPACE</strong></div><div><small>BAJAR</small><strong>SHIFT</strong></div>
    <div class="mode" id="mode">A PIE</div>
  </div>
  <div class="hint" id="hint">Click para capturar el mouse · ESC para liberar</div>
`;
root.appendChild(hud);

const startPanel = hud.querySelector<HTMLDivElement>('#start-panel')!;
const startButton = hud.querySelector<HTMLButtonElement>('#start-button')!;
const modeLabel = hud.querySelector<HTMLDivElement>('#mode')!;
const hint = hud.querySelector<HTMLDivElement>('#hint')!;
const locationLabel = hud.querySelector<HTMLDivElement>('#location-label')!;
const palermoButton = hud.querySelector<HTMLButtonElement>('#level-palermo')!;
const obeliscoButton = hud.querySelector<HTMLButtonElement>('#level-obelisco')!;
fetch(import.meta.env.BASE_URL + 'data/obelisco-world.json').then(r => { if (!r.ok) throw new Error('OSM data not ready'); return r.json() as Promise<ObeliscoWorldData>; }).then(data => {
  obeliscoColliders = createObeliscoWorld(obeliscoGroup, data);
  obeliscoReady = true;
  obeliscoButton.disabled = false;
  obeliscoButton.textContent = 'OBELISCO';
}).catch(() => { obeliscoButton.textContent = 'OBELISCO · EN PREPARACIÓN'; });

const player = new THREE.Vector3(0, 1.72, 29);
const velocity = new THREE.Vector3();
const keys = new Set<string>();
let yaw = 0, pitch = 0, grounded = true, flying = false, started = false;
let lastSpace = 0, lastTime = performance.now();
const radius = .38, eyeHeight = 1.72;
const createPrototypeWorldColliders = colliders;
function switchLevel(level: 'palermo' | 'obelisco') {
  if (level === 'obelisco' && !obeliscoReady) return;
  palermoGroup.visible = level === 'palermo';
  obeliscoGroup.visible = level === 'obelisco';
  colliders = level === 'palermo' ? createPrototypeWorldColliders : obeliscoColliders;
  player.set(0, eyeHeight, level === 'palermo' ? 29 : 48);
  velocity.set(0, 0, 0); grounded = true; flying = false; yaw = 0; pitch = 0;
  modeLabel.textContent = 'A PIE'; modeLabel.classList.remove('flying');
  locationLabel.innerHTML = '<span class="live-dot"></span> ' + (level === 'palermo' ? 'PALERMO SOHO' : 'OBELISCO · SAN NICOLÁS') + ' · BUENOS AIRES';
  palermoButton.classList.toggle('active', level === 'palermo');
  obeliscoButton.classList.toggle('active', level === 'obelisco');
  hint.textContent = level === 'obelisco' ? 'Explorá el Obelisco y las cuadras del centro · ESC para liberar' : 'Explorá Palermo Soho · ESC para liberar';
  updateCamera();
}
const forward = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();

function updateCamera() {
  camera.position.copy(player);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}
function blocked(x: number, z: number, y: number) {
  for (const b of colliders) {
    if (y - eyeHeight > (b.height ?? 999) + .2) continue;
    if (x + radius > b.minX && x - radius < b.maxX && z + radius > b.minZ && z - radius < b.maxZ) return true;
  }
  return false;
}
palermoButton.addEventListener('click', () => switchLevel('palermo'));
obeliscoButton.addEventListener('click', () => switchLevel('obelisco'));

function toggleFlight() {
  flying = !flying;
  velocity.y = 0;
  modeLabel.textContent = flying ? 'VUELO ACTIVADO' : 'A PIE';
  modeLabel.classList.toggle('flying', flying);
  hint.textContent = flying ? 'Vuelo: SPACE sube · SHIFT baja · doble SPACE desactiva' : 'Doble SPACE para volar · ESC para liberar el mouse';
}
function lockPointer() { renderer.domElement.requestPointerLock(); }
startButton.addEventListener('click', () => { started = true; startPanel.classList.add('hidden'); lockPointer(); });
renderer.domElement.addEventListener('click', () => { if (started && document.pointerLockElement !== renderer.domElement) lockPointer(); });
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === renderer.domElement;
  if (started && !locked) hint.textContent = 'Mouse liberado · Click en el mundo para continuar';
});
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= e.movementX * .0022;
  pitch = THREE.MathUtils.clamp(pitch - e.movementY * .0022, -1.48, 1.48);
});
document.addEventListener('keydown', e => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'Space' && !e.repeat && started) {
    const now = performance.now();
    if (now - lastSpace < 320) toggleFlight();
    else if (!flying && grounded) { velocity.y = 7.2; grounded = false; }
    lastSpace = now;
  }
});
document.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function tick(now: number) {
  const dt = Math.min((now - lastTime) / 1000, .04); lastTime = now;
  if (started && document.pointerLockElement === renderer.domElement) {
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
      player.y = THREE.MathUtils.clamp(player.y + vertical * 7 * dt, 1.72, 80);
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
  }
  renderer.render(scene, camera);
}
updateCamera();
renderer.setAnimationLoop(tick);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
