
// Worker v9 (terrain-following + natural selection + speciation)
let entities=[], devices=[];
let world={t:0,bounds:28,season:0,seasonSpeed:1,simCap:4000,resourceScale:1.0};
let resourceScale=1.0;
const CREATURE_SCALE = 0.25;
// Foraging and resource search tuning constants (provisional)
const FORAGE_NEAR_RES_COEF = 0.5;      // influence of nearby resource scarcity
const FORAGE_ENERGY_DEFICIT_COEF = 0.7; // influence of creature's energy deficit
const RES_GRAD_BASE = 0.9;              // base acceleration from resource gradient
const RES_GRAD_LOW_RES_BOOST = 1.5;     // extra boost when resources are scarce
const RES_LOW_THRESHOLD = 0.3;          // threshold for low resource level
const BASAL_COMFORT_FACTOR = 0.5;
const DEHYDRATION_PENALTY = 0.02;
const EXPLORE_DEFICIT_THRESHOLD = 0.6;  // deficit level where exploration urge spikes

let simSpeed = 1;
let running = true;
let accumulator = 0;
let lastTime = performance.now();
let randState=123456789; function rand(){randState^=randState<<13;randState^=randState>>>17;randState^=randState<<5;return (randState>>>0)/4294967296;}
function clamp01(v){return Math.max(0,Math.min(1,v));} function lerp(a,b,t){return a+(b-a)*t;}
function maxEnergy(size){ return 1.0 + size * 2.0; }
function norm(v,max){return clamp01(v/(max||1));}
// Maximum speed based on genes.speed (baseline 3.0 at speed 0.5)
function maxSpeedFor(e){ return 2.0 + e.genes.speed * 2.0; }
// Map
const VERT=8.0; let map={size:96,heights:new Float32Array(96*96),biomes:new Uint8Array(96*96),resources:new Float32Array(96*96),resMax:new Float32Array(96*96),resRegen:new Float32Array(96*96),smooth:0.3,waterLevel:-0.18};
function noise2d(x,y,seed){function h(n){const s=Math.sin(n*0.0007+seed*1e-6)*43758.5453;return s-Math.floor(s);}const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;function f(t){return t*t*(3-2*t);}const tl=h(xi*157+yi*311),tr=h((xi+1)*157+yi*311),bl=h(xi*157+(yi+1)*311),br=h((xi+1)*157+(yi+1)*311);const u=f(xf),v=f(yf);return lerp(lerp(tl,tr,u),lerp(bl,br,u),v);} function ridged(x,y,seed){const n=noise2d(x,y,seed);return 1-Math.abs(n*2-1);} function fbm2d(x,y,seed){let sum=0,amp=1,freq=1,total=0;for(let o=0;o<4;o++){sum+=amp*(noise2d(x*freq,y*freq,seed+o*1013)-0.5)*2;total+=amp;amp*=0.5;freq*=2;}return sum/total;}
function generateMap(p){const N=p.size||96;map.size=N;map.heights=new Float32Array(N*N);map.biomes=new Uint8Array(N*N);map.resources=new Float32Array(N*N);map.resMax=new Float32Array(N*N);map.resRegen=new Float32Array(N*N);map.smooth=(p.smooth!==undefined?p.smooth:(p.step||0));
  resourceScale=world.resourceScale||resourceScale;
  const seed=(p.seed||12345)>>>0,slope=p.slope||1.1,mount=p.mount||1.0, rivers=!!p.rivers, set=p.biomes||['plains','forest','desert','wetland','tundra'];
  for(let z=0;z<N;z++){
    for(let x=0;x<N;x++){
      let h=fbm2d(x*0.02,z*0.02,seed);
      h+=fbm2d(x*0.08,z*0.08,seed+999)*0.35;
      h+=(ridged(x*0.12,z*0.12,seed+5555)-0.5)*2.0*mount;
      h*=slope;
      map.heights[z*N+x]=h;
    }
  }
  if(map.smooth>0){
    const sm=new Float32Array(N*N);
    for(let z=0;z<N;z++){
      for(let x=0;x<N;x++){
        let sum=0,count=0;
        for(let dz=-1;dz<=1;dz++){
          for(let dx=-1;dx<=1;dx++){
            const nx=x+dx, nz=z+dz;
            if(nx<0||nx>=N||nz<0||nz>=N) continue;
            sum+=map.heights[nz*N+nx];
            count++;
          }
        }
        const avg=sum/count;
        sm[z*N+x]=lerp(map.heights[z*N+x],avg,map.smooth);
      }
    }
    map.heights=sm;
  }
  let mn=1e9,mx=-1e9;for(let i=0;i<N*N;i++){const v=map.heights[i];if(v<mn)mn=v;if(v>mx)mx=v;}const rg=mx-mn||1;for(let i=0;i<N*N;i++){map.heights[i]=((map.heights[i]-mn)/rg)*1.2-0.6;}
  if(rivers){for(let z=0;z<N;z++){for(let x=0;x<N;x++){const r=ridged(x*0.05,z*0.05,seed+9909);const d=(1-r);const dig=Math.max(0,d-0.6)*0.55;const i=z*N+x;map.heights[i]-=dig;}}}
  function ok(n){return set.indexOf(n)>=0;}
  for(let z=0;z<N;z++){
    for(let x=0;x<N;x++){
      const i=z*N+x,e=map.heights[i], temp=1-Math.abs((z/N)*2-1), moist=noise2d(x*0.05,z*0.05,seed+4242);
      let b=0;if(e<map.waterLevel&&ok('wetland'))b=3;else if(temp<0.25&&ok('tundra'))b=4;else if(moist<0.28&&ok('desert'))b=2;else if(moist>0.65&&ok('forest'))b=1;else b=0;map.biomes[i]=b;
      let max=0.6,regen=0.01;
      if(b===1){max=1.0;regen=0.02;} else if(b===2){max=0.3;regen=0.0025;} else if(b===3){max=0.8;regen=0.015;} else if(b===4){max=0.5;regen=0.0075;}
      map.resMax[i]=max;map.resources[i]=max;map.resRegen[i]=regen;
    }
  }
  for(let i=0;i<map.resources.length;i++){map.resources[i]*=resourceScale;map.resMax[i]*=resourceScale;map.resRegen[i]*=resourceScale;}
  world.resourceScale=resourceScale;
  const props=[];for(let z=0;z<N;z++){for(let x=0;x<N;x++){const i=z*N+x,e=map.heights[i],bx=(x/(N-1)-0.5)*(world.bounds*2),bz=(z/(N-1)-0.5)*(world.bounds*2),b=map.biomes[i],r=noise2d(x*0.3,z*0.3,seed+4444);if(b===1&&r>0.75&&e>map.waterLevel+0.02)props.push({type:'tree',x:bx,z:bz,y:e,s:0.8+noise2d(x*0.2,z*0.2,seed+1)});if(b===2&&r>0.82&&e>map.waterLevel+0.02)props.push({type:'cactus',x:bx,z:bz,y:e,s:0.8+noise2d(x*0.3,z*0.3,seed+2)});if(b===0&&r>0.85)props.push({type:'rock',x:bx,z:bz,y:e,s:0.6+noise2d(x*0.2,z*0.2,seed+3)});if(b===3&&r>0.78)props.push({type:'reed',x:bx,z:bz,y:e,s:0.7+noise2d(x*0.3,z*0.3,seed+4)});}}
  postMessage({type:'map',payload:{size:N,heights:map.heights,biomes:map.biomes,resources:map.resources,resMax:map.resMax,resRegen:map.resRegen,smooth:map.smooth,vs:VERT,waterLevel:map.waterLevel,props}});}
