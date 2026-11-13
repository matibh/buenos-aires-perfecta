import * as THREE from 'three';

export type WorldCollider = { minX: number; maxX: number; minZ: number; maxZ: number; height: number };

/** Schematic playable blockout. Geometry is provisional, not surveyed CABA data. */
export function createPrototypeWorld(scene: THREE.Scene): WorldCollider[] {
  const colliders: WorldCollider[] = [];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 130), new THREE.MeshStandardMaterial({ color: 0x9eaa91 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x42494b, roughness: 0.96 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb9b5a8, roughness: 1 });
  const blockMat = new THREE.MeshStandardMaterial({ color: 0xc9bda8, roughness: 0.92 });
  const parkMat = new THREE.MeshStandardMaterial({ color: 0x78966e, roughness: 1 });
  const park = new THREE.Mesh(new THREE.CircleGeometry(11, 48), parkMat);
  park.rotation.x = -Math.PI / 2; park.position.y = 0.08; scene.add(park);

  // Street grid and pale sidewalks make the blockout legible at walking height.
  for (let x = -48; x <= 48; x += 24) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(7, .08, 112), roadMat);
    road.position.set(x, .02, 0); road.receiveShadow = true; scene.add(road);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(2.2, .12, 112), sidewalkMat);
      walk.position.set(x + side * 4.7, .06, 0); walk.receiveShadow = true; scene.add(walk);
    }
  }
  for (let z = -48; z <= 48; z += 24) {
    const road = new THREE.Mesh(new THREE.BoxGeometry(132, .08, 7), roadMat);
    road.position.set(0, .025, z); road.receiveShadow = true; scene.add(road);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(132, .12, 2.2), sidewalkMat);
      walk.position.set(0, .06, z + side * 4.7); walk.receiveShadow = true; scene.add(walk);
    }
  }

  const rand = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  let seed = 1;
  for (let z = -38; z <= 38; z += 12) for (let x = -42; x <= 42; x += 12) {
    if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
    const h = 5 + rand(seed++) * 15, w = 7 + rand(seed++) * 2.5, d = 7 + rand(seed++) * 2.5;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), blockMat);
    b.position.set(x, h / 2, z); b.castShadow = true; b.receiveShadow = true; scene.add(b);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h });
  }

  // Plaza greenery: low-poly trees and benches as landmarks for the first walking test.
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x72523a });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x416b49, roughness: 1 });
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, r = 7.4 + (i % 3) * 1.1;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18, .25, 2.1, 7), trunkMat);
    trunk.position.set(x, 1.05, z); trunk.castShadow = true; scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 1), leafMat);
    crown.position.set(x, 2.8, z); crown.castShadow = true; scene.add(crown);
  }
  const benchMat = new THREE.MeshStandardMaterial({ color: 0x6d5540 });
  for (let i = 0; i < 4; i++) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(2.1, .18, .55), benchMat);
    const a = i * Math.PI / 2; bench.position.set(Math.cos(a) * 4.4, .55, Math.sin(a) * 4.4);
    bench.rotation.y = -a; scene.add(bench);
  }
  return colliders;
}
