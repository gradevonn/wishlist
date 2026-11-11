import * as THREE from 'three';
import { buildTelevision, buildFocusedTelevision } from './tv-models.js';
import { buildRack, buildSelectedSupport } from './rack-model.js';
import { CameraFlight, homeCameraPose, frontCameraPose } from './camera-flight.js';
import { createScreenMaterial } from './screen-material.js';

// Closed cabinet/rack meshes, reconstructed in the Figma camera's coordinates.
// The reference render supplies camera-projected UV detail on those meshes.
// There is no sculpture photograph plane or screenshot in this scene.
const asset = name => new URL(name, import.meta.url).href;
const damp = (a, b, dt, speed = 9) => a + (b - a) * (1 - Math.exp(-dt * speed));
const vector = (value, fallback = [0,0,0]) => value?.isVector3 ? value.clone() : new THREE.Vector3(...(Array.isArray(value)?value:fallback));
const frameQuaternion = frame => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  vector(frame?.right,[1,0,0]).normalize(),vector(frame?.up,[0,1,0]).normalize(),vector(frame?.normal,[0,0,1]).normalize(),
));
function ratio(q){
  if(!q||q.length!==4)return 4/3;
  const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  return(d(q[0],q[1])+d(q[3],q[2]))/Math.max(1,d(q[0],q[3])+d(q[1],q[2]));
}