function mapCoord(x,z){const N=map.size;const fx=((x/(world.bounds*2))+0.5)*(N-1),fz=((z/(world.bounds*2))+0.5)*(N-1);const xi=Math.max(0,Math.min(N-2,Math.floor(fx))),zi=Math.max(0,Math.min(N-2,Math.floor(fz)));return {N,xi,zi,i:zi*N+xi};}
function heightRawAt(x,z){const c=mapCoord(x,z);return map.heights[c.i];} function heightAtWorld(x,z){return heightRawAt(x,z)*VERT;}
function slopeAt(x,z){const c=mapCoord(x,z);const h=map.heights[c.i],hx=map.heights[c.i+1],hz=map.heights[c.i+c.N];return Math.sqrt((hx-h)*(hx-h)+(hz-h)*(hz-h));}
function biomeAt(x,z){const c=mapCoord(x,z);return map.biomes[c.i]||0;}
// Genes/species
let nextId=1,nextSpeciesId=1;const speciesHues={};let treeNodes=[];
function regSpecies(id,parent){const hue=(speciesHues[id]!==undefined?speciesHues[id]:rand());treeNodes.push({id,parent:parent||0,birth:world.t,hue});}
const MUTATION_WIDTH=0.05;
const DRIFT_STEP=0.01;

