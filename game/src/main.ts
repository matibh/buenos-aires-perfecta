import * as THREE from 'three';
import './style.css';
import { createPrototypeWorld } from './world/createPrototypeWorld';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('No #app root');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#b8c9cf');
scene.fog = new THREE.Fog('#b8c9cf', 90, 260);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
root.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xe8f3ff, 0x6f7566, 2));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
sun.position.set(-35, 65, 25); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); scene.add(sun);
createPrototypeWorld(scene);
const target = new THREE.Vector3();
let azimuth = Math.PI / 4, elevation = 0.62, distance = 72, dragging = false, px = 0, py = 0;
function updateCamera() {
  camera.position.set(target.x + distance*Math.cos(elevation)*Math.sin(azimuth), target.y + distance*Math.sin(elevation), target.z + distance*Math.cos(elevation)*Math.cos(azimuth));
  camera.lookAt(target);
}
updateCamera();
renderer.domElement.addEventListener('pointerdown', e => { dragging=true; px=e.clientX; py=e.clientY; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointerup', () => dragging=false);
renderer.domElement.addEventListener('pointermove', e => { if(!dragging)return; azimuth-=(e.clientX-px)*0.006; elevation=THREE.MathUtils.clamp(elevation+(e.clientY-py)*0.004,0.18,1.35); px=e.clientX; py=e.clientY; updateCamera(); });
renderer.domElement.addEventListener('wheel', e => { distance=THREE.MathUtils.clamp(distance+e.deltaY*0.045,24,150); updateCamera(); }, {passive:true});
addEventListener('resize', () => { camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
renderer.setAnimationLoop(() => renderer.render(scene,camera));