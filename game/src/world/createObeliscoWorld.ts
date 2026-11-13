import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type GeoFeature = {
  type: 'building' | 'road' | 'green' | 'plaza' | 'tree';
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

const ROAD = new THREE.MeshStandardMaterial({ color: 0x303638, roughness: .98, side: THREE.DoubleSide });
const GREEN = new THREE.MeshStandardMaterial({ color: 0x66845c, roughness: 1, side: THREE.DoubleSide });
const PLAZA = new THREE.MeshStandardMaterial({ color: 0x999991, roughness: 1, side: THREE.DoubleSide });
const BUILDING_COLORS = [0xc9c0b3,0xd8d0c4,0xbcb5aa,0xd5c8b6,0xb5b1aa,0xc6b69f,0xded8cd];
const BUILDING_MATERIALS = BUILDING_COLORS.map(color => new THREE.MeshStandardMaterial({ color, roughness: .94 }));
const WHITE = new THREE.MeshStandardMaterial({ color: 0xe8e7df, roughness: .9 });
const DARK = new THREE.MeshStandardMaterial({ color: 0x252c30, roughness: .35, metalness: .12 });
const GLASS = new THREE.MeshStandardMaterial({ color: 0x40545b, roughness: .32, metalness: .18 });
const WINDOW_FRAME = new THREE.MeshStandardMaterial({ color: 0xe5ded1, roughness: .86 });

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
    vertices.push(a.x+ox,.055,a.z+oz,a.x-ox,.055,a.z-oz,b.x+ox,.055,b.z+oz,b.x-ox,.055,b.z-oz);
    indices.push(base,base+2,base+1,base+1,base+2,base+3);
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); g.setIndex(indices); g.computeVertexNormals();
  return g;
}
function addMerged(group: THREE.Group, geometries: THREE.BufferGeometry[], material: THREE.Material, shadows = false) {
  if (!geometries.length) return;
  const merged = mergeGeometries(geometries, false);
  if (merged) {
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = shadows; mesh.receiveShadow = true; group.add(mesh);
  }
  geometries.forEach(g => g.dispose());
}
function addInstancedBoxes(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, items: Array<{x:number;y:number;z:number;rotation?:number;sx?:number;sy?:number;sz?:number}>) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  items.forEach((item,index) => {
    dummy.position.set(item.x,item.y,item.z);
    dummy.rotation.set(0,item.rotation ?? 0,0);
    dummy.scale.set(item.sx ?? 1,item.sy ?? 1,item.sz ?? 1);
    dummy.updateMatrix(); mesh.setMatrixAt(index,dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate=true; mesh.castShadow=false; mesh.receiveShadow=true; group.add(mesh);
}
function addInstancedCylinders(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, items: Array<{x:number;y:number;z:number}>) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const dummy = new THREE.Object3D();
  items.forEach((item,index) => {
    dummy.position.set(item.x,item.y,item.z);
    dummy.updateMatrix(); mesh.setMatrixAt(index,dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate=true; mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh);
}
function footprintArea(ring: number[][], origin: {lon:number;lat:number}) {
  const pts=ring.map(([lon,lat])=>local(lon,lat,origin));
  let area=0;
  for(let i=0;i<pts.length-1;i++) area+=pts[i].x*pts[i+1].z-pts[i+1].x*pts[i].z;
  return Math.abs(area/2);
}
function visualHeight(ring:number[][],origin:{lon:number;lat:number}) {
  const area=footprintArea(ring,origin);
  if(area>1100) return 39;
  if(area>650) return 31;
  if(area>350) return 24;
  if(area>180) return 18;
  if(area>90) return 13;
  return 9.5;
}

export function createObeliscoWorld(group: THREE.Group, data: ObeliscoWorldData): WorldCollider[] {
  const colliders: WorldCollider[]=[];
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,1900),new THREE.MeshStandardMaterial({color:0xb6b3a9,roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-.04; ground.receiveShadow=true; group.add(ground);

  // The monumental 9 de Julio corridor and Corrientes crossing establish the real urban scale.
  const avenue9 = new THREE.Mesh(new THREE.BoxGeometry(128,.07,1500),ROAD);
  avenue9.position.set(0,.005,0); avenue9.receiveShadow=true; group.add(avenue9);
  const corrientes = new THREE.Mesh(new THREE.BoxGeometry(1650,.075,32),ROAD);
  corrientes.position.set(0,.012,0); corrientes.receiveShadow=true; group.add(corrientes);
  const medianMaterial=new THREE.MeshStandardMaterial({color:0x718768,roughness:1});
  for(const x of [-35,35]){
    const median=new THREE.Mesh(new THREE.BoxGeometry(5.5,.13,1420),medianMaterial);
    median.position.set(x,.07,0); median.receiveShadow=true; group.add(median);
  }

  const roads: THREE.BufferGeometry[]=[];
  const buildings: THREE.BufferGeometry[][]=BUILDING_COLORS.map(()=>[]);
  const windowItems:Array<{x:number;y:number;z:number;rotation:number;sx:number;sy:number;sz:number}>=[];
  const frameItems:Array<{x:number;y:number;z:number;rotation:number;sx:number;sy:number;sz:number}>=[];
  const colonColumns:Array<{x:number;y:number;z:number}>=[];
  let colonLandmarkBuilt=false,granRexSignBuilt=false;

  for(const f of data.features){
    if(f.type==='road' && f.line && f.line.length>1) roads.push(roadGeometry(f.line,f.width??9,data.origin));
    if((f.type==='green'||f.type==='plaza') && f.polygons) for(const poly of f.polygons) if(poly.length>=4) group.add(polygonMesh(poly,data.origin,f.type==='plaza'?.17:.16,f.type==='plaza'?PLAZA:GREEN));
  }
  addMerged(group,roads,ROAD);

  // Real mapped footprints; facade openings are instanced to keep thousands of buildings performant.
  let buildingIndex=0;
  for(const f of data.features){
    if(f.type!=='building'||!f.polygons) continue;
    const materialIndex=buildingIndex++%BUILDING_COLORS.length;
    for(const ring of f.polygons){
      if(ring.length<4) continue;
      const height=f.heightSource==='visual fallback estimate' ? visualHeight(ring,data.origin) : Math.max(3,Math.min(f.height??9.5,150));
      buildings[materialIndex].push(buildingGeometry(ring,data.origin,height));
      const pts=ring.map(([lon,lat])=>local(lon,lat,data.origin));
      const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
      colliders.push({minX,maxX,minZ,maxZ,height});

      const landmark=(f.name||'').toLowerCase();
      const mappedArea=footprintArea(ring,data.origin);
      if(landmark.includes('teatro col') && !colonLandmarkBuilt && mappedArea>1000) {
        colonLandmarkBuilt=true;
        // The Colón keeps its mapped footprint, with a recognizable historic roof and street colonnade.
        const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
        const roofBase=new THREE.Mesh(new THREE.CylinderGeometry(9,12,2.2,24),new THREE.MeshStandardMaterial({color:0xb8aa92,roughness:.9}));
        roofBase.position.set(cx,height+1.1,cz); roofBase.castShadow=true; group.add(roofBase);
        const dome=new THREE.Mesh(new THREE.SphereGeometry(10,24,14,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0xaaa18f,roughness:.82}));
        dome.position.set(cx,height+2.2,cz); dome.castShadow=true; group.add(dome);
        for(let edge=0;edge<pts.length-1;edge++){
          const a=pts[edge],b=pts[edge+1],len=Math.hypot(b.x-a.x,b.z-a.z);
          if(len<20 || Math.abs(a.z-maxZ)>1.4 || Math.abs(b.z-maxZ)>1.4) continue;
          const count=Math.max(3,Math.floor(len/7));
          for(let i=0;i<count;i++){
            const t=(i+.5)/count;
            colonColumns.push({x:a.x+(b.x-a.x)*t,y:3.0,z:maxZ+.45});
          }
        }
      }
      if(landmark.includes('gran rex') && !granRexSignBuilt && mappedArea>500) {
        granRexSignBuilt=true;
        // A legible marquee marks the real Gran Rex frontage facing Corrientes.
        const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=96;
        const ctx=canvas.getContext('2d');
        if(ctx){
          ctx.fillStyle='#17191a';ctx.fillRect(0,0,512,96);
          ctx.fillStyle='#f5e8c8';ctx.font='bold 64px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('GRAN REX',256,49);
        }
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
        const sign=new THREE.Mesh(new THREE.PlaneGeometry(13,2.45),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
        sign.position.set((minX+maxX)/2,Math.min(height-2.5,9),maxZ+.18);group.add(sign);
      }

      // Repeated window bays, aligned to each actual footprint edge.
      const floorCount=Math.max(1,Math.floor((height-2.8)/3.25));
      for(let edge=0;edge<pts.length-1;edge++){
        const a=pts[edge],b=pts[edge+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
        if(len<5) continue;
        const count=Math.max(1,Math.floor(len/3.4));
        const angle=Math.atan2(-dz,dx);
        const nx=Math.sin(angle),nz=Math.cos(angle);
        for(let floor=0;floor<floorCount;floor++){
          const y=2.45+floor*3.2;
          for(let bay=0;bay<count;bay++){
            const t=(bay+.5)/count,wx=a.x+dx*t,wz=a.z+dz*t;
            for(const side of [-1,1]){
              const x=wx+nx*side*.085,z=wz+nz*side*.085;
              windowItems.push({x,y,z,rotation:angle,sx:1.18,sy:1.48,sz:.07});
              frameItems.push({x,y,z:z,rotation:angle,sx:1.34,sy:1.64,sz:.045});
            }
          }
        }
      }
    }
  }
  buildings.forEach((geometries,index)=>addMerged(group,geometries,BUILDING_MATERIALS[index],true));
  addInstancedBoxes(group,new THREE.BoxGeometry(1,1,1),WINDOW_FRAME,frameItems);
  addInstancedBoxes(group,new THREE.BoxGeometry(1,1,1),GLASS,windowItems);
  addInstancedCylinders(group,new THREE.CylinderGeometry(.34,.43,5.8,8),new THREE.MeshStandardMaterial({color:0xd0c5b2,roughness:.9}),colonColumns);

  // Boulevard lane dashes and pedestrian crossings: the width of 9 de Julio must read at street level.
  const laneDashes:Array<{x:number;y:number;z:number;sx:number;sy:number;sz:number}>=[];
  for(const x of [-58,-48,-25,-16,16,25,48,58]) for(let z=-710;z<710;z+=22)
    laneDashes.push({x,y:.105,z,sx:.16,sy:.025,sz:8});
  const whitePaint=new THREE.MeshStandardMaterial({color:0xe8e7df,roughness:1});
  addInstancedBoxes(group,new THREE.BoxGeometry(1,1,1),whitePaint,laneDashes);
  const crosswalks:Array<{x:number;y:number;z:number;sx:number;sy:number;sz:number}>=[];
  for(const z of [-18,18]) for(let x=-48;x<=48;x+=3.2) crosswalks.push({x,y:.12,z,sx:2.25,sy:.035,sz:1.15});
  for(const x of [-17,17]) for(let z=-15;z<=15;z+=3.2) crosswalks.push({x,y:.125,z,sx:1.15,sy:.035,sz:2.25});
  addInstancedBoxes(group,new THREE.BoxGeometry(1,1,1),whitePaint,crosswalks);

  // A square tapered shaft with a distinct pyramidal crown, not a cone/pyramid from ground to tip.
  // Plaza de la República is rendered from the official CABA polygon above.
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(3.65,4.81,59.5,4,1,false),WHITE);
  shaft.rotation.y=Math.PI/4; shaft.position.set(0,29.75,0); shaft.castShadow=true; shaft.receiveShadow=true; group.add(shaft);
  const crown=new THREE.Mesh(new THREE.CylinderGeometry(0,3.65,8,4,1,false),WHITE);
  crown.rotation.y=Math.PI/4; crown.position.set(0,63.5,0); crown.castShadow=true; crown.receiveShadow=true; group.add(crown);
  const plinth=new THREE.Mesh(new THREE.BoxGeometry(7.8,.48,7.8),WHITE);
  plinth.position.y=.3; group.add(plinth);
  for(let y=7;y<58;y+=7){
    const side=6.8-(6.8-5.16)*(y/59.5);
    const band=new THREE.Mesh(new THREE.BoxGeometry(side,.035,side),new THREE.MeshStandardMaterial({color:0xd8d8d0,roughness:1}));
    band.position.y=y; group.add(band);
  }
  // The only entrance faces west, toward Corrientes; four small openings sit near the crown.
  const door=new THREE.Mesh(new THREE.BoxGeometry(.95,2.15,.07),DARK);
  door.position.set(-3.43,1.38,0); door.rotation.y=Math.PI/2; group.add(door);
  const topWindows:Array<{x:number;y:number;z:number;rotation:number;sx:number;sy:number;sz:number}>=[];
  for(const side of [-1,1]){
    topWindows.push({x:side*.76,y:65.1,z:0,rotation:Math.PI/2,sx:.34,sy:.68,sz:.055});
    topWindows.push({x:0,y:65.1,z:side*.76,rotation:0,sx:.34,sy:.68,sz:.055});
  }
  addInstancedBoxes(group,new THREE.BoxGeometry(1,1,1),DARK,topWindows);
  colliders.push({minX:-3.4,maxX:3.4,minZ:-3.4,maxZ:3.4,height:67.5});

  // Trees from OSM plus boulevard rows; instancing keeps the central avenues light.
  const treePositions:Array<{x:number;y:number;z:number}>=[];
  for(const f of data.features) if(f.type==='tree'&&f.point){
    const p=local(f.point[0],f.point[1],data.origin); treePositions.push({x:p.x,y:0,z:p.z});
  }
  for(const x of [-35,35]) for(let z=-600;z<=600;z+=34) treePositions.push({x,y:0,z});
  if(treePositions.length){
    const trunkGeo=new THREE.CylinderGeometry(.13,.18,2.1,6),crownGeo=new THREE.IcosahedronGeometry(1.1,1);
    const trunkMat=new THREE.MeshStandardMaterial({color:0x6d5039}),crownMat=new THREE.MeshStandardMaterial({color:0x426a49});
    const trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,treePositions.length),crowns=new THREE.InstancedMesh(crownGeo,crownMat,treePositions.length);
    const dummy=new THREE.Object3D();
    treePositions.forEach((p,i)=>{
      dummy.position.set(p.x,1.05,p.z);dummy.scale.setScalar(1);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
      dummy.position.y=2.65;dummy.scale.setScalar(1);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate=true;crowns.instanceMatrix.needsUpdate=true;group.add(trunks,crowns);
  }
  return colliders;
}
