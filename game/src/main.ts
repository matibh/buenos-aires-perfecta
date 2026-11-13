import * as THREE from 'three';
import './style.css';
import { createObeliscoWorld, type ObeliscoWorldData } from './world/createObeliscoWorld';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('No #app root');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#aebfc0');
scene.fog = new THREE.Fog('#aebfc0', 520, 1650);
const camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.1, 2400);
const renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio <= 1.5, powerPreference: 'high-performance' });
const maxPixelRatio = Math.min(devicePixelRatio, 1.25);
let currentPixelRatio = maxPixelRatio;
renderer.setPixelRatio(currentPixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe8f3ff, 0x6f7566, 2));
const sun = new THREE.DirectionalLight(0xffedcf, 2.2);
sun.position.set(-35, 65, 25);
scene.add(sun);

const world = new THREE.Group();
scene.add(world);
let colliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; height?: number }> = [];
let worldReady = false;
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
    <span>Recorré el Obelisco, la 9 de Julio y la calle Corrientes.</span>
    <button id="start-button" disabled>PREPARANDO EL MUNDO…</button>
    <small id="load-status">Cargando edificios, calles y comercios reales.</small>
  </div>
  <div class="reticle"><i></i><i></i></div>
  <div class="bottom-panel">
    <div><small>MOVERSE</small><strong>W A S D</strong></div><div><small>SALTAR</small><strong>SPACE</strong></div>
    <div><small>VOLAR</small><strong>2× SPACE</strong></div><div><small>BAJAR</small><strong>SHIFT</strong></div>
    <div class="mode" id="mode">A PIE</div>
  </div>
  <div class="hint" id="hint">WASD caminar · SPACE saltar · doble SPACE volar · Click captura cámara</div>
  <div class="map-attribution" id="map-attribution"></div>
`;
root.appendChild(hud);

const startPanel = hud.querySelector<HTMLDivElement>('#start-panel')!;
const startButton = hud.querySelector<HTMLButtonElement>('#start-button')!;
const loadStatus = hud.querySelector<HTMLElement>('#load-status')!;
const modeLabel = hud.querySelector<HTMLDivElement>('#mode')!;
const hint = hud.querySelector<HTMLDivElement>('#hint')!;
const mapAttribution = hud.querySelector<HTMLDivElement>('#map-attribution')!;

fetch('data/obelisco-world.json')
  .then(response => {
    if (!response.ok) throw new Error('Los datos 3D del Obelisco todavía no están publicados.');
    return response.json() as Promise<ObeliscoWorldData>;
  })
  .then(data => {
    colliders = createObeliscoWorld(world, data);
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
    loadStatus.textContent = `${businesses} locales identificados · ${pizzerias} pizzerías · fachadas y carteles`;
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
