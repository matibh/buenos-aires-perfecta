import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type GeoFeature = {
  type: 'building' | 'road' | 'green' | 'tree';
  polygons?: number[][][];
  line?: number[][];
  point?: number[];
  height?: number;
  heightSource?: string;
  width?: number;
  highway?: string;
  name?: string;
};
export type ObeliscoWorldData = { origin: { lon: number; lat: number }; features: GeoFeature[]; counts: Record<string, number> };
export type WorldCollider = { minX: number; maxX: number; minZ: number; maxZ: number; height: number };

const ROAD = new THREE.MeshStandardMaterial({ color: 0x353b3d, roughness: .98, side: THREE.DoubleSide });
const GREEN = new THREE.MeshStandardMaterial({ color: 0x6e9168, roughness: 1, side: THREE.DoubleSide });
const BUILDING_COLORS = [0xc9c1b5,0xd4cabb,0xbeb6a8,0xd7d0c3,0xb9b1a5,0xc8b9a6,0xd9d4ca];
const WHITE = new THREE.MeshStandardMaterial({ color: 0xe9e8df, roughness: .88 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x3b3c3b, roughness: .7 });

function local(lon: number, lat: number, origin: {lon:number;lat:number}) {
  const cos = Math.cos(origin.lat * Math.PI / 180);
  return { x: (lon-origin.lon)*111320*cos, z: -(lat-origin.lat)*111320 };
}
function polygonMesh(ring: number[][], origin: {lon:number;lat:number}, y: number, material: THREE.Material) {
  const shape = new THREE.Shape();
  ring.forEach(([lon,lat],i) => { const p=local(lon,lat,origin); if(i===0) shape.moveTo(p.x,-p.z); else shape.lineTo(p.x,-p.z); });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI/2);
  const mesh = new THREE.Mesh(geometry,material); mesh.position.y=y; mesh.receiveShadow=true; return mesh;
}
function buildingGeometry(ring: number[][], origin: {lon:number;lat:number}, height: number) {
  const shape = new THREE.Shape();
  ring.forEach(([lon,lat],i) => { const p=local(lon,lat,origin); if(i===0) shape.moveTo(p.x,-p.z); else shape.lineTo(p.x,-p.z); });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,curveSegments:1});
  geometry.rotateX(-Math.PI/2);
  return geometry;
}
function roadGeometry(points: number[][], width: number, origin: {lon:number;lat:number}) {
  const vertices: number[]=[]; const indices: number[]=[];
  const coords=points.map(([lon,lat])=>local(lon,lat,origin));
  for(let i=0;i<coords.length-1;i++){
    const a=coords[i],b=coords[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
    const ox=-dz/len*width/2,oz=dx/len*width/2,base=vertices.length/3;
    vertices.push(a.x+ox,.035,a.z+oz,a.x-ox,.035,a.z-oz,b.x+ox,.035,b.z+oz,b.x-ox,.035,b.z-oz);
    indices.push(base,base+2,base+1,base+1,base+2,base+3);
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); g.setIndex(indices); g.computeVertexNormals();
  return g;
}

export function createObeliscoWorld(group: THREE.Group, data: ObeliscoWorldData): WorldCollider[] {
  const colliders: WorldCollider[]=[];
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,1900),new THREE.MeshStandardMaterial({color:0xaaa99f,roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-.03; group.add(ground);

  // Real OSM road alignments, building footprints and mapped green spaces.
  for(const f of data.features){
    if(f.type==='road' && f.line && f.line.length>1) group.add(roadStrip(f.line,f.width??9,data.origin));
    if(f.type==='green' && f.polygons) for(const poly of f.polygons) if(poly.length>=4) group.add(polygonMesh(poly,data.origin,.075,GREEN));
  }
  let buildingIndex=0;
  for(const f of data.features){
    if(f.type!=='building'||!f.polygons) continue;
    const height=Math.max(3,Math.min(f.height??9.5,150));
    const materialIndex=buildingIndex++%BUILDING_COLORS.length;
    for(const ring of f.polygons){
      if(ring.length<4) continue;
      buildings[materialIndex].push(buildingGeometry(ring,data.origin,height));
      const pts=ring.map(([lon,lat])=>local(lon,lat,data.origin));
      const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z);
      colliders.push({minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs),height});
    }
  }

  buildings.forEach((geometries,index)=>{if(!geometries.length)return;const merged=mergeGeometries(geometries,false);if(merged){const mesh=new THREE.Mesh(merged,buildingMaterials[index]);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}geometries.forEach(g=>g.dispose());});\n\n  // The monument is modeled to its published 67.5 m height and 6.8 m square base.
  const plaza=new THREE.Mesh(new THREE.CircleGeometry(18,64),new THREE.MeshStandardMaterial({color:0x858d82,roughness:1}));
  plaza.rotation.x=-Math.PI/2; plaza.position.y=.09; group.add(plaza);
  const obelisk=new THREE.Mesh(new THREE.CylinderGeometry(.2,4.81,67.5,4,1,false),WHITE);
  obelisk.rotation.y=Math.PI/4; obelisk.position.set(0,33.75,0); obelisk.castShadow=true; obelisk.receiveShadow=true; group.add(obelisk);
  const plinth=new THREE.Mesh(new THREE.BoxGeometry(7.8,.48,7.8),WHITE); plinth.position.y=.28; group.add(plinth);
  const door=new THREE.Mesh(new THREE.BoxGeometry(.95,2.15,.06),DARK); door.position.set(-3.42,1.35,0); group.add(door);
  // Fine horizontal joints evoke the painted concrete panels without over-detailing the landmark.
  for(let y=8;y<64;y+=8){
    const band=new THREE.Mesh(new THREE.BoxGeometry(6.8-y*.082,.035,6.8-y*.082),new THREE.MeshStandardMaterial({color:0xd8d8d0,roughness:1}));
    band.position.y=y; group.add(band);
  }

  // Mapped OSM trees are small, shared low-poly props.
  const trunkGeo=new THREE.CylinderGeometry(.13,.18,2,6), crownGeo=new THREE.IcosahedronGeometry(1.05,1);
  const trunkMat=new THREE.MeshStandardMaterial({color:0x6d5039}), crownMat=new THREE.MeshStandardMaterial({color:0x426a49});
  const trees=data.features.filter(f=>f.type==='tree'&&f.point);
  const trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,trees.length), crowns=new THREE.InstancedMesh(crownGeo,crownMat,trees.length);
  const dummy=new THREE.Object3D();
  trees.forEach((f,i)=>{const p=local(f.point![0],f.point![1],data.origin);dummy.position.set(p.x,1,p.z);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);dummy.position.y=2.45;dummy.scale.setScalar(.9);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);dummy.scale.setScalar(1);});
  if(trees.length){group.add(trunks,crowns);}
  return colliders;
}
