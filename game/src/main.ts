import * as THREE from 'three';
import './style.css';
import { createPrototypeWorld } from './world/createPrototypeWorld';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('No #app root');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#c5d5d5');
scene.fog = new THREE.Fog('#c5d5d5', 95, 260);
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
root.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xe8f3ff, 0x6f7566, 2));
const sun = new THREE.DirectionalLight(0xffedcf, 2.5);
sun.position.set(-35, 65, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);
createPrototypeWorld(scene);

// Lightweight in-game interface: the scene is a visual blockout, not surveyed geography.
const hud = document.createElement('div');
hud.className = 'hud';
hud.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">BA</span><div><strong>BUENOS AIRES</strong><small>PERFECTA <i> / </i> PROTOTIPO 01</small></div></div>
    <div class="location"><span class="live-dot"></span> PALERMO · BUENOS AIRES</div>
  </header>
  <section class="intro"><p>EXPLORACIÓN URBANA</p><h1>Una ciudad.<br><em>Mil historias.</em></h1><span>Primer blockout 3D · Plaza y manzanas urbanas</span></section>
  <div class="bottom-panel"><div><small>SECTOR ACTUAL</small><strong>PALERMO SOHO</strong></div><div class="divider"></div><div><small>CONTROLES</small><strong>Arrastrá para mirar <b>·</b> Scroll para acercar</strong></div><div class="prototype-tag">GEOMETRÍA PROVISIONAL</div></div>
  <div class="crosshair"><span></span><span></span></div>
`;
root.appendChild(hud);

const target = new THREE.Vector3();
let azimuth = Math.PI / 4, elevation = 0.62, distance = 72;
let dragging = false, px = 0, py = 0;
function updateCamera() {
  camera.position.set(
    target.x + distance * Math.cos(elevation) * Math.sin(azimuth),
    target.y + distance * Math.sin(elevation),
    target.z + distance * Math.cos(elevation) * Math.cos(azimuth)
  );
  camera.lookAt(target);
}
updateCamera();
renderer.domElement.addEventListener('pointerdown', e => {
  dragging = true; px = e.clientX; py = e.clientY;
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointerup', () => dragging = false);
renderer.domElement.addEventListener('pointercancel', () => dragging = false);
renderer.domElement.addEventListener('pointermove', e => {
  if (!dragging) return;
  azimuth -= (e.clientX - px) * 0.006;
  elevation = THREE.MathUtils.clamp(elevation + (e.clientY - py) * 0.004, 0.18, 1.35);
  px = e.clientX; py = e.clientY; updateCamera();
});
renderer.domElement.addEventListener('wheel', e => {
  distance = THREE.MathUtils.clamp(distance + e.deltaY * 0.045, 24, 150);
  updateCamera();
}, { passive: true });
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop(() => renderer.render(scene, camera));
