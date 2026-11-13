import * as THREE from 'three';

export type WorldCollider = { minX: number; maxX: number; minZ: number; maxZ: number; height: number };

type InstanceTransform = { position: THREE.Vector3; rotation?: THREE.Euler; scale?: THREE.Vector3 };

/** Schematic playable blockout with procedural Palermo-inspired facades.
 * Geometry is provisional and is not surveyed CABA data. */
export function createPrototypeWorld(scene: THREE.Scene): WorldCollider[] {
  const colliders: WorldCollider[] = [];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(150, 130), new THREE.MeshStandardMaterial({ color: 0x9eaa91 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x42494b, roughness: 0.96 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xb9b5a8, roughness: 1 });
  const parkMat = new THREE.MeshStandardMaterial({ color: 0x78966e, roughness: 1 });
  const park = new THREE.Mesh(new THREE.CircleGeometry(11, 48), parkMat);
  park.rotation.x = -Math.PI / 2; park.position.y = 0.08; scene.add(park);

  // Street grid and sidewalks.
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
  const facadeColors = [0xc8b69c, 0xd5c8b1, 0xb9b0a0, 0xd1c3ad, 0xb9a58e, 0xc9c1b3];
  const windowMat = new THREE.MeshStandardMaterial({ color: 0x334b56, roughness: .28, metalness: .18 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe4d9c5, roughness: .82 });
  const shopGlassMat = new THREE.MeshStandardMaterial({ color: 0x263e45, roughness: .2, metalness: .2 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x493b31, roughness: .72 });
  const balconyMat = new THREE.MeshStandardMaterial({ color: 0x554e45, metalness: .35, roughness: .62 });
  const awningMats = [0x9d5947, 0x647b70, 0xb18a58].map(color => new THREE.MeshStandardMaterial({ color, roughness: .9 }));

  const panesFront: InstanceTransform[] = [], panesSide: InstanceTransform[] = [];
  const framesFront: InstanceTransform[] = [], framesSide: InstanceTransform[] = [];
  const shopWindows: InstanceTransform[] = [], shopDoors: InstanceTransform[] = [];
  const balconyDecks: InstanceTransform[] = [], balconyRails: InstanceTransform[] = [], awnings: InstanceTransform[] = [];

  const addInstances = (geometry: THREE.BufferGeometry, material: THREE.Material, transforms: InstanceTransform[]) => {
    if (!transforms.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    const dummy = new THREE.Object3D();
    transforms.forEach((item, index) => {
      dummy.position.copy(item.position);
      dummy.rotation.copy(item.rotation ?? new THREE.Euler());
      dummy.scale.copy(item.scale ?? new THREE.Vector3(1, 1, 1));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };

  let seed = 1;
  for (let z = -38; z <= 38; z += 12) for (let x = -42; x <= 42; x += 12) {
    if (Math.abs(x) < 15 && Math.abs(z) < 15) continue;
    const h = 5 + rand(seed++) * 15, w = 7 + rand(seed++) * 2.5, d = 7 + rand(seed++) * 2.5;
    const color = facadeColors[Math.floor(rand(seed++) * facadeColors.length)];
    const buildingMat = new THREE.MeshStandardMaterial({ color, roughness: .94 });
    const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
    building.position.set(x, h / 2, z); building.castShadow = true; building.receiveShadow = true; scene.add(building);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h });

    // Street-level shopfronts: broad glazing, a recessed-looking door and occasional awning.
    shopWindows.push({ position: new THREE.Vector3(x - .65, 1.55, z - d / 2 - .055), scale: new THREE.Vector3(Math.min(2.5, w * .48), 1.9, .08) });
    shopDoors.push({ position: new THREE.Vector3(x + w * .29, 1.2, z - d / 2 - .07), scale: new THREE.Vector3(.82, 2.35, .1) });
    if (rand(seed++) > .35) {
      const awningIndex = Math.floor(rand(seed++) * awningMats.length);
      awnings.push({ position: new THREE.Vector3(x - .45, 2.75, z - d / 2 - .38), scale: new THREE.Vector3(2.8, .16, .72) });
      // A small color variation is applied to the shared canopy material below by deterministic building palette.
      void awningIndex;
    }

    // Repeated upper-floor windows on both visible street-facing sides.
    const columns = Math.max(2, Math.floor(w / 2.15));
    const sideColumns = Math.max(2, Math.floor(d / 2.15));
    let floor = 0;
    for (let y = 3.65; y < h - 1.15; y += 3.05, floor++) {
      for (let col = 0; col < columns; col++) {
        const px = x - (columns - 1) * 1.05 + col * 2.1;
        panesFront.push({ position: new THREE.Vector3(px, y, z - d / 2 - .055), scale: new THREE.Vector3(.92, 1.28, .09) });
        framesFront.push({ position: new THREE.Vector3(px, y, z - d / 2 - .09), scale: new THREE.Vector3(1.08, 1.43, .07) });
        if (rand(seed++) > .73 && y < h - 2.2) {
          balconyDecks.push({ position: new THREE.Vector3(px, y - .76, z - d / 2 - .38), scale: new THREE.Vector3(1.55, .12, .68) });
          balconyRails.push({ position: new THREE.Vector3(px, y - .36, z - d / 2 - .68), scale: new THREE.Vector3(1.55, .62, .07) });
        }
      }
      for (let col = 0; col < sideColumns; col++) {
        const pz = z - (sideColumns - 1) * 1.05 + col * 2.1;
        panesSide.push({ position: new THREE.Vector3(x + w / 2 + .055, y, pz), rotation: new THREE.Euler(0, Math.PI / 2, 0), scale: new THREE.Vector3(.92, 1.28, .09) });
        framesSide.push({ position: new THREE.Vector3(x + w / 2 + .09, y, pz), rotation: new THREE.Euler(0, Math.PI / 2, 0), scale: new THREE.Vector3(1.08, 1.43, .07) });
      }
    }
  }

  // Instanced details keep the denser architecture inexpensive to render.
  const windowGeo = new THREE.BoxGeometry(1, 1, 1);
  addInstances(windowGeo, frameMat, framesFront);
  addInstances(windowGeo, frameMat, framesSide);
  addInstances(windowGeo, windowMat, panesFront);
  addInstances(windowGeo, windowMat, panesSide);
  addInstances(new THREE.BoxGeometry(1, 1, 1), shopGlassMat, shopWindows);
  addInstances(new THREE.BoxGeometry(1, 1, 1), doorMat, shopDoors);
  addInstances(new THREE.BoxGeometry(1, 1, 1), balconyMat, balconyDecks);
  addInstances(new THREE.BoxGeometry(1, 1, 1), balconyMat, balconyRails);
  addInstances(new THREE.BoxGeometry(1, 1, 1), awningMats[0], awnings);

  // Plaza greenery and benches.
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