export class DesktopScene {
  constructor({canvas,projects,onSelect=()=>{},onHover=()=>{},onReady=()=>{}}){
    Object.assign(this,{canvas,projects,onSelect,onHover,onReady});
    this.active=true;this.ready=false;this.revealed=false;this.disposed=false;
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.selected=-1;this.hovered=-1;this.enter=0;this.focusProgress=0;this.lastTime=0;this.frame=null;
    this.contactProgress=0;this.focusUnits=[];this.focusedUnit=null;
    this.cameraAction='home';
    this.referenceMode=new URLSearchParams(location.search).has('reference');
    this.tvs=[];this.media=[];this.resources=new Set();this.pickMeshes=[];
    this.pointer=new THREE.Vector2();this.raycaster=new THREE.Raycaster();
    this.scene=new THREE.Scene();this.scene.background=null;
    this.camera=new THREE.OrthographicCamera(-9.6,9.6,4.78,-4.78,.1,100);
    this.camera.position.set(0,0,30);this.camera.lookAt(0,0,0);
    this.cameraFlight=new CameraFlight(this.camera);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
    this.renderer.setClearColor(0,0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;
    this.home=new THREE.Group();this.project=new THREE.Group();this.project.visible=false;
    this.home.name='Ten reconstructed full 3D cabinets';this.project.name='Selected home televisions moving forward';
    this.scene.add(this.home,this.project);
    this.scene.add(new THREE.HemisphereLight(0xbfc7d4,0x21160e,1.05));
    const key=new THREE.DirectionalLight(0xffd9aa,2);key.position.set(-5,8,10);this.scene.add(key);
    const fill=new THREE.DirectionalLight(0xd0d8e7,.9);fill.position.set(7,2,8);this.scene.add(fill);
    this._render=this._render.bind(this);this._bind();this.resize();
    this._load().catch(error=>{
      if(this.disposed)return;
      console.error('[re//run] Reconstructed scene failed to load.',error);
      canvas.dispatchEvent(new CustomEvent('rerun:webgl-lost',{bubbles:true}));
    });
  }
  async _texture(url){
    const t=await new THREE.TextureLoader().loadAsync(url);
    if(this.disposed){t.dispose();return t;}
    t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());
    this.resources.add(t);return t;
  }
  async _load(){
    const [homeTexture,supportTexture,...posters]=await Promise.all([
      this._texture(asset('./reference/sculpture-source.webp')),
      this._texture(asset('./reference/project-source.webp')),
      ...this.projects.map(p=>this._texture(asset(`../assets/work/${p.media}.jpg`))),
    ]);
    if(this.disposed)return;
    this.homeTexture=homeTexture;this.supportTexture=supportTexture;
    this.home.add(buildRack({texture:homeTexture}));
    for(let i=0;i<Math.min(10,this.projects.length);i++){
      const tv=buildTelevision(i,{texture:homeTexture});tv.index=i;
      tv.group.name=`TV ${i+1} — ${this.projects[i].media}`;
      tv.group.traverse(n=>{if(n.isMesh){n.userData.projectIndex=i;this.pickMeshes.push(n);}});
      tv.screen=tv.screen||tv.group.getObjectByName('screen');
      this._referenceUV(tv);
      tv.screenMaterial=this._screen(posters[i],ratio(tv.screenQuad),.77,homeTexture,tv.screenRadius??(i===8?.11:.075));
      tv.screen.material=tv.screenMaterial;tv.screen.renderOrder=2;
      this.home.add(tv.group);this.tvs.push(tv);this.media.push(this._medium(this.projects[i],posters[i]));
    }
    this.homeMaterials=this._materials(this.home);
    this.ready=true;
    if(this.selected>=0){const unit=this._ensureFocusUnit(this.selected);if(unit)this._flyToUnit(unit);}
    this.onReady();this._updatePlayback();this._requestFrame();
  }
  _materials(group){
    const set=new Set();group.traverse(n=>{if(n.material)for(const m of(Array.isArray(n.material)?n.material:[n.material])){m.transparent=true;set.add(m);}});return set;
  }
  _referenceUV(model){
    if(model.screen.geometry.attributes.uvReference)return;
    const p=model.screen.geometry.attributes.position,r=model.sourceRect,g=model.group.position,uv=[];
    for(let i=0;i<p.count;i++)uv.push(((p.getX(i)+g.x)*100+960-r.x)/r.width,1-(478-(p.getY(i)+g.y)*100-r.y)/r.height);
    model.screen.geometry.setAttribute('uvReference',new THREE.Float32BufferAttribute(uv,2));
  }
  _screen(map,ar,brightness,reference,radius){
    return createScreenMaterial({map,aspect:ar,brightness,reference,radius,referenceMode:this.referenceMode,fit:'cover',preserveHomeLook:true});
  }
  _cloneMaterials(group){
    const copies=new Map();
    const clone=source=>{
      if(!copies.has(source)){
        const copy=source.clone();
        if(source.uniforms)for(const [key,uniform]of Object.entries(source.uniforms))if(uniform.value?.isTexture){
          const duplicate=copy.uniforms[key].value;if(duplicate!==uniform.value)duplicate?.dispose();
          copy.uniforms[key].value=uniform.value;
        }
        copy.transparent=true;copies.set(source,copy);
      }
      return copies.get(source);
    };
    group.traverse(n=>{if(n.isMesh)n.material=Array.isArray(n.material)?n.material.map(clone):clone(n.material);});
    return new Set(copies.values());
  }
  _ensureFocusUnit(index){
    if(!this.ready||!this.tvs[index])return null;
    if(this.focusedUnit?.index===index){this.focusedUnit.retiring=false;return this.focusedUnit;}
    if(this.focusedUnit)this.focusedUnit.retiring=true;
    let unit=this.focusUnits.find(u=>u.index===index);
    if(!unit){
      const original=this.tvs[index],group=new THREE.Group(),departure=original.group.clone(true);
      group.name=`Camera destination — ${original.group.name}`;
      departure.name=`Departure geometry — ${original.group.name}`;departure.visible=true;
      const departureMaterials=this._cloneMaterials(departure);
      const model=buildFocusedTelevision(index,{texture:this.homeTexture}),arrival=new THREE.Group();
      arrival.name=`Front-facing ${original.group.name} with its support`;
      const bounds=model.localBounds.clone(),homeFrame=model.homeFaceFrame,faceFrame=model.faceFrame;
      original.group.updateMatrix();
      const homeRotation=original.group.quaternion.clone().multiply(frameQuaternion(homeFrame));
      arrival.quaternion.copy(homeRotation).multiply(frameQuaternion(faceFrame).invert());
      const origin=vector(homeFrame.origin).applyMatrix4(original.group.matrix);
      arrival.position.copy(origin).sub(vector(faceFrame.origin).applyQuaternion(arrival.quaternion));
      const media=this.media[index];
      model.screen.material.dispose();
      model.screen.material=createScreenMaterial({map:media.poster,aspect:model.physicalScreenAspect,brightness:1,
        reference:this.homeTexture,referenceMode:this.referenceMode,radius:model.screenRadius,fit:'cover',preserveHomeLook:false});
      model.screen.renderOrder=2;
      const support=buildSelectedSupport(index,{faceFrame,texture:this.supportTexture});
      arrival.add(model.group,support.group);
      const arrivalMaterials=this._materials(arrival),ownedGeometries=new Set();
      arrival.traverse(n=>{if(n.geometry)ownedGeometries.add(n.geometry);});
      group.add(departure,arrival);this.project.add(group);
      unit={index,original,group,departure,arrival,model,support,bounds,
        screen:model.screen,departureScreen:departure.getObjectByName('screen'),departureMaterials,arrivalMaterials,
        materials:new Set([...departureMaterials,...arrivalMaterials]),ownedGeometries,
        progress:0,canonicalBlend:0,canonicalStart:0,retiring:false};
      this.focusUnits.push(unit);
    }
    unit.retiring=false;this.focusedUnit=unit;unit.original.group.visible=false;
    return unit;
  }
  _flyToUnit(unit,{duration=.85}={}){
    this.cameraAction='focus';unit.canonicalStart=unit.canonicalBlend;
    unit.group.updateWorldMatrix(true,true);
    unit.cameraPose=frontCameraPose({group:unit.arrival,faceFrame:unit.model.faceFrame,bounds:unit.bounds,aspect:this.width/this.height||1920/956});
    this.cameraFlight.moveTo(unit.cameraPose,{duration,instant:this.reducedMotion||this.referenceMode});
  }
  _removeFocusUnit(unit){
    this.project.remove(unit.group);unit.materials.forEach(m=>m.dispose());
    unit.ownedGeometries.forEach(g=>g.dispose());
    this.focusUnits=this.focusUnits.filter(u=>u!==unit);
    if(this.focusedUnit===unit)this.focusedUnit=null;
    unit.original.group.visible=!this.focusUnits.some(u=>u.index===unit.index);
  }
  _updateFocusUnits(dt,entrance,contactFade){
    let moving=false;
    const contact=this.contactProgress,contactScale=1-.62*contact,snap=this.reducedMotion||this.referenceMode;
    for(const unit of [...this.focusUnits]){
      const target=this.selected===unit.index&&this.focusedUnit===unit?1:0;
      unit.progress=snap?target:damp(unit.progress,target,dt);
      if(Math.abs(unit.progress-target)<.001)unit.progress=target;
      const returning=unit===this.focusedUnit&&this.selected<0;
      if(target===0&&unit.progress===0&&(!returning||!this.cameraFlight.active)){this._removeFocusUnit(unit);continue;}
      if(unit.progress!==target)moving=true;
      if(unit===this.focusedUnit){
        const flight=this.cameraFlight.progress;
        if(target===1)unit.canonicalBlend=THREE.MathUtils.lerp(unit.canonicalStart,1,THREE.MathUtils.smoothstep(flight,.10,.60));
        else if(returning)unit.canonicalBlend=THREE.MathUtils.lerp(unit.canonicalStart,0,THREE.MathUtils.smoothstep(flight,.35,.90));
      }
      // Focus never scales or flies the object. Only contact departure changes
      // the assembly transform; the actual camera handles all focus framing.
      unit.group.position.set(.65*contact,-contact,-14*contact);
      unit.group.rotation.set(.035*contact,-.035*contact,0);unit.group.scale.setScalar(contactScale);
      unit.departure.rotation.y=snap?0:damp(unit.departure.rotation.y,0,dt,10);
      const opacity=entrance*contactFade*(unit.retiring?unit.progress:1);
      const departureOpacity=opacity*(1-unit.canonicalBlend),arrivalOpacity=opacity*unit.canonicalBlend;
      this._opacity(unit.departureMaterials,departureOpacity);this._opacity(unit.arrivalMaterials,arrivalOpacity);
      unit.departure.visible=departureOpacity>.0001;unit.arrival.visible=arrivalOpacity>.0001;unit.group.visible=opacity>.0001;
      const media=this.media[unit.index];
      for(const screen of [unit.departureScreen,unit.screen]){
        const uniforms=screen.material.uniforms;uniforms.uMap.value=this.reducedMotion?media.poster:media.texture;
        uniforms.uPower.value=entrance;uniforms.uHover.value=0;
      }
      unit.original.group.visible=false;
    }
    this.project.visible=this.focusUnits.length>0&&contactFade>.0001;
    return moving;
  }
  _medium(p,poster){
    const m={poster,texture:poster,video:null,videoTexture:null};if(!p.motion)return m;
    const v=document.createElement('video');v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';
    v.src=asset(`../assets/work/${p.media}.mp4`);
    v.addEventListener('loadeddata',()=>{
      if(this.disposed)return;
      if(!m.videoTexture){m.videoTexture=new THREE.VideoTexture(v);m.videoTexture.colorSpace=THREE.SRGBColorSpace;this.resources.add(m.videoTexture);}
      m.texture=m.videoTexture;this._requestFrame();
    });v.addEventListener('playing',()=>this._requestFrame());m.video=v;return m;
  }
  _interactive(){return this.active&&this.ready&&this.revealed&&this.selected<0&&this.focusProgress<.01&&this.contactProgress<=.01&&this.focusUnits.length===0&&!this.cameraFlight.active;}
  hitTestSelected(clientX,clientY){
    const unit=this.focusedUnit;
    if(this.disposed||!this.ready||!unit||this.selected<0||this.contactProgress>.01)return false;
    const rect=this.canvas.getBoundingClientRect();
    if(!rect.width||!rect.height||clientX<rect.left||clientX>rect.right||clientY<rect.top||clientY>rect.bottom)return false;
    this.camera.updateMatrixWorld(true);this.scene.updateMatrixWorld(true);
    const x=(clientX-rect.left)/rect.width*2-1,y=1-(clientY-rect.top)/rect.height*2;
    // Unprojecting both clip planes also works if projection type changes later.
    const near=new THREE.Vector3(x,y,-1).unproject(this.camera),far=new THREE.Vector3(x,y,1).unproject(this.camera);
    const ray=new THREE.Raycaster(near,far.sub(near).normalize());
    const meshes=[];
    for(const root of [unit.departure,unit.arrival])if(root.visible&&unit.group.visible)root.traverse(n=>{if(n.isMesh&&n.visible)meshes.push(n);});
    return ray.intersectObjects(meshes,false).length>0;
  }
  _clearHover(){
    const changed=this.hovered!==-1;this.hovered=-1;this.canvas.style.cursor='default';
    if(changed)this.onHover(null);
  }
  _bind(){
    this.handleMove=e=>{
      if(!this._interactive()){this._clearHover();return;}
      const b=this.canvas.getBoundingClientRect();this.pointer.set((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2);
      this.raycaster.setFromCamera(this.pointer,this.camera);
      const hit=this.raycaster.intersectObjects(this.pickMeshes,false)[0];const i=hit?hit.object.userData.projectIndex:-1;
      if(i!==this.hovered){this.hovered=i;this.canvas.style.cursor=i<0?'default':'pointer';this.onHover(i<0?null:i);this._updatePlayback();this._requestFrame();}
    };
    this.handleLeave=()=>{this._clearHover();this._updatePlayback();this._requestFrame();};
    this.handleClick=e=>{if(!this._interactive())return;this.handleMove(e);if(this.hovered>=0)this.onSelect(this.hovered);};
    this.handleResize=()=>this.resize();this.handleVisibility=()=>{this._updatePlayback();this._requestFrame();};
    this.handleContextLoss=e=>{e.preventDefault();this.active=false;this.canvas.dispatchEvent(new CustomEvent('rerun:webgl-lost',{bubbles:true}));};
    this.canvas.addEventListener('pointermove',this.handleMove);this.canvas.addEventListener('pointerleave',this.handleLeave);
    this.canvas.addEventListener('click',this.handleClick);this.canvas.addEventListener('webglcontextlost',this.handleContextLoss);
    window.addEventListener('resize',this.handleResize);document.addEventListener('visibilitychange',this.handleVisibility);
  }
  _updatePlayback(){
    const live=this.ready&&this.active&&this.revealed&&!document.hidden&&!this.reducedMotion&&!this.referenceMode&&this.contactProgress<.999;
    for(let i=0;i<this.media.length;i++){
      const v=this.media[i].video;if(!v)continue;
      const chosen=this.selected>=0?i===this.selected:[1,7,this.hovered<0?8:this.hovered].includes(i);
      if(live&&chosen){if(v.preload==='none'){v.preload='auto';v.load();}if(v.paused)v.play().catch(()=>{});}else v.pause();
    }
  }
  reveal(){this.revealed=true;this.enter=this.reducedMotion||this.referenceMode?1:0;this._updatePlayback();this._requestFrame();}
  focus(i){
    if(!Number.isInteger(i)||i<0||i>=Math.min(10,this.projects.length))return;
    if(this.selected===i&&this.focusedUnit)return;
    this.selected=i;this._clearHover();const unit=this._ensureFocusUnit(i);if(unit)this._flyToUnit(unit);
    if(this.reducedMotion||this.referenceMode)this.focusProgress=1;
    this._updatePlayback();this._requestFrame();
  }
  reset(){
    const hadFocus=this.selected>=0||this.focusUnits.length>0||this.cameraAction==='focus';
    this.selected=-1;this._clearHover();
    if(this.focusedUnit){this.focusedUnit.retiring=false;this.focusedUnit.canonicalStart=this.focusedUnit.canonicalBlend;}
    if(hadFocus){this.cameraAction='reset';this.cameraFlight.moveTo(homeCameraPose(),{instant:this.reducedMotion||this.referenceMode});}
    if(this.reducedMotion||this.referenceMode)this.focusProgress=0;
    this._updatePlayback();this._requestFrame();
  }
  setContactProgress(progress){
    if(this.disposed)return;
    const value=Number(progress);this.contactProgress=Number.isFinite(value)?THREE.MathUtils.clamp(value,0,1):0;
    if(this.contactProgress>.01)this._clearHover();
    // The app owns contact easing. Apply its progress directly, with no timer.
    this._updatePlayback();this._requestFrame();
  }
  setActive(v){this.active=!!v;if(!this.active&&this.frame){cancelAnimationFrame(this.frame);this.frame=null;this.lastTime=0;}this._updatePlayback();this._requestFrame();}
  setReducedMotion(v){this.reducedMotion=!!v;if(v){this.enter=1;this.focusProgress=this.selected>=0?1:0;this.cameraFlight.update(0,true);}this._updatePlayback();this._requestFrame();}
  resize(){
    const w=this.canvas.clientWidth||innerWidth,h=this.canvas.clientHeight||innerHeight;
    this.width=w;this.height=h;this.cameraFlight.setAspect(w/h);
    if(this.focusedUnit&&this.selected>=0)this._flyToUnit(this.focusedUnit,{duration:.25});
    this.renderer.setSize(w,h,false);this._requestFrame();
  }
  getHitRects(){return this.tvs.map(tv=>{
    const b=new THREE.Box3().setFromObject(tv.group),a=b.min.clone().project(this.camera),c=b.max.clone().project(this.camera);
    return{index:tv.index,x:(a.x+c.x+2)/4,y:(2-a.y-c.y)/4,width:Math.abs(c.x-a.x)/2,height:Math.abs(c.y-a.y)/2};
  });}
  _requestFrame(){if(!this.frame&&this.active&&!document.hidden&&!this.disposed)this.frame=requestAnimationFrame(this._render);}
  _opacity(set,a){if(!set)return;for(const m of set){m.opacity=a;m.depthWrite=a>.99;if(m.uniforms?.uOpacity)m.uniforms.uOpacity.value=a;}}
  _render(time){
    this.frame=null;if(!this.active||document.hidden||this.disposed){this.lastTime=0;return;}
    const dt=Math.min((time-(this.lastTime||time-16))/1000,.04);this.lastTime=time;
    let focusMoving=false,hoverMoving=false;
    if(this.ready){
      if(this.revealed)this.enter=Math.min(1,this.enter+dt/.75);
      const target=this.selected>=0?1:0;
      this.focusProgress=this.reducedMotion||this.referenceMode?target:damp(this.focusProgress,target,dt);
      if(Math.abs(target-this.focusProgress)<.001)this.focusProgress=target;
      const entrance=this.reducedMotion||this.referenceMode?1:1-Math.pow(1-this.enter,4),contact=this.contactProgress;
      const contactFade=Math.pow(1-contact,1.35),scale=(1-.10*this.focusProgress)*(1-.62*contact);
      const backgroundOpacity=entrance*(1-this.focusProgress)*contactFade;
      this.home.visible=backgroundOpacity>.0001;
      this.home.position.set(.65*contact,(1-entrance)*-.18+.25*this.focusProgress-contact,-4*this.focusProgress-14*contact);
      this.home.rotation.set(.035*contact,-.035*contact,0);this.home.scale.setScalar(scale);
      this._opacity(this.homeMaterials,backgroundOpacity);
      for(let i=0;i<this.tvs.length;i++){
        const tv=this.tvs[i],m=this.media[i];tv.screenMaterial.uniforms.uMap.value=this.reducedMotion?m.poster:m.texture;
        tv.screenMaterial.uniforms.uPower.value=entrance;tv.screenMaterial.uniforms.uHover.value=i===this.hovered?1:0;
        const turn=!this.reducedMotion&&!this.referenceMode&&this.contactProgress<=.01&&i===this.hovered?.012:0;
        tv.group.rotation.y=this.reducedMotion||this.referenceMode?turn:damp(tv.group.rotation.y,turn,dt,10);
        if(Math.abs(tv.group.rotation.y-turn)<.00001)tv.group.rotation.y=turn;else hoverMoving=true;
      }
      const cameraMoving=this.cameraFlight.update(dt,this.reducedMotion||this.referenceMode);
      focusMoving=this._updateFocusUnits(dt,entrance,contactFade)||this.focusProgress!==target||cameraMoving;
    }
    this.renderer.render(this.scene,this.camera);
    const videosPlaying=this.contactProgress<.999&&!this.reducedMotion&&!this.referenceMode&&this.media.some(m=>m.video&&!m.video.paused&&!m.video.ended);
    if(focusMoving||hoverMoving||(this.revealed&&this.enter<1)||videosPlaying)this._requestFrame();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.active=false;if(this.frame)cancelAnimationFrame(this.frame);
    this.canvas.removeEventListener('pointermove',this.handleMove);this.canvas.removeEventListener('pointerleave',this.handleLeave);
    this.canvas.removeEventListener('click',this.handleClick);this.canvas.removeEventListener('webglcontextlost',this.handleContextLoss);
    window.removeEventListener('resize',this.handleResize);document.removeEventListener('visibilitychange',this.handleVisibility);
    for(const m of this.media)if(m.video){m.video.pause();m.video.removeAttribute('src');m.video.load();}
    const gs=new Set(),ms=new Set();this.scene.traverse(n=>{if(n.geometry)gs.add(n.geometry);if(n.material)for(const m of(Array.isArray(n.material)?n.material:[n.material]))ms.add(m);});
    gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());this.resources.forEach(r=>r.dispose());this.renderer.dispose();
    this.focusUnits=[];this.focusedUnit=null;
  }
}