function gdist(a,b){
  let d = Math.abs(a.size-b.size)*0.8+Math.abs(a.speed-b.speed)*0.6+
          Math.abs(a.thermo-b.thermo)*0.8+Math.abs(a.climb-b.climb)*0.6+
          Math.abs(a.swim-b.swim)*0.6+Math.abs(a.social-b.social)*0.4+
          Math.abs(a.perception-b.perception)*0.4+(a.diet!==b.diet?0.4:0);
  const ba=a.behavior||{}, bb=b.behavior||{};
  const keys=['forage','drink','mate','rest','escape','explore'];
  for(const k of keys){
    d+=Math.abs((ba['w_'+k]??0.5)-(bb['w_'+k]??0.5))*0.2;
    d+=Math.abs((ba['th_'+k]??0.5)-(bb['th_'+k]??0.5))*0.2;
  }
  d+=Math.abs((a.drift||0)-(b.drift||0))*0.5;
  return d;
}

function newGenes(base){
  const b=base&&base.behavior;
  const behavior={};
  const keys=['forage','drink','mate','rest','escape','explore'];
  for(const k of keys){
    behavior['w_'+k]=clamp01(((b&&b['w_'+k])??rand())+(rand()*2-1)*MUTATION_WIDTH);
    behavior['th_'+k]=clamp01(((b&&b['th_'+k])??rand())+(rand()*2-1)*MUTATION_WIDTH);
  }
  return {
    size:clamp01((base&&base.size||0.5)+(rand()*2-1)*MUTATION_WIDTH),
    speed:clamp01((base&&base.speed||0.5)+(rand()*2-1)*MUTATION_WIDTH),
    thermo:clamp01((base&&base.thermo||rand())+(rand()*2-1)*(MUTATION_WIDTH*0.6)),
    climb:clamp01((base&&base.climb||rand())+(rand()*2-1)*(MUTATION_WIDTH*0.6)),
    swim:clamp01((base&&base.swim||rand())+(rand()*2-1)*(MUTATION_WIDTH*0.6)),
    social:clamp01((base&&base.social||rand())+(rand()*2-1)*(MUTATION_WIDTH*0.6)),
    perception:clamp01((base&&base.perception||rand())+(rand()*2-1)*(MUTATION_WIDTH*0.6)),
    diet:(base&&base.diet!==undefined)?base.diet:(rand()<0.15?1:0),
    drift:(base&&base.drift||0)+rand()*DRIFT_STEP,
    behavior
  };
}
function spawnEntity(id){
  const g=newGenes();
  const x=(rand()*2-1)*(world.bounds*0.6),z=(rand()*2-1)*(world.bounds*0.6);
  const sp=nextSpeciesId++;
  speciesHues[sp]=rand();
  regSpecies(sp,0);
  const energy=maxEnergy(g.size)*0.6;
  return {id,x,z,y:heightAtWorld(x,z)+0.35*CREATURE_SCALE,vx:0,vz:0,yaw:0,energy,age:0.0,hydration:1.0,cooldown:30+rand()*30,genes:g,species:sp,mode:'walk',behavior:'explore',biomeExp:new Uint8Array(5),searchDir:null,driftAngle:rand()*Math.PI*2};
}
function reproduce(p){
  const cg=newGenes(p.genes);
  const fav=p.biomeExp?p.biomeExp.indexOf(Math.max(...p.biomeExp)):0;
  const dist=gdist(cg,p.genes)+((fav===2||fav===3)?0.05:0);
  let sp=p.species;
  if(dist>0.22){
    sp=++nextSpeciesId;
    speciesHues[sp]=rand();
    regSpecies(sp,p.species);
  }
  const energy=maxEnergy(cg.size)*0.6;
    entities.push({id:nextId++,x:p.x+(rand()*2-1)*0.5,z:p.z+(rand()*2-1)*0.5,y:heightAtWorld(p.x,p.z)+0.35*CREATURE_SCALE,vx:0,vz:0,yaw:0,energy,hydration:0.8,age:0.0,cooldown:30+rand()*30,genes:cg,species:sp,mode:'walk',behavior:'explore',biomeExp:new Uint8Array(5),searchDir:null,driftAngle:rand()*Math.PI*2});
}
// env
function comfortTempBase(z){return (Math.sin(z*0.07)*0.5+0.5);} function comfortTempWithDevices(x,z){let t=comfortTempBase(z);for(const d of devices){if(d.type!=='heater')continue;const dx=d.x-x,dz=d.z-z;const r2=dx*dx+dz*dz;const fall=Math.exp(-r2/(d.radius*d.radius));t=clamp01(t+d.power*0.25*fall);}return t;}
function plantRichnessAt(x,z){
  const N=map.size;
  const fx=((x/(world.bounds*2))+0.5)*(N-1);
  const fz=((z/(world.bounds*2))+0.5)*(N-1);
  const xi=Math.floor(fx), zi=Math.floor(fz);
  let best=0.0;
  const R=2;
  for(let dz=-R;dz<=R;dz++){
    for(let dx=-R;dx<=R;dx++){
      const tx=xi+dx, tz=zi+dz;
      if(tx<0||tx>=N||tz<0||tz>=N)continue;
      const idx=tz*N+tx;
      const wx=(tx/(N-1)-0.5)*(world.bounds*2);
      const wz=(tz/(N-1)-0.5)*(world.bounds*2);
      const ddx=wx-x, ddz=wz-z;
      const d2=ddx*ddx+ddz*ddz;
      const e=map.resources[idx]/(1+d2*0.05);
      if(e>best)best=e;
    }
  }
  for(const d of devices){
    if(d.type!=='sprinkler')continue;
    const dx=d.x-x,dz=d.z-z;
    const r2=dx*dx+dz*dz;
    const fall=Math.exp(-r2/(d.radius*d.radius));
    best+=d.power*0.8*fall;
  }
  return best;
}
function waterNear(x,z){return heightRawAt(x,z)<map.waterLevel?1.0:0.0;}
// spatial hash
const cell=3.0;let grid=new Map();function gkey(ix,iz){return (ix<<16)|(iz&0xffff);} function rebuild(){grid.clear();for(const e of entities){const ix=Math.floor((e.x+world.bounds)/cell),iz=Math.floor((e.z+world.bounds)/cell),k=gkey(ix,iz);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(e);}} function near(x,z,r){const ix0=Math.floor((x+world.bounds)/cell),iz0=Math.floor((z+world.bounds)/cell),sp=Math.ceil(r/cell);const out=[];for(let dz=-sp;dz<=sp;dz++){for(let dx=-sp;dx<=sp;dx++){const k=gkey(ix0+dx,iz0+dz),arr=grid.get(k);if(!arr)continue;for(const e of arr){const dx2=e.x-x,dz2=e.z-z;if(dx2*dx2+dz2*dz2<=r*r)out.push(e);}}}return out;}
// lifecycle
function init(seed,count,cap){randState=seed>>>0;entities=[];devices=[];nextId=1;nextSpeciesId=1;treeNodes=[];world.simCap=cap||world.simCap;generateMap({seed,size:96,smooth:0.3,slope:1.1,mount:1.0,rivers:true,biomes:['plains','forest','desert','wetland','tundra']});for(let i=0;i<count;i++)entities.push(spawnEntity(nextId++));snapshot();}
function tick(dt){
  const tiles=map.size*map.size;
  for(let i=0;i<tiles;i++){
    const cur=map.resources[i],max=map.resMax[i];
    map.resources[i]=Math.min(max,cur+max*map.resRegen[i]*dt);
  }
  world.t+=dt;world.season=(Math.sin(world.t*0.05*world.seasonSpeed)*0.5+0.5);rebuild();
    for(let i=entities.length-1;i>=0;i--){const e=entities[i];e.age+=dt;e.cooldown-=dt;e.hydration-=0.01*dt;e.hydration=Math.max(0,e.hydration);const s=5.0+e.genes.perception*4.0;const ar=near(e.x,e.z,s);const b=biomeAt(e.x,e.z);e.biomeExp[b]=Math.min(255,e.biomeExp[b]+1);
    const maxE=maxEnergy(e.genes.size);
    const targetT=e.genes.thermo,hereT=comfortTempWithDevices(e.x,e.z),comfort=1-Math.abs(hereT-targetT),food=plantRichnessAt(e.x,e.z),atWater=waterNear(e.x,e.z);
    const comfortCoef = 1 + (1 - comfort) * BASAL_COMFORT_FACTOR;
    const energy01=norm(e.energy,maxE),hydration01=norm(e.hydration,1.0);
      const hunger=1-energy01,thirst=1-hydration01,discomfort=1-comfort;
      const localRes=map.resources[mapCoord(e.x,e.z).i];
      let U_drink=(atWater?0.5:0)+thirst*0.8;
      U_drink*=thirst;
      let U_mate=(e.energy>1.2&&e.cooldown<=0&&e.age>=60)?(0.3+e.genes.social*0.4):0.0;
      let U_rest=(energy01<0.3?0.6:0.1)*(1-comfort);
      let fleeX=0,fleeZ=0,chaseX=0,chaseZ=0,prey=0;
      for(const o of ar){
        if(o===e)continue;
        const dx=o.x-e.x,dz=o.z-e.z;const d=Math.sqrt(dx*dx+dz*dz)+1e-6;
        if(e.genes.diet===0&&o.genes.diet===1&&d<s){U_rest=0;U_mate=0;fleeX-=dx/d*(1.5-d/s);fleeZ-=dz/d*(1.5-d/s);} 
        if(e.genes.diet===1&&o.genes.diet===0&&d<s){chaseX+=dx/d*(1.5-d/s);chaseZ+=dz/d*(1.5-d/s);prey++;}
      }
      let U_forage;
      if (e.genes.diet === 0) {
        U_forage = 0.6 * (food + 0.2 * comfort);
        U_forage *= 1 + FORAGE_NEAR_RES_COEF * (1 - localRes);
      } else {
        const chaseMag = Math.sqrt(chaseX * chaseX + chaseZ * chaseZ);
        U_forage = 0.25 * (0.2 + 0.8 * Math.min(1, chaseMag));
        if (prey === 0) {
          U_forage = 0;
        }
      }
      U_forage *= 1 + FORAGE_ENERGY_DEFICIT_COEF * hunger;
      U_forage *= hunger;
      const U_escape=Math.sqrt(fleeX*fleeX+fleeZ*fleeZ);
      const deficit=Math.max(hunger,thirst,discomfort);
      let U_explore=0.1+0.9*clamp01((deficit-EXPLORE_DEFICIT_THRESHOLD)/(1-EXPLORE_DEFICIT_THRESHOLD));
      if (prey === 0 && e.genes.diet === 1) {
        U_explore += hunger * 0.3;
      }
      const bw=e.genes.behavior||{};
      const u={forage:U_forage,drink:U_drink,mate:U_mate,rest:U_rest,escape:U_escape,explore:U_explore};
      let behavior='explore',maxDes=-1;
      for(const k in u){
        const w=bw['w_'+k]??1;
        const th=bw['th_'+k]??0;
        const v=u[k]*w;
        if(v>th && v>maxDes){maxDes=v;behavior=k;}
      }
      e.behavior=behavior;
      if (behavior === 'explore') {
        e.driftAngle += (rand()*2-1) * e.genes.drift;
        e.searchDir = {x: Math.cos(e.driftAngle), z: Math.sin(e.driftAngle)};
      } else {
        e.searchDir = null;
      }
      let sepX=0,sepZ=0,aliX=0,aliZ=0,cohX=0,cohZ=0,nali=0,ncoh=0;
      for(const o of ar){
        if(o===e)continue;
        const dx=e.x-o.x,dz=e.z-o.z;const d=Math.sqrt(dx*dx+dz*dz)+1e-6;
        if(d<1.0){const f=(1.0-d);sepX+=(dx/d)*f;sepZ+=(dz/d)*f;}
        if(o.genes.diet===e.genes.diet){aliX+=o.vx;aliZ+=o.vz;nali++;cohX+=o.x;cohZ+=o.z;ncoh++;}
      }
      if(nali>0){aliX/=nali;aliZ/=nali;}
      if(ncoh>0){cohX=(cohX/ncoh-e.x);cohZ=(cohZ/ncoh-e.z);}
      const baseX=sepX*1.6+aliX*0.12*e.genes.social+cohX*0.08*e.genes.social;
      const baseZ=sepZ*1.6+aliZ*0.12*e.genes.social+cohZ*0.08*e.genes.social;
      const gLen=Math.hypot(baseX,baseZ);
      const groupDir=gLen>0?{x:baseX/gLen,z:baseZ/gLen}:{x:0,z:0};
      const hR=heightRawAt(e.x+0.6,e.z)-heightRawAt(e.x-0.6,e.z), hU=heightRawAt(e.x,e.z+0.6)-heightRawAt(e.x,e.z-0.6);
      let forageX=0,forageZ=0;
      if(e.genes.diet===0){
        const resR=map.resources[mapCoord(e.x+0.8,e.z).i],resL=map.resources[mapCoord(e.x-0.8,e.z).i];
        const resU=map.resources[mapCoord(e.x,e.z+0.8).i],resD=map.resources[mapCoord(e.x,e.z-0.8).i];
        const gx=resR-resL,gz=resU-resD;
        const need=Math.max(0,RES_LOW_THRESHOLD-localRes)/RES_LOW_THRESHOLD;
        const gradCoef=RES_GRAD_BASE*(1+need*RES_GRAD_LOW_RES_BOOST);
        forageX=gx*gradCoef; forageZ=gz*gradCoef;
      }else{
        forageX=chaseX*1.2; forageZ=chaseZ*1.2;
      }
      const drinkX=-hR*0.9*thirst, drinkZ=-hU*0.9*thirst;
      const mateX=cohX*0.5, mateZ=cohZ*0.5;
      const escapeX=fleeX*1.7, escapeZ=fleeZ*1.7;
      const restX=0, restZ=0;
      let exploreX, exploreZ;
      if (e.searchDir) {
        const urge = 0.3 + deficit * 0.4;
        exploreX = urge * e.searchDir.x + 0.2 * groupDir.x * e.genes.social;
        exploreZ = urge * e.searchDir.z + 0.2 * groupDir.z * e.genes.social;
      } else {
        const ang=rand()*Math.PI*2;
        exploreX=Math.cos(ang)*0.3+0.2*groupDir.x*e.genes.social;
        exploreZ=Math.sin(ang)*0.3+0.2*groupDir.z*e.genes.social;
      }
      const vecs={
        forage:{x:forageX,z:forageZ},
        drink:{x:drinkX,z:drinkZ},
        mate:{x:mateX,z:mateZ},
        escape:{x:escapeX,z:escapeZ},
        rest:{x:restX,z:restZ},
        explore:{x:exploreX,z:exploreZ}
      };
      let desireX=0,desireZ=0;
      for(const k in vecs){
        const w=(k===behavior)?1.0:0.3;
        desireX+=vecs[k].x*w;
        desireZ+=vecs[k].z*w;
      }
      const ax=baseX+desireX;
      const az=baseZ+desireZ;
    const sl=slopeAt(e.x,e.z); const avoidSlope=Math.max(0,sl-(0.10+0.15*e.genes.climb)); const inWater=heightRawAt(e.x,e.z)<map.waterLevel; e.mode=inWater?'swim':'walk';
    const acc=0.6+e.genes.speed*0.9; e.vx+=ax*acc*dt; e.vz+=az*acc*dt;
    const damp=inWater?(1-0.45*dt):(1-0.65*dt); e.vx*=damp*(1-avoidSlope*0.6)*(1-(inWater?(1-e.genes.swim)*0.7:0)); e.vz*=damp*(1-avoidSlope*0.6)*(1-(inWater?(1-e.genes.swim)*0.7:0));
    const maxS=maxSpeedFor(e);
    const sp2=e.vx*e.vx+e.vz*e.vz, sp=Math.sqrt(sp2),limit=inWater?1.5+e.genes.speed*1.5:maxS; if(sp>limit){const s=limit/sp;e.vx*=s;e.vz*=s;}
    e.x+=e.vx*dt; e.z+=e.vz*dt; const B=world.bounds-1.0; if(e.x<-B){e.x=-B;e.vx*=-0.8;} if(e.x>B){e.x=B;e.vx*=-0.8;} if(e.z<-B){e.z=-B;e.vz*=-0.8;} if(e.z>B){e.z=B;e.vz*=-0.8;}
    const gY=heightAtWorld(e.x,e.z); e.y=gY+(inWater?(map.waterLevel*VERT-gY):0)+(inWater?0.15:0.35)*CREATURE_SCALE; if(avoidSlope>0.6){e.vx-=Math.sign(e.vx)*0.02; e.vz-=Math.sign(e.vz)*0.02;}
    const biome=b; const biomeMul=(biome===2?0.6:(biome===3?1.3:(biome===4?0.7:1.0)));
      let intake=(e.genes.diet===0)?(0.7*plantRichnessAt(e.x,e.z)*biomeMul):0;
      const moveCost=(0.0006*sp2)*(0.8+e.genes.size*0.6)*(1+avoidSlope*0.8+(inWater?(1-e.genes.swim)*0.9:0))*(1+e.genes.speed*0.5);
      const basal=(0.0008+0.0006*e.genes.size)*comfortCoef;
      if(e.genes.diet===0){
        const {i}=mapCoord(e.x,e.z);
        const available=map.resources[i];
        const maxConsume=intake*dt;
        const consumed=Math.min(available,maxConsume);
        map.resources[i]=available-consumed;
        e.energy+=consumed-(moveCost+basal);
      }else{
        e.energy-=(moveCost+basal);
      }
      if(inWater)e.hydration=clamp01(e.hydration+0.5*dt);
      if(e.genes.diet===1){
        for(const o of ar){
          if(o===e||o.genes.diet!==0)continue;
          const dx=o.x-e.x,dz=o.z-e.z,d2=dx*dx+dz*dz;
          const catchDist=Math.max(0.3,0.5+(e.genes.speed-o.genes.speed)*0.25);
          if(d2<catchDist*catchDist){e.energy+=1.5;o.energy-=1.5;}
        }
      }
      e.hydration=clamp01(e.hydration);
      if (e.hydration <= 0) e.energy -= DEHYDRATION_PENALTY * dt;
      e.energy=maxE*norm(e.energy,maxE);
      if(entities.length<world.simCap&&e.cooldown<=0&&e.energy>maxE*0.75&&e.hydration>0.3&&e.age>=60){e.cooldown=30+rand()*30;e.energy-=0.6;reproduce(e);} if(e.energy<=0||e.age>300){entities.splice(i,1);continue;}
    e.yaw=Math.atan2(e.vx,e.vz);
  }
}
function snapshot(){
  world.resources = map.resources;
  world.resMax = map.resMax;
  const list=new Array(entities.length);
  for(let i=0;i<entities.length;i++){
    const e=entities[i];
      list[i]={
        id:e.id,x:e.x,y:e.y,z:e.z,yaw:e.yaw,mode:e.mode,vx:e.vx,vz:e.vz,
        behavior:e.behavior,
        species:e.species,
        energy:e.energy,maxEnergy:maxEnergy(e.genes.size),
        genes:{
          size:e.genes.size,speed:e.genes.speed,climb:e.genes.climb,swim:e.genes.swim,
          thermo:e.genes.thermo,social:e.genes.social,perception:e.genes.perception,diet:e.genes.diet,
          behavior:{
            w_forage:e.genes.behavior.w_forage,w_drink:e.genes.behavior.w_drink,
            w_mate:e.genes.behavior.w_mate,w_rest:e.genes.behavior.w_rest,
            w_escape:e.genes.behavior.w_escape,w_explore:e.genes.behavior.w_explore,
            th_forage:e.genes.behavior.th_forage,th_drink:e.genes.behavior.th_drink,
            th_mate:e.genes.behavior.th_mate,th_rest:e.genes.behavior.th_rest,
            th_escape:e.genes.behavior.th_escape,th_explore:e.genes.behavior.th_explore
          }
        }
      };
  }
  postMessage({type:'state',payload:{entities:list,world,devices}});
}

