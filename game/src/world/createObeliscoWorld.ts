import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type GeoFeature = {
  type: 'building' | 'road' | 'green' | 'plaza' | 'tree' | 'business' | 'facadePhoto';
  polygons?: number[][][];
  line?: number[][];
  point?: number[];
  height?: number;
  heightSource?: string;
  buildingType?: string;
  buildingUse?: string;
  levels?: string;
  flats?: string;
  facadeMaterial?: string;
  facadeColour?: string;
  architecture?: string;
  roofShape?: string;
  roofMaterial?: string;
  roofColour?: string;
  width?: number;
  highway?: string;
  name?: string;
  category?: string;
  kind?: string;
  brand?: string;
  operator?: string;
  cuisine?: string;
  openingHours?: string;
  address?: string;
  website?: string;
  isPizzeria?: boolean;
  image?: string;
  photoDate?: string;
  smp?: string;
};
export type ObeliscoWorldData = { origin: { lon: number; lat: number }; features: GeoFeature[]; counts: Record<string, number> };
export type WorldCollider = { minX: number; maxX: number; minZ: number; maxZ: number; height: number };

const ROAD = new THREE.MeshStandardMaterial({ color: 0x292d2f, roughness: .96, side: THREE.DoubleSide });
const SIDEWALK = new THREE.MeshStandardMaterial({ color: 0xaaa69d, roughness: 1, side: THREE.DoubleSide });
const GREEN = new THREE.MeshStandardMaterial({ color: 0x526d4d, roughness: 1, side: THREE.DoubleSide });
const PLAZA = new THREE.MeshStandardMaterial({ color: 0x8d8b84, roughness: 1, side: THREE.DoubleSide });
const BUILDING_COLORS = [0xb9b3a9,0xc9c0b4,0xa9a49c,0xd0c7b9,0xaaa69e,0xbeb5a7,0xd7d0c5,0x9f9d98,0xc3b8a8,0xb1aaa0,0xd9d1c4,0xaaaeb0,0xc5c2bb,0x968f86,0x986b55,0xb6a184,0xe0d2b8,0x777c7c];
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
function roadGeometry(points: number[][], width: number, origin: {lon:number;lat:number}, y = .055) {
  const vertices: number[]=[]; const indices: number[]=[];
  const coords=points.map(([lon,lat])=>local(lon,lat,origin));
  for(let i=0;i<coords.length-1;i++){
    const a=coords[i],b=coords[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;
    const ox=-dz/len*width/2,oz=dx/len*width/2,base=vertices.length/3;
    vertices.push(a.x+ox,y,a.z+oz,a.x-ox,y,a.z-oz,b.x+ox,y,b.z+oz,b.x-ox,y,b.z-oz);
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
  const colliderGrid = new Map<string, WorldCollider[]>();
  const colliderCellSize = 64;
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
  const sidewalks: THREE.BufferGeometry[]=[];
  type InstanceBox = {x:number;y:number;z:number;rotation:number;sx:number;sy:number;sz:number};
  type ChunkBuild = { group: THREE.Group; geometryGroup: THREE.Group; detail: THREE.Group; buildings: THREE.BufferGeometry[][]; windows: InstanceBox[]; frames: InstanceBox[]; storefronts: InstanceBox[]; balconies: InstanceBox[]; balconyRails: InstanceBox[]; rooftopUnits: InstanceBox[]; centerX:number; centerZ:number };
  const chunkBuilds = new Map<string, ChunkBuild>();
  const CHUNK_SIZE = 256;
  const getChunk = (x:number,z:number):ChunkBuild => {
    const cx=Math.floor(x/CHUNK_SIZE), cz=Math.floor(z/CHUNK_SIZE), key=`${cx},${cz}`;
    let chunk=chunkBuilds.get(key);
    if(!chunk){
      const group=new THREE.Group();
      group.name=`render-chunk-${key}`;
      const geometryGroup=new THREE.Group();
      geometryGroup.name='chunk-geometry';
      const detail=new THREE.Group();
      detail.name='chunk-details';
      group.add(geometryGroup,detail);
      chunk={group,geometryGroup,detail,buildings:BUILDING_COLORS.map(()=>[]),windows:[],frames:[],storefronts:[],balconies:[],balconyRails:[],rooftopUnits:[],centerX:(cx+.5)*CHUNK_SIZE,centerZ:(cz+.5)*CHUNK_SIZE};
      group.userData.renderChunk=true;
      group.userData.detailGroup=detail;
      group.userData.centerX=chunk.centerX;
      group.userData.centerZ=chunk.centerZ;
      group.userData.chunkX=cx; group.userData.chunkZ=cz;
      group.userData.geometryGroup=geometryGroup;
      chunkBuilds.set(key,chunk);
    }
    return chunk;
  };
  const colonColumns:Array<{x:number;y:number;z:number}>=[]; 
  const facadeEdges:Array<{a:{x:number;z:number};b:{x:number;z:number};height:number}>=[]; 
  const facadePaletteIndex = (feature: GeoFeature, fallback: number) => {
    const material = (feature.facadeMaterial || '').toLowerCase();
    if (material.includes('brick') || material.includes('ladrillo')) return 14;
    if (material.includes('stone') || material.includes('piedra')) return 15;
    if (material.includes('plaster') || material.includes('stucco') || material.includes('revoque')) return 16;
    if (material.includes('glass') || material.includes('vidrio')) return 17;
    const colour = (feature.facadeColour || '').toLowerCase().replace(/[_-]/g, ' ');
    if (colour.includes('red') || colour.includes('rojo') || colour.includes('terracotta')) return 14;
    if (colour.includes('stone') || colour.includes('beige') || colour.includes('sand')) return 15;
    if (colour.includes('white') || colour.includes('cream') || colour.includes('ivory')) return 16;
    if (colour.includes('grey') || colour.includes('gray') || colour.includes('gris')) return 17;
    return fallback;
  };
  let colonLandmarkBuilt=false,granRexSignBuilt=false;

  for(const f of data.features){
    if(f.type==='road' && f.line && f.line.length>1) {
      const roadWidth=f.width??9;
      if(roadWidth<=24) sidewalks.push(roadGeometry(f.line,roadWidth+5.2,data.origin,.025));
      roads.push(roadGeometry(f.line,roadWidth,data.origin,.065));
    }
    if((f.type==='green'||f.type==='plaza') && f.polygons) for(const poly of f.polygons) if(poly.length>=4) group.add(polygonMesh(poly,data.origin,f.type==='plaza'?.17:.16,f.type==='plaza'?PLAZA:GREEN));
  }
  addMerged(group,sidewalks,SIDEWALK);
  addMerged(group,roads,ROAD);

  // Real mapped footprints; facade openings are instanced to keep thousands of buildings performant.
  let buildingIndex=0;
  for(const f of data.features){
    if(f.type!=='building'||!f.polygons) continue;
    const materialIndex=buildingIndex++%BUILDING_COLORS.length;
    for(const ring of f.polygons){
      if(ring.length<4) continue;
      const height=f.heightSource==='visual fallback estimate' ? visualHeight(ring,data.origin) : Math.max(3,Math.min(f.height??9.5,150));
      const pts=ring.map(([lon,lat])=>local(lon,lat,data.origin));
      const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
      const chunk=getChunk((minX+maxX)/2,(minZ+maxZ)/2);
      const facadeIndex = facadePaletteIndex(f, materialIndex);
      chunk.buildings[facadeIndex].push(buildingGeometry(ring,data.origin,height));
      // Small rooftop plant rooms and HVAC boxes break up flat roof silhouettes.
      if(footprintArea(ring,data.origin)>85) {
        const roofX=(minX+maxX)/2, roofZ=(minZ+maxZ)/2;
        const roofWidth=Math.min(3.2,Math.max(1.1,(maxX-minX)*.18));
        const roofDepth=Math.min(2.4,Math.max(.9,(maxZ-minZ)*.16));
        chunk.rooftopUnits.push({x:roofX,y:height+.48,z:roofZ,rotation:0,sx:roofWidth,sy:.9,sz:roofDepth});
      }
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
      const taggedLevels = Number.parseFloat(f.levels || '');
      const floorCount = Number.isFinite(taggedLevels) && taggedLevels >= 1 && taggedLevels <= 60
        ? Math.round(taggedLevels) : Math.max(1,Math.floor((height-2.8)/3.25));
      const buildingKind = ((f.buildingType || '') + ' ' + (f.buildingUse || '')).toLowerCase();
      const residential = /apartments|residential|dwelling|house|flats/.test(buildingKind);
      for(let edge=0;edge<pts.length-1;edge++){
        const a=pts[edge],b=pts[edge+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
        if (len > 2) facadeEdges.push({a,b,height});
        if(len>=7) {
          const angle=Math.atan2(-dz,dx), nx=Math.sin(angle), nz=Math.cos(angle);
          const wx=(a.x+b.x)/2, wz=(a.z+b.z)/2;
          chunk.storefronts.push({x:wx+nx*.11,y:1.45,z:wz+nz*.11,rotation:angle,sx:Math.min(len*.62,8.5),sy:2.35,sz:.075});
        }
        if(len<5) continue;
        const count=Math.max(1,Math.floor(len/4.8));
        const angle=Math.atan2(-dz,dx);
        const nx=Math.sin(angle),nz=Math.cos(angle);
        for(let floor=0;floor<floorCount;floor++){
          const y=2.45+floor*3.2;
          for(let bay=0;bay<count;bay++){
            const t=(bay+.5)/count,wx=a.x+dx*t,wz=a.z+dz*t;
            const x=wx+nx*.085,z=wz+nz*.085;
            chunk.windows.push({x,y,z,rotation:angle,sx:1.05,sy:1.32,sz:.06});
            chunk.frames.push({x,y,z,rotation:angle,sx:1.19,sy:1.46,sz:.04});
            if(residential && bay % 2 === 0 && len >= 10) {
              chunk.balconies.push({x:wx+nx*.42,y:y-.78,z:wz+nz*.42,rotation:angle,sx:1.72,sy:.12,sz:.62});
              chunk.balconyRails.push({x:wx+nx*.72,y:y-.38,z:wz+nz*.72,rotation:angle,sx:1.68,sy:.58,sz:.045});
            }
          }
        }
      }
    }
  }
  for (const chunk of chunkBuilds.values()) {
    chunk.buildings.forEach((geometries,index)=>addMerged(chunk.geometryGroup,geometries,BUILDING_MATERIALS[index],true));
    addInstancedBoxes(chunk.detail,new THREE.BoxGeometry(1,1,1),WINDOW_FRAME,chunk.frames);
    addInstancedBoxes(chunk.detail,new THREE.BoxGeometry(1,1,1),GLASS,chunk.windows);
    addInstancedBoxes(chunk.detail,new THREE.BoxGeometry(1,1,1),GLASS,chunk.storefronts);
    addInstancedBoxes(chunk.detail,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0xaaa49a,roughness:.94}),chunk.balconies);
    addInstancedBoxes(chunk.detail,new THREE.BoxGeometry(1,1,1),DARK,chunk.balconyRails);
    addInstancedBoxes(chunk.geometryGroup,new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x77766f,roughness:.9}),chunk.rooftopUnits);
    group.add(chunk.group);
  }
  addInstancedCylinders(group,new THREE.CylinderGeometry(.34,.43,5.8,8),new THREE.MeshStandardMaterial({color:0xd0c5b2,roughness:.9}),colonColumns);


  // Real OSM business names become a shared-atlas signage layer.
  // One merged sign mesh + instanced awnings keeps storefront detail inexpensive.
  const signFeatures = data.features
    .filter(feature => feature.type === 'business' && feature.point && (feature.brand?.trim() || feature.name?.trim()))
    .sort((a,b) => Number(b.isPizzeria === true) - Number(a.isPizzeria === true))
    .slice(0,256);
  const atlas = document.createElement('canvas');
  atlas.width = 1024; atlas.height = 4096;
  const atlasCtx = atlas.getContext('2d');
  const signGeometries: THREE.BufferGeometry[] = [];
  const awnings: InstanceBox[] = [];
  const awningDark: InstanceBox[] = [];
  const signCellW = 256, signCellH = 64, signColumns = 4;
  const awningGeometry = new THREE.BoxGeometry(1,1,1);
  for (let index=0; index<signFeatures.length; index++) {
    const feature = signFeatures[index];
    const coordinates = feature.point;
    const venueName = (feature.brand?.trim() || feature.name?.trim() || '').slice(0,42);
    if (!coordinates || !venueName) continue;
    const point = local(coordinates[0], coordinates[1], data.origin);
    let best: {distance:number;x:number;z:number;angle:number;height:number;length:number} | null = null;
    for (const edge of facadeEdges) {
      const dx = edge.b.x-edge.a.x, dz=edge.b.z-edge.a.z;
      const lengthSq = dx*dx+dz*dz;
      if (lengthSq < 0.01) continue;
      const length = Math.sqrt(lengthSq);
      const t = THREE.MathUtils.clamp(((point.x-edge.a.x)*dx+(point.z-edge.a.z)*dz)/lengthSq,0,1);
      const x=edge.a.x+t*dx, z=edge.a.z+t*dz;
      const distance=Math.hypot(point.x-x,point.z-z);
      if (!best || distance<best.distance) best={distance,x,z,angle:-Math.atan2(dz,dx),height:edge.height,length};
    }
    if (!best || best.distance>15 || best.length<3.2 || !atlasCtx) continue;
    const col=index%signColumns, row=Math.floor(index/signColumns);
    const sx=col*signCellW, sy=row*signCellH;
    const pizza=feature.isPizzeria===true;
    const category=(feature.category||'').toLowerCase();
    const palette = pizza ? ['#9b2e25','#fff2d7'] :
      category==='shop' ? ['#263c48','#f5e9d5'] :
      category==='amenity' ? ['#294a3b','#f3ead8'] : ['#343333','#f2eee5'];
    atlasCtx.fillStyle='#191919'; atlasCtx.fillRect(sx,sy,signCellW,signCellH);
    atlasCtx.fillStyle=palette[0]; atlasCtx.fillRect(sx+3,sy+3,signCellW-6,signCellH-6);
    atlasCtx.fillStyle=palette[1]; atlasCtx.fillRect(sx+5,sy+5,signCellW-10,2);
    atlasCtx.textAlign='center'; atlasCtx.textBaseline='middle';
    let fontSize=27;
    do { atlasCtx.font='bold '+fontSize+'px Arial'; fontSize-=1; }
    while(atlasCtx.measureText(venueName).width>signCellW-18 && fontSize>11);
    atlasCtx.fillStyle='#fff8e9';
    atlasCtx.fillText(venueName,sx+signCellW/2,sy+signCellH/2,signCellW-18);

    const width=THREE.MathUtils.clamp(Math.min(best.length*.78,venueName.length*.105+1.7),2.2,7.4);
    const plane=new THREE.PlaneGeometry(1,1);
    const uv=plane.getAttribute('uv');
    for(let v=0;v<uv.count;v++){
      uv.setXY(v,(sx+uv.getX(v)*signCellW)/atlas.width,1-(sy+(1-uv.getY(v))*signCellH)/atlas.height);
    }
    plane.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(best.x+Math.sin(best.angle)*.20,3.45,best.z+Math.cos(best.angle)*.20),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0,best.angle,0)),
      new THREE.Vector3(width,.78,1)
    ));
    signGeometries.push(plane);
    const awningItem={x:best.x+Math.sin(best.angle)*.48,y:2.72,z:best.z+Math.cos(best.angle)*.48,rotation:best.angle,sx:width,sy:.32,sz:.82};
    (pizza || category==='amenity' ? awningDark : awnings).push(awningItem);
  }
  if(signGeometries.length && atlasCtx){
    const mergedSigns=mergeGeometries(signGeometries,false);
    if(mergedSigns){
      const signTexture=new THREE.CanvasTexture(atlas);
      signTexture.colorSpace=THREE.SRGBColorSpace;
      signTexture.anisotropy=4;
      const signMaterial=new THREE.MeshBasicMaterial({map:signTexture,side:THREE.DoubleSide});
      const signs=new THREE.Mesh(mergedSigns,signMaterial);
      signs.name='mapped-business-signs';
      group.add(signs);
    }
    signGeometries.forEach(geometry=>geometry.dispose());
  }
  const awningCanvas=document.createElement('canvas');
  awningCanvas.width=128; awningCanvas.height=64;
  const awningCtx=awningCanvas.getContext('2d');
  if(awningCtx){
    awningCtx.fillStyle='#eee5d4'; awningCtx.fillRect(0,0,128,64);
    for(let x=0;x<128;x+=32){awningCtx.fillStyle='#b33b30';awningCtx.fillRect(x,0,16,64);}
  }
  const awningTexture=new THREE.CanvasTexture(awningCanvas);
  awningTexture.colorSpace=THREE.SRGBColorSpace;
  const stripedAwning=new THREE.MeshStandardMaterial({map:awningTexture,roughness:.9});
  const plainAwning=new THREE.MeshStandardMaterial({color:0x334b50,roughness:.9});
  addInstancedBoxes(group,awningGeometry,stripedAwning,awningDark);
  addInstancedBoxes(group,awningGeometry,plainAwning,awnings);


  // USIG facade photos are packed into one atlas and one mesh to preserve high FPS.
  const facadePhotoFeatures=data.features.filter(feature=>feature.type==='facadePhoto'&&feature.image&&feature.line&&feature.line.length>=2);
  if(facadePhotoFeatures.length){
    void (async()=>{
    const loadedPhotos=await Promise.all(facadePhotoFeatures.map(feature=>new Promise<{feature:GeoFeature;image:HTMLImageElement}|null>(resolve=>{
      const image=new Image();
      image.onload=()=>resolve({feature,image});
      image.onerror=()=>resolve(null);
      image.src=import.meta.env.BASE_URL+feature.image;
    })));
    const validPhotos=loadedPhotos.filter((entry):entry is {feature:GeoFeature;image:HTMLImageElement}=>entry!==null);
    if(validPhotos.length){
      const columns=8,cellWidth=256,cellHeight=320,rows=Math.ceil(validPhotos.length/columns);
      const atlas=document.createElement('canvas'); atlas.width=columns*cellWidth; atlas.height=rows*cellHeight;
      const context=atlas.getContext('2d'); const photoGeometries:THREE.BufferGeometry[]=[];
      if(context){
        context.fillStyle='#77736d';context.fillRect(0,0,atlas.width,atlas.height);
        validPhotos.forEach((entry,index)=>{
          const col=index%columns,row=Math.floor(index/columns);
          const scale=Math.min(cellWidth/entry.image.naturalWidth,cellHeight/entry.image.naturalHeight);
          const imageWidth=entry.image.naturalWidth*scale,imageHeight=entry.image.naturalHeight*scale;
          context.drawImage(entry.image,col*cellWidth+(cellWidth-imageWidth)/2,row*cellHeight+(cellHeight-imageHeight)/2,imageWidth,imageHeight);
          const line=entry.feature.line!;
          let longest:{a:{x:number;z:number};b:{x:number;z:number};length:number}|null=null;
          for(let i=0;i<line.length-1;i++){
            const a=local(line[i][0],line[i][1],data.origin),b=local(line[i+1][0],line[i+1][1],data.origin);
            const length=Math.hypot(b.x-a.x,b.z-a.z);
            if(!longest||length>longest.length)longest={a,b,length};
          }
          if(!longest||longest.length<2)return;
          const aspect=entry.image.naturalWidth/entry.image.naturalHeight;
          const facadeHeight=Math.max(3,Math.min(entry.feature.height??9.5,45));
          const planeHeight=Math.min(facadeHeight,longest.length/aspect),planeWidth=planeHeight*aspect;
          const midX=(longest.a.x+longest.b.x)/2,midZ=(longest.a.z+longest.b.z)/2;
          const dx=longest.b.x-longest.a.x,dz=longest.b.z-longest.a.z;
          const nx=-dz/longest.length,nz=dx/longest.length,angle=Math.atan2(-dz,dx);
          const geometry=new THREE.PlaneGeometry(planeWidth,planeHeight),uv=geometry.getAttribute('uv');
          for(let vertex=0;vertex<uv.count;vertex++){
            const u=uv.getX(vertex),v=uv.getY(vertex);
            uv.setXY(vertex,(col+u)/columns,1-(row+(1-v))/rows);
          }
          geometry.rotateY(angle);
          geometry.translate(midX+nx*.22,planeHeight/2,midZ+nz*.22);
          photoGeometries.push(geometry);
        });
        if(photoGeometries.length){
          const mergedPhotos=mergeGeometries(photoGeometries,false);
          if(mergedPhotos){
            const photoTexture=new THREE.CanvasTexture(atlas);photoTexture.colorSpace=THREE.SRGBColorSpace;photoTexture.anisotropy=4;
            const photoMaterial=new THREE.MeshBasicMaterial({map:photoTexture,side:THREE.DoubleSide,toneMapped:false});
            const photoMesh=new THREE.Mesh(mergedPhotos,photoMaterial);photoMesh.name='usig-real-facade-photo-atlas';photoMesh.frustumCulled=true;group.add(photoMesh);
          }
          photoGeometries.forEach(geometry=>geometry.dispose());
        }
      }
    }
    })();
  }

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
  // Only render individually mapped OSM trees. Do not fabricate evenly spaced rows
  // along the 9 de Julio median: their positions must come from geographic data.
  if(treePositions.length){
    const trunkGeo=new THREE.CylinderGeometry(.16,.23,3.2,7),crownGeo=new THREE.IcosahedronGeometry(1.75,2);
    const trunkMat=new THREE.MeshStandardMaterial({color:0x594333,roughness:1}),crownMat=new THREE.MeshStandardMaterial({color:0x365b3d,roughness:1});
    const trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,treePositions.length),crowns=new THREE.InstancedMesh(crownGeo,crownMat,treePositions.length);
    const dummy=new THREE.Object3D();
    treePositions.forEach((p,i)=>{
      const scale=.78+((i*37)%11)/25;
      dummy.position.set(p.x,1.6,p.z);dummy.scale.setScalar(scale);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
      dummy.position.y=3.7;dummy.scale.set(scale,scale*1.12,scale);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate=true;crowns.instanceMatrix.needsUpdate=true;group.add(trunks,crowns);
  }
  return colliders;
}
