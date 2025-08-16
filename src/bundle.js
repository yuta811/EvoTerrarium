
(function(global){
  const THREE=global.THREE;
  function Controls(cam,dom){this.object=cam;this.domElement=dom;this.target=new THREE.Vector3(0,0,0);
    this.maxPolarAngle=Math.PI*0.49;this.minDistance=2;this.maxDistance=150;
    let st=null,sx=0,sy=0,phi=0.9,theta=0.8,rad=45;
    const upd=()=>{const sp=Math.max(0.05,Math.min(this.maxPolarAngle,phi));rad=Math.max(this.minDistance,Math.min(this.maxDistance,rad));
      const x=this.target.x+rad*Math.sin(sp)*Math.sin(theta),y=this.target.y+rad*Math.cos(sp),z=this.target.z+rad*Math.sin(sp)*Math.cos(theta);
      this.object.position.set(x,y,z);this.object.lookAt(this.target);};upd();
    dom.addEventListener('pointerdown',e=>{st=(e.ctrlKey||e.metaKey||e.button===1)?'pan':'orbit';sx=e.clientX;sy=e.clientY;dom.setPointerCapture?.(e.pointerId);});
    dom.addEventListener('pointermove',e=>{if(!st)return;const dx=e.clientX-sx,dy=e.clientY-sy;sx=e.clientX;sy=e.clientY;if(st==='orbit'){theta-=dx*0.005;phi-=dy*0.005;}else{const s=rad*0.0015;const right=new THREE.Vector3().subVectors(this.object.position,this.target).cross(this.object.up).normalize();const up=new THREE.Vector3().copy(this.object.up);this.target.addScaledVector(right,-dx*s);this.target.addScaledVector(up,dy*s);}upd();});
    dom.addEventListener('pointerup',e=>{st=null;dom.releasePointerCapture?.(e.pointerId);});
    dom.addEventListener('wheel',e=>{rad*=(1+Math.sign(e.deltaY)*0.1);upd();},{passive:true});
    let last=0;dom.addEventListener('touchstart',e=>{if(e.touches.length===2){st='pinch';last=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}},{passive:true});
    dom.addEventListener('touchmove',e=>{if(st==='pinch'&&e.touches.length===2){const nd=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);const dd=nd-last;last=nd;rad*=(1-dd*0.002);upd();}},{passive:true});this.update=function(){};}
  function Engine3D(container){if(!THREE)throw new Error('THREE not loaded');this.container=container;
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));this.renderer.setSize(window.innerWidth,window.innerHeight);container.appendChild(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x0c1118);
    const asp=window.innerWidth/window.innerHeight;this.camera=new THREE.PerspectiveCamera(60,asp,0.1,2000);this.camera.position.set(30,36,30);
    this.controls=new Controls(this.camera,this.renderer.domElement);
    const hemi=new THREE.HemisphereLight(0xddeeff,0x223344,0.9);this.scene.add(hemi);const dir=new THREE.DirectionalLight(0xffffff,0.9);dir.position.set(20,40,10);this.scene.add(dir);
    const g=new THREE.PlaneGeometry(60,60,2,2);g.rotateX(-Math.PI/2);const m=new THREE.MeshLambertMaterial({vertexColors:true});this.ground=new THREE.Mesh(g,m);this.scene.add(this.ground);
    this.grid=new THREE.GridHelper(60,60,0x334455,0x334455);this.grid.material.opacity=0.25;this.grid.material.transparent=true;this.grid.position.y=0.02;this.scene.add(this.grid);
    this.water=new THREE.Mesh(new THREE.PlaneGeometry(60,60,1,1),new THREE.MeshBasicMaterial({color:0x325a86,transparent:true,opacity:0.6}));this.water.rotation.x=-Math.PI/2;this.water.position.y=0.0;this.scene.add(this.water);
    this.propsGroup=new THREE.Group();this.scene.add(this.propsGroup);
    this.raycaster=new THREE.Raycaster();this.mouse=new THREE.Vector2();this._pickCb=null;this.renderer.domElement.addEventListener('pointerdown',ev=>this._onPointer(ev));
    this.deviceGroup=new THREE.Group();this.scene.add(this.deviceGroup);
    const ringG=new THREE.RingGeometry(0.3,0.5,32);const ringM=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});this.selector=new THREE.Mesh(ringG,ringM);this.selector.rotation.x=-Math.PI/2;this.selector.visible=false;this.scene.add(this.selector);
    this._THREE=THREE;this._running=false;this.terr={vs:8.0,waterLevel:0};}
  Engine3D.prototype._onPointer=function(ev){const r=this.renderer.domElement.getBoundingClientRect();this.mouse.x=((ev.clientX-r.left)/r.width)*2-1;this.mouse.y=-((ev.clientY-r.top)/r.height)*2+1;this.raycaster.setFromCamera(this.mouse,this.camera);const is=this.raycaster.intersectObject(this.ground,false);if(is.length&&this._pickCb)this._pickCb(is[0].point);};
  Engine3D.prototype.onPick=function(cb){this._pickCb=cb;};
  Engine3D.prototype.updateTerrain=function(world){const tint=new this._THREE.Color().setHSL(0.33-0.15*world.season,0.25,0.55);this.grid.material.color.copy(tint);};
  Engine3D.prototype.updateDevices=function(devs){while(this.deviceGroup.children.length){const c=this.deviceGroup.children.pop();c.geometry.dispose();c.material.dispose();}for(const d of devs){const col=d.type==='heater'?0xff6655:0x66aaff;const geo=new this._THREE.CylinderGeometry(0.3,0.3,0.6,10);const mat=new this._THREE.MeshStandardMaterial({color:col,roughness:0.4});const m=new this._THREE.Mesh(geo,mat);m.position.set(d.x,0.3,d.z);this.deviceGroup.add(m);}};
  Engine3D.prototype.highlightAt=function(p){this.selector.position.set(p.x,0.02,p.z);this.selector.visible=true;};
  Engine3D.prototype.start=function(){if(this._running)return;this._running=true;const loop=()=>{this.controls.update&&this.controls.update();this.renderer.render(this.scene,this.camera);requestAnimationFrame(loop);};requestAnimationFrame(loop);};
  Engine3D.prototype.onResize=function(){const w=window.innerWidth,h=window.innerHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();};
  Engine3D.prototype.rebuildTerrain=function(terr){if(!terr||!terr.size)return;const THREE=this._THREE;const N=terr.size,H=terr.heights,B=terr.biomes;const step=terr.step||0.3,vs=terr.vs||8.0;this.terr.vs=vs;this.terr.waterLevel=terr.waterLevel;
    const geo=new THREE.PlaneGeometry(60,60,N-1,N-1);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position;const colors=new Float32Array(pos.count*3);
    const cols=[0x7fc97f,0x2e7d32,0xe0c36c,0x3b7ea1,0xa8c4d6];const cliff=new THREE.Color(0x1a1f26);
    for(let z=0;z<N;z++){for(let x=0;x<N;x++){const i=z*N+x,vi=i;const y=Math.round(H[i]/step)*step*vs;pos.setY(vi,y);const b=B[i]||0;const c=new THREE.Color(cols[b]);const hx=x<N-1?H[i+1]:H[i],hz=z<N-1?H[i+N]:H[i];const sl=Math.sqrt((hx-H[i])**2+(hz-H[i])**2);c.lerp(cliff,Math.min(0.85,sl*3.0));colors[vi*3]=c.r;colors[vi*3+1]=c.g;colors[vi*3+2]=c.b;}}geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geo.computeVertexNormals();this.ground.geometry.dispose();this.ground.geometry=geo;this.water.position.y=terr.waterLevel*vs+0.05;
    this.propsGroup.clear();const trunkG=new THREE.CylinderGeometry(0.08,0.08,0.9,6),leafG=new THREE.ConeGeometry(0.6,1.2,6),treeM=new THREE.MeshLambertMaterial({color:0x2e7d32}),trunkM=new THREE.MeshLambertMaterial({color:0x8d6e63}),cactusG=new THREE.CylinderGeometry(0.15,0.18,1.2,5),cactusM=new THREE.MeshLambertMaterial({color:0x3f8f6a}),rockG=new THREE.DodecahedronGeometry(0.25,0),rockM=new THREE.MeshLambertMaterial({color:0x8a8a8a}),reedG=new THREE.ConeGeometry(0.06,0.8,5),reedM=new THREE.MeshLambertMaterial({color:0x9ccc65});
    const trunks=new THREE.InstancedMesh(trunkG,trunkM,2000);trunks.count=0;const leaves=new THREE.InstancedMesh(leafG,treeM,2000);leaves.count=0;const cactus=new THREE.InstancedMesh(cactusG,cactusM,1500);cactus.count=0;const rocks=new THREE.InstancedMesh(rockG,rockM,2500);rocks.count=0;const reeds=new THREE.InstancedMesh(reedG,reedM,1500);reeds.count=0;this.propsGroup.add(trunks);this.propsGroup.add(leaves);this.propsGroup.add(cactus);this.propsGroup.add(rocks);this.propsGroup.add(reeds);
    const dummy=new THREE.Object3D();for(const p of terr.props||[]){const y=Math.round(p.y/step)*step*vs;dummy.position.set(p.x,y+(p.type==='tree'?0.45:(p.type==='reed'?0.4:(p.type==='cactus'?0.6:0.2))),p.z);const s=p.s*(p.type==='rock'?0.9:1.0);dummy.scale.set(s,s,s);dummy.updateMatrix();if(p.type==='tree'){const i=trunks.count++;trunks.setMatrixAt(i,dummy.matrix);dummy.position.y=y+1.2;dummy.updateMatrix();const j=leaves.count++;leaves.setMatrixAt(j,dummy.matrix);}else if(p.type==='cactus'){const i=cactus.count++;cactus.setMatrixAt(i,dummy.matrix);}else if(p.type==='rock'){const i=rocks.count++;rocks.setMatrixAt(i,dummy.matrix);}else if(p.type==='reed'){const i=reeds.count++;reeds.setMatrixAt(i,dummy.matrix);}}[trunks,leaves,cactus,rocks,reeds].forEach(m=>{m.instanceMatrix&& (m.instanceMatrix.needsUpdate=true);});};
  function CMesh(cap){
    this.cap=cap;
    this.group=new THREE.Group();
    this.mesh=this.group;
    this._THREE=THREE;
    const mat=new this._THREE.MeshLambertMaterial({vertexColors:true});
    this.material=mat;
    this.body=new this._THREE.InstancedMesh(new this._THREE.BoxGeometry(1,1,1),mat,cap);
    this.head=new this._THREE.InstancedMesh(new this._THREE.BoxGeometry(1,1,1),mat,cap);
    this.tail=new this._THREE.InstancedMesh(new this._THREE.BoxGeometry(1,1,1),mat,cap);
    this.legs=new this._THREE.InstancedMesh(new this._THREE.BoxGeometry(1,1,1),mat,cap*4);
    this.fins=new this._THREE.InstancedMesh(new this._THREE.BoxGeometry(1,0.2,0.5),mat,cap*2);
    this.group.add(this.body);
    this.group.add(this.head);
    this.group.add(this.tail);
    this.group.add(this.legs);
    this.group.add(this.fins);
    this._tmpObj=new this._THREE.Object3D();
    this._color=new this._THREE.Color();
  }
  CMesh.prototype._colorFrom=function(e){
    const warm=e.genes.diet===1;
    const base=warm?0.0:0.55;
    const hue=(base+((e.species*0.61803398875)%0.15))%1;
    return new this._THREE.Color().setHSL(hue,0.85,(e.mode==='swim'?0.65:0.55));
  };
  CMesh.prototype.update=function(list,camera){
    const THREE=this._THREE;
    const CREATURE_SCALE=0.25;
    const tmp=this._tmpObj;
    const col=this._color;
    const proj=new THREE.Matrix4();
    const frustum=new THREE.Frustum();
    camera.updateMatrixWorld();
    proj.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(proj);
    const camPos=camera.position;
    const maxDistSq=100*100;
    let b=0,h=0,tidx=0,l=0,f=0;
    this._time=(this._time||0)+0.1;const time=this._time;
    const v=new THREE.Vector3();
    const q=new THREE.Quaternion();
    const q2=new THREE.Quaternion();
    const v2=new THREE.Vector3();
    for(let idx=0;idx<list.length && b<this.cap;idx++){
      const e=list[idx];
      v.set(e.x,e.y,e.z);
      if(camPos.distanceToSquared(v)>maxDistSq)continue;
      if(!frustum.containsPoint(v))continue;
      const g=e.genes||{};
      const s=(0.35+(g.size||0)*0.9+(e.mode==='swim'?-0.1:0))*CREATURE_SCALE;
      const tiltX=(e.vz||0)*0.06,tiltZ=-(e.vx||0)*0.06;
      q.setFromEuler(new THREE.Euler(tiltX,e.yaw||0,tiltZ));
      const colV=this._colorFrom(e);col.copy(colV);

      // body
      const bodyLen=s*2.0;
      tmp.position.copy(v);
      tmp.quaternion.copy(q);
      tmp.scale.set(s*1.2,s*0.7,bodyLen);
      tmp.updateMatrix();
      this.body.setMatrixAt(b,tmp.matrix);this.body.setColorAt(b,col);

      // head
      const headScale=s*(0.6+(g.social||0)*0.4);
      v2.set(0,0,bodyLen*0.5).applyQuaternion(q).add(v);
      q2.copy(q);
      const sp=Math.sqrt((e.vx||0)**2+(e.vz||0)**2);const amp=Math.min(1,sp*3);const phase=time*(e.mode==='swim'?4:8)+e.id;
      if(e.mode==='swim')q2.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.sin(phase+Math.PI/2)*0.3*amp,0)));
      else q2.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(phase*0.5)*0.2*amp,0,0)));
      tmp.position.copy(v2);tmp.quaternion.copy(q2);tmp.scale.set(headScale,headScale,headScale);tmp.updateMatrix();
      this.head.setMatrixAt(h,tmp.matrix);this.head.setColorAt(h,col);

      // legs
      const legLen=s*(0.7+(g.speed||0));
      const legThick=s*(0.2+(g.climb||0)*0.3);
      const legPos=[[-s*0.4,-legLen/2,bodyLen*0.25],[s*0.4,-legLen/2,bodyLen*0.25],[-s*0.4,-legLen/2,-bodyLen*0.25],[s*0.4,-legLen/2,-bodyLen*0.25]];
      for(let i=0;i<4;i++){
        v2.set(legPos[i][0],legPos[i][1],legPos[i][2]).applyQuaternion(q).add(v);
        q2.copy(q);
        if(e.mode==='swim')q2.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,Math.sin(phase+(i%2===0?0:Math.PI))*0.5*amp)));
        else q2.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(phase+(i%2===0?0:Math.PI))*0.8*amp,0,0)));
        tmp.position.copy(v2);tmp.quaternion.copy(q2);tmp.scale.set(legThick,legLen,legThick);tmp.updateMatrix();
        this.legs.setMatrixAt(l,tmp.matrix);this.legs.setColorAt(l,col);l++;
      }

      // tail
      const tailLen=s*(0.5+(g.swim||0));
      v2.set(0,0,-bodyLen*0.5-tailLen*0.5).applyQuaternion(q).add(v);
      q2.copy(q);
      if(e.mode==='swim')q2.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.sin(phase)*0.8*amp,0)));
      else q2.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.sin(phase)*0.3*amp,0)));
      tmp.position.copy(v2);tmp.quaternion.copy(q2);tmp.scale.set(legThick*0.6,legThick*0.6,tailLen);tmp.updateMatrix();
      this.tail.setMatrixAt(tidx,tmp.matrix);this.tail.setColorAt(tidx,col);

      // fins
      const hasFins=(g.swim||0)>0.5;
      if(hasFins){
        const finScale=s*(0.5+(g.swim||0)*0.5);
        for(let i=0;i<2;i++){
          v2.set(i===0?-s*0.6:s*0.6,0,bodyLen*0.2).applyQuaternion(q).add(v);
          q2.copy(q);
          tmp.position.copy(v2);tmp.quaternion.copy(q2);tmp.scale.set(finScale,finScale*0.2,finScale);tmp.updateMatrix();
          this.fins.setMatrixAt(f,tmp.matrix);this.fins.setColorAt(f,col);f++;
        }
      }
      b++;h++;tidx++;
    }
    this.body.count=b;this.head.count=h;this.tail.count=tidx;this.legs.count=l;this.fins.count=f;
    this.body.instanceMatrix.needsUpdate=true;this.head.instanceMatrix.needsUpdate=true;this.tail.instanceMatrix.needsUpdate=true;this.legs.instanceMatrix.needsUpdate=true;this.fins.instanceMatrix.needsUpdate=true;
    if(this.body.instanceColor){this.body.instanceColor.needsUpdate=true;this.head.instanceColor.needsUpdate=true;this.tail.instanceColor.needsUpdate=true;this.legs.instanceColor.needsUpdate=true;this.fins.instanceColor.needsUpdate=true;}
  };
  CMesh.prototype.dispose=function(){
    this.body.dispose();
    this.head.dispose();
    this.tail.dispose();
    this.legs.dispose();
    this.fins.dispose();
    this.material.dispose();
  };
  const d=(m)=>{const el=document.getElementById('diag');if(el)el.textContent='diag: '+m;console.log('[diag]',m);};
  const container=document.getElementById('app');d('engine constructing');const engine=new Engine3D(container);engine.onResize();
  let cap=parseInt(document.getElementById('cap').value,10);let creatures=new CMesh(cap);engine.scene.add(creatures.mesh);let sim=null;try{sim=new Worker('./src/sim/worker.js');d('worker started');}catch(e){d('worker failed: '+e);}
  const statsEl=document.getElementById('stats');const seasonSpeed=document.getElementById('seasonSpeed');
  const treeCanvas=document.getElementById('tree');const tctx=treeCanvas.getContext('2d');let treeData={nodes:[]};
  function drawTree(){const s=(window.devicePixelRatio||1);treeCanvas.width=window.innerWidth*s;treeCanvas.height=window.innerHeight*s;tctx.setTransform(1,0,0,1,0,0);tctx.clearRect(0,0,treeCanvas.width,treeCanvas.height);tctx.lineWidth=2*s;if(!treeData.nodes.length)return;const maxT=Math.max(...treeData.nodes.map(n=>n.birth));const minT=Math.min(...treeData.nodes.map(n=>n.birth));const G={};treeData.nodes.forEach(n=>{(G[n.parent]||(G[n.parent]=[])).push(n);});function layout(pid,depth,y0){const arr=G[pid]||[];const gap=60*s;let y=y0;for(const n of arr){n._x=(depth+1)*120*s;n._y=y;layout(n.id,depth+1,y);y+=gap;}if(arr.length===0)y=y0+gap;return y;}const root={id:0};root._x=40*s;root._y=40*s;layout(0,0,80*s);tctx.font=`${12*s}px sans-serif`;for(const n of treeData.nodes){const hue=(n.hue||0.35);tctx.fillStyle=`hsl(${Math.floor((hue*360)%360)},70%,60%)`;tctx.beginPath();tctx.arc(n._x,n._y,8*s,0,Math.PI*2);tctx.fill();tctx.fillText(String(n.id),n._x+10*s,n._y-8*s);}for(const n of treeData.nodes){const arr=G[n.parent]||[];for(const ch of arr){tctx.strokeStyle='rgba(255,255,255,0.35)';tctx.beginPath();tctx.moveTo(n._x,n._y);tctx.lineTo(ch._x,ch._y);tctx.stroke();}}}
  function showTree(v){treeCanvas.style.display=v?'block':'none';if(v)drawTree();}
  treeCanvas.addEventListener('click',e=>{const s=(window.devicePixelRatio||1),r=treeCanvas.getBoundingClientRect();const x=(e.clientX-r.left)*s,y=(e.clientY-r.top)*s;for(const n of treeData.nodes){const dx=x-n._x,dy=y-n._y;if(dx*dx+dy*dy<14*14*s){sim&&sim.postMessage({type:'selectSpecies',payload:{species:n.id}});showTree(false);break;}}});
  function applyMap(data){engine.rebuildTerrain(data);}
  if(sim){sim.onmessage=(e)=>{const t=e.data.type,p=e.data.payload;if(t==='state'){creatures.update(p.entities,engine.camera);engine.updateTerrain(p.world);engine.updateDevices(p.devices||[]);statsEl.textContent=`entities: ${p.entities.length} • time: ${p.world.t.toFixed(1)}s • season:${p.world.season.toFixed(2)}`;d('state ok');}else if(t==='map'){applyMap(p);}else if(t==='tree'){treeData=p;showTree(true);}else if(t==='selected'){engine.highlightAt(p);}else if(t==='rpgReady'){d('RPG species selected: '+p.species);}else if(t==='error'){statsEl.textContent='worker error: '+p;d('worker error: '+p);}};sim.postMessage({type:'init',payload:{seed:Date.now(),entityCount:200,simCap:parseInt(document.getElementById('simCap').value,10)}});} 
  engine.start();
  seasonSpeed.addEventListener('input',function(){sim&&sim.postMessage({type:'seasonSpeed',payload:parseFloat(this.value)})});
  document.getElementById('cap').addEventListener('input',function(){const v=parseInt(this.value,10);if(v!==creatures.cap){engine.scene.remove(creatures.mesh);creatures.dispose&&creatures.dispose();creatures=new CMesh(v);engine.scene.add(creatures.mesh);}});
  document.getElementById('simCap').addEventListener('input',function(){const v=parseInt(this.value,10);sim&&sim.postMessage({type:'simCap',payload:v});});
  document.getElementById('regen').addEventListener('click',()=>{const step=parseFloat(document.getElementById('step').value),slope=parseFloat(document.getElementById('slope').value),mount=parseFloat(document.getElementById('mount').value),rivers=document.getElementById('rivers').checked,biomes=[...document.querySelectorAll('.biome:checked')].map(b=>b.value),seed=parseInt(document.getElementById('seed').value,10)||Date.now();sim&&sim.postMessage({type:'regenMap',payload:{seed,size:96,step,slope,mount,rivers,biomes}});});
  document.getElementById('treeBtn').addEventListener('click',()=>{sim&&sim.postMessage({type:'getTree'})});
  let mode='select';document.querySelectorAll('#modes button').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('#modes button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');mode=btn.dataset.mode;}));
  window.addEventListener('resize',()=>{engine.onResize();if(treeCanvas.style.display==='block')drawTree();});
  engine.onPick(function(pos){if(!sim)return;if(mode==='select')sim.postMessage({type:'pickSelect',payload:{x:pos.x,z:pos.z}});else if(mode==='sprinkler')sim.postMessage({type:'placeDevice',payload:{type:'sprinkler',x:pos.x,z:pos.z}});else if(mode==='heater')sim.postMessage({type:'placeDevice',payload:{type:'heater',x:pos.x,z:pos.z}});});
})(window);
