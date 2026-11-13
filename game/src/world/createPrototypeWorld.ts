import * as THREE from 'three';

/** Schematic placeholder blockout. Not surveyed geometry; replace with validated CABA/OSM data. */
export function createPrototypeWorld(scene: THREE.Scene): void {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120,100), new THREE.MeshStandardMaterial({color:0x9eaa91}));
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
  const roadMat=new THREE.MeshStandardMaterial({color:0x444a4d});
  const blockMat=new THREE.MeshStandardMaterial({color:0xc9bda8,roughness:0.92});
  const parkMat=new THREE.MeshStandardMaterial({color:0x77956d});
  for(let x=-48;x<=48;x+=24){const road=new THREE.Mesh(new THREE.BoxGeometry(7,.08,100),roadMat);road.position.set(x,.05,0);scene.add(road);}
  for(let z=-40;z<=40;z+=24){const road=new THREE.Mesh(new THREE.BoxGeometry(120,.08,7),roadMat);road.position.set(0,.05,z);scene.add(road);}
  const park=new THREE.Mesh(new THREE.CircleGeometry(11,48),parkMat);park.rotation.x=-Math.PI/2;park.position.y=.12;scene.add(park);
  const rand=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
  let seed=1;
  for(let z=-38;z<=38;z+=12)for(let x=-42;x<=42;x+=12){
    if(Math.abs(x)<15&&Math.abs(z)<15)continue;
    const h=5+rand(seed++)*15,w=7+rand(seed++)*2.5,d=7+rand(seed++)*2.5;
    const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),blockMat);b.position.set(x,h/2,z);b.castShadow=true;b.receiveShadow=true;scene.add(b);
  }
}