const dt = 0.1;
function loop(){
  if(!running) return;
  const now = performance.now();
  accumulator += (now - lastTime) / 1000 * simSpeed;
  lastTime = now;
  let ticked = false;
  while(accumulator >= dt){
    tick(dt);
    accumulator -= dt;
    ticked = true;
  }
  if(ticked) snapshot();
  setTimeout(loop,16);
}

onmessage=(e)=>{try{const t=e.data.type,p=e.data.payload;
  if(t==='init'){init((p&&p.seed)||1,(p&&p.entityCount)||400,p&&p.simCap||4000);running=true;accumulator=0;lastTime=performance.now();loop();}
  else if(t==='seasonSpeed'){world.seasonSpeed=p||1.0;}
  else if(t==='placeDevice'){devices.push({type:p.type,x:p.x,z:p.z,power:1.0,radius:5.0});}
  else if(t==='pickSelect'){let best=null,bd2=1e9;for(const ent of entities){const dx=ent.x-p.x,dz=ent.z-p.z,d2=dx*dx+dz*dz;if(d2<bd2){bd2=d2;best=ent;}} if(best)postMessage({type:'selected',payload:{x:best.x,z:best.z}});}
  else if(t==='regenMap'){generateMap(p||{seed:Date.now(),size:96,smooth:0.3,slope:1.1,mount:1.0,rivers:true});}
  else if(t==='getTree'){postMessage({type:'tree',payload:{nodes:treeNodes}});}
  else if(t==='selectSpecies'){postMessage({type:'rpgReady',payload:{species:p.species}});}
  else if(t==='resourceScale'){const newValue = (p !== undefined) ? p : 1.0;const factor=newValue/resourceScale;for(let i=0;i<map.resources.length;i++){map.resources[i]*=factor;map.resMax[i]*=factor;map.resRegen[i]*=factor;}resourceScale=newValue;world.resourceScale=newValue;snapshot();}
  else if(t==='simCap'){world.simCap=p||world.simCap;}
  else if(t==='simSpeed'){simSpeed=p;}
  else if(t==='pause'){running=false;}
  else if(t==='resume'){running=true;lastTime=performance.now();loop();}
 }catch(err){postMessage({type:'error',payload:''+err});}};
