import * as THREE from 'three';
import { makeTelevisionFinishes } from './physical-finishes.js?v=20261111-details-final2';
import { BOTTOM_TV_SPECS, buildBottomTelevision } from './physical-bottom.js?v=20261111-details-final2';

// All dimensions are physical model units. The complete set rests at local
// Y=0, faces +Z, and extends behind its front plane into negative Z.
// These models contain no photographic texture or camera-projected geometry.
export const PHYSICAL_TV_SPECS = [
  { name:'gold-portable',brand:'NATIONAL',dimensions:{width:1.80,height:1.60,depth:1.14},screen:{width:1.35,height:1.03,x:0,y:.91,radius:.062},panel:{width:1.59,height:1.28,x:0,y:.91,radius:.055},radius:.095,bevel:.036,taper:.88,color:0x9d8250,finish:'gold',recess:.092,baseLift:.032 },
  { name:'silver-polystar',brand:'POLYSTAR',dimensions:{width:2.20,height:1.85,depth:1.16},screen:{width:1.87,height:1.264,x:0,y:1.095,radius:.045},panel:{width:2.06,height:1.43,x:0,y:1.095,radius:.026},radius:.045,bevel:.025,taper:.87,color:0xb5afa1,finish:'silver',recess:.105,wideRim:true,baseLift:.035 },
  { name:'gold-two-dial',brand:'GOLDSTAR',dimensions:{width:1.88,height:1.60,depth:1.23},screen:{width:1.13,height:.87,x:-.245,y:1.00,radius:.052},panel:{width:1.76,height:1.15,x:0,y:.975,radius:.040},radius:.105,bevel:.034,taper:.86,color:0xa38a51,finish:'gold',recess:.10,baseLift:.034 },
  { name:'red-top-controls',brand:'PHILIPS',dimensions:{width:1.95,height:1.75,depth:1.25},screen:{width:1.57,height:1.06,x:-.025,y:.76,radius:.085},panel:{width:1.77,height:1.28,x:-.015,y:.77,radius:.090},radius:.125,bevel:.045,taper:.83,color:0xa63118,finish:'red',recess:.104,topSlope:.67 },
  { name:'brown-metal-control',brand:'PANASONIC',dimensions:{width:2.18,height:1.83,depth:1.23},screen:{width:1.91,height:1.21,x:0,y:1.105,radius:.080},panel:{width:2.08,height:1.35,x:0,y:1.113,radius:.040},radius:.055,bevel:.026,taper:.85,color:0x393127,finish:'brown',recess:.125,baseLift:.034 },
  { name:'cream-button-bank',brand:'JVC',dimensions:{width:2.18,height:1.72,depth:1.24},screen:{width:1.49,height:.945,x:-.23,y:1.025,radius:.060},panel:{width:2.02,height:1.21,x:0,y:1.035,radius:.055},radius:.115,bevel:.040,taper:.86,color:0xb5a16a,finish:'cream',recess:.108,baseLift:.034 },
  { name:'silver-late-crt',brand:'SAMSUNG',dimensions:{width:2.15,height:1.90,depth:1.42},screen:{width:1.75,height:1.18,x:0,y:1.17,radius:.075},panel:{width:1.91,height:1.40,x:0,y:1.17,radius:.060},radius:.075,bevel:.030,taper:.71,color:0xaaa9a1,finish:'silver',recess:.072,bezelMargin:.025,bottomInset:.055,baseLift:.025 },
  BOTTOM_TV_SPECS[7],
  BOTTOM_TV_SPECS[8],
  BOTTOM_TV_SPECS[9],
];

const TAU=Math.PI*2,clamp=THREE.MathUtils.clamp;
const geometryCache=new Map();
function roundedLoop(width,height,radius,z=0,x=0,y=0,segments=16,edgeSteps=5){
  const r=Math.min(Math.max(.000001,Math.min(width,height)/2-.000001),Math.max(.000001,radius)),out=[];
  const corners=[[-width/2+r,height/2-r,Math.PI/2],[-width/2+r,-height/2+r,Math.PI],[width/2-r,-height/2+r,Math.PI*1.5],[width/2-r,height/2-r,0]];
  for(let corner=0;corner<4;corner++){
    const [cx,cy,a]=corners[corner];
    for(let i=0;i<=segments;i++){const angle=a+i*Math.PI/2/segments;out.push([x+cx+Math.cos(angle)*r,y+cy+Math.sin(angle)*r,z]);}
    const end=out[out.length-1],[nx,ny,na]=corners[(corner+1)%4],next=[x+nx+Math.cos(na)*r,y+ny+Math.sin(na)*r];
    for(let i=1;i<edgeSteps;i++)out.push([THREE.MathUtils.lerp(end[0],next[0],i/edgeSteps),THREE.MathUtils.lerp(end[1],next[1],i/edgeSteps),z]);
  }
  return out;
}

class SolidGeometry{
  constructor(){this.positions=[];this.uv=[];this.indices=[];this.groups=[];}
  point(p,u=0,v=0){const index=this.positions.length/3;this.positions.push(...p);this.uv.push(u,v);return index;}
  strip(rings,material=0,reverse=false){
    const count=rings[0].length,start=this.indices.length,base=this.positions.length/3;
    rings.forEach((ring,j)=>ring.forEach((p,i)=>this.point(p,i/count,j/(rings.length-1))));
    for(let j=0;j<rings.length-1;j++)for(let i=0;i<count;i++){
      const a=base+j*count+i,b=base+j*count+(i+1)%count,c=a+count,d=b+count;
      if(reverse)this.indices.push(a,c,b,b,c,d);else this.indices.push(a,b,c,b,d,c);
    }
    this.groups.push({start,count:this.indices.length-start,materialIndex:material});return this;
  }
  cap(loop,material=0,reverse=false,apex=null){
    const start=this.indices.length,centre=apex||loop.reduce((a,p)=>a.map((v,i)=>v+p[i]/loop.length),[0,0,0]);
    const c=this.point(centre,.5,.5),base=this.positions.length/3;
    const xs=loop.map(p=>p[0]),ys=loop.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),width=Math.max(...xs)-minX,height=Math.max(...ys)-minY;
    // Tooling grain on a flat fascia must stay planar; a radial fan UV creates
    // triangular bump/tangent discontinuities across an otherwise flat plate.
    loop.forEach(p=>this.point(p,(p[0]-minX)/Math.max(width,1e-8),(p[1]-minY)/Math.max(height,1e-8)));
    for(let i=0;i<loop.length;i++){const a=base+i,b=base+(i+1)%loop.length;if(reverse)this.indices.push(c,b,a);else this.indices.push(c,a,b);}
    this.groups.push({start,count:this.indices.length-start,materialIndex:material});return this;
  }
  finish(){
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));g.setIndex(this.indices);
    for(const group of this.groups)g.addGroup(group.start,group.count,group.materialIndex);
    g.computeVertexNormals();
    // Separate material sections share a physical edge. Average their normals
    // there so molded fillets reflect a continuous studio softbox, not seams.
    const normals=g.attributes.normal,position=g.attributes.position,weld=new Map();
    for(let i=0;i<position.count;i++){
      const key=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>Math.round(v*1e6)).join(',');
      if(!weld.has(key))weld.set(key,{indices:[],normal:new THREE.Vector3()});const item=weld.get(key);item.indices.push(i);item.normal.add(new THREE.Vector3().fromBufferAttribute(normals,i));
    }
    for(const item of weld.values()){
      // Preserve tooling creases between stepped moldings. Welding every
      // coincident normal used to turn chamfered CRT frames into soft pillows.
      for(const i of item.indices){
        const reference=new THREE.Vector3().fromBufferAttribute(normals,i),sum=new THREE.Vector3();
        for(const j of item.indices){const candidate=new THREE.Vector3().fromBufferAttribute(normals,j);if(reference.dot(candidate)>.99999)sum.add(candidate);}
        sum.normalize();normals.setXYZ(i,sum.x,sum.y,sum.z);
      }
    }
    g.computeBoundingBox();g.computeBoundingSphere();return g;
  }
}

function mesh(group,geometry,material,name,x=0,y=0,z=0){
  const object=new THREE.Mesh(geometry,material);object.name=name;object.position.set(x,y,z);object.castShadow=true;object.receiveShadow=true;group.add(object);return object;
}

function physicalGrainUV(geometry,scale=.27){
  // A physical-size box unwrap makes the ABS stipple continuous across each
  // machined face. Loft/perimeter UVs made grain shrink/stretch on the bezel.
  const result=geometry.index?geometry.toNonIndexed():geometry.clone(),p=result.attributes.position,uv=result.attributes.uv;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3){
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);n.crossVectors(b.sub(a),c.sub(a));
    const axis=Math.abs(n.z)>=Math.abs(n.x)&&Math.abs(n.z)>=Math.abs(n.y)?2:Math.abs(n.x)>=Math.abs(n.y)?0:1;
    for(let j=i;j<i+3;j++)uv.setXY(j,(axis===0?-p.getZ(j):p.getX(j))*scale,(axis===1?-p.getZ(j):p.getY(j))*scale);
  }
  uv.needsUpdate=true;result.computeBoundingBox();result.computeBoundingSphere();return result;
}

function latheProfile(points,segments=48){
  const profile=points.map(p=>new THREE.Vector2(...p)).filter((p,i,a)=>!i||p.distanceToSquared(a[i-1])>1e-16);
  const g=new THREE.LatheGeometry(profile,segments),p=g.attributes.position,idx=g.index.array,clean=[];
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),cross=new THREE.Vector3();
  for(let i=0;i<idx.length;i+=3){a.fromBufferAttribute(p,idx[i]);b.fromBufferAttribute(p,idx[i+1]);c.fromBufferAttribute(p,idx[i+2]);if(cross.crossVectors(b.sub(a),c.sub(a)).lengthSq()>1e-20)clean.push(idx[i],idx[i+1],idx[i+2]);}
  g.setIndex(clean);g.rotateX(Math.PI/2);return g;
}

function roundedBox(width,height,depth,radius=.025,bevel=.008){
  const key=[width,height,depth,radius,bevel].join(':');
  if(geometryCache.has(key))return geometryCache.get(key);
  const b=Math.min(bevel,depth*.32,radius*.65,width*.12,height*.12),rings=[];
  const cornerSegments=Math.max(3,Math.min(10,Math.ceil(radius*100))),bevelSegments=3;
  for(let i=0;i<=bevelSegments;i++){const t=i/bevelSegments*Math.PI/2,expand=Math.sin(t)*b;rings.push(roundedLoop(width-2*b+2*expand,height-2*b+2*expand,radius-b+expand,depth/2-b+b*Math.cos(t),0,0,cornerSegments,1));}
  for(let i=0;i<=bevelSegments;i++){const t=i/bevelSegments*Math.PI/2,inset=(1-Math.cos(t))*b;rings.push(roundedLoop(width-2*inset,height-2*inset,radius-inset,-depth/2+b-b*Math.sin(t),0,0,cornerSegments,1));}
  const builder=new SolidGeometry();builder.strip(rings,0,true).cap(rings[0]).cap(rings[rings.length-1],0,true);
  const geometry=builder.finish();geometryCache.set(key,geometry);return geometry;
}

function box(group,material,name,x,y,z,width,height,depth,radius=.025,bevel=.008){return mesh(group,roundedBox(width,height,depth,radius,bevel),material,name,x,y,z);}
function cylinder(group,material,name,x,y,z,radius,depth,segments=40){
  const geometry=new THREE.CylinderGeometry(radius,radius,depth,segments,1);geometry.rotateX(Math.PI/2);
  return mesh(group,geometry,material,name,x,y,z);
}

function cabinet(group,spec,m){
  const {width:w,height:h,depth:d}=spec.dimensions,{x:sx,y:sy,width:sw,height:sh,radius:sr}=spec.screen,b=spec.bevel,r=spec.radius,cy=h/2;
  const contour=loop=>loop.map(([x,y,z])=>{
    // The late CRT narrows towards its lower chassis; the red portable has a
    // real backward-raked upper control console, rather than a flat sticker.
    const inset=spec.bottomInset?spec.bottomInset*Math.pow(1-y/h,2):0;
    return[x*(1-inset),y,z-(spec.topSlope||0)*Math.max(0,y-h*.77)];
  });
  const front=contour(roundedLoop(w-2*b,h-2*b,Math.max(.012,r-b),0,0,cy)),bodyRings=[];
  for(let i=0;i<=6;i++){const t=i/6*Math.PI/2,e=Math.sin(t)*b;bodyRings.push(contour(roundedLoop(w-2*b+2*e,h-2*b+2*e,Math.max(.012,r-b+e),-b+b*Math.cos(t),0,cy)));}
  bodyRings.push(contour(roundedLoop(w*.996,h*.996,r*.99,-d*.14,0,cy)));
  bodyRings.push(roundedLoop(w*.985,h*.985,r*.98,-d*.35,0,cy+.004));
  const rw=w*spec.taper,rh=h*spec.taper,rr=Math.max(.035,r*.80),rb=Math.min(b*.7,rr*.6);
  bodyRings.push(roundedLoop(rw,rh,rr,-d+rb,0,cy+h*.012));
  for(let i=1;i<=5;i++){const t=i/5*Math.PI/2,e=(1-Math.cos(t))*rb;bodyRings.push(roundedLoop(rw-2*e,rh-2*e,Math.max(.012,rr-e),-d+rb-rb*Math.sin(t),0,cy+h*.012));}
  const p=spec.panel||{width:sw+.20,height:sh+.20,x:sx,y:sy,radius:sr+.025};
  const panelContour=ring=>ring.map(([x,y,z])=>[x,y,z-(spec.topSlope||0)*Math.max(0,y-h*.77)]);
  const panelOuter=panelContour(roundedLoop(p.width,p.height,p.radius,.006,p.x,p.y));
  const panelEdge=panelContour(roundedLoop(p.width-.020,p.height-.020,Math.max(.012,p.radius-.008),.013,p.x,p.y));
  const panelInner=panelContour(roundedLoop(p.width-.043,p.height-.043,Math.max(.010,p.radius-.016),-.004,p.x,p.y));
  const clearance=Math.min(p.width/2-Math.abs(sx-p.x)-sw/2,p.height/2-Math.abs(sy-p.y)-sh/2);
  const margin=Math.max(.008,Math.min(spec.bezelMargin||(spec.wideRim?.065:.041),clearance-.025));
  const lipOuter=roundedLoop(sw+2*margin,sh+2*margin,sr+Math.min(margin,.035),-.002,sx,sy);
  const lipCrest=roundedLoop(sw+2*margin-.012,sh+2*margin-.012,sr+Math.min(margin,.035)-.006,.004,sx,sy);
  const throatMargin=Math.min(.007,Math.max(.0008,margin-.007));
  const throat=roundedLoop(sw+2*throatMargin,sh+2*throatMargin,sr+throatMargin,-.025,sx,sy);
  const aperture=roundedLoop(sw,sh,sr,-(spec.recess||.10),sx,sy),cavity=roundedLoop(sw,sh,sr,-(spec.recess||.10)-.055,sx,sy);
  const g=new SolidGeometry();
  // Separate moldings and hard, stepped bezel edges survive the close-up.
  g.strip(bodyRings.slice(0,9),0,true).strip(bodyRings.slice(8),1,true).cap(bodyRings[bodyRings.length-1],1,true);
  g.strip([front,panelOuter],2).strip([panelOuter,panelEdge],3).strip([panelEdge,panelInner],5);
  g.strip([panelInner,lipOuter],5).strip([lipOuter,lipCrest],3).strip([lipCrest,throat],spec.wideRim?5:4).strip([throat,aperture],4).strip([aperture,cavity],4).cap(cavity,4);
  const face=(spec.finish==='red'||spec.finish==='brown')?m.dark:spec.finish==='silver'?m.silver:m.body;
  const shellGeometry=g.finish(),mapped=physicalGrainUV(shellGeometry);shellGeometry.dispose();
  mesh(group,mapped,[m.body,m.rear,face,spec.finish==='silver'?m.silver:m.trim,m.dark,spec.finish==='silver'?m.silver:m.dark],'closed-cabinet-with-stepped-inset-bezel');
  // A genuine split line separates the moulded front shell from its rear half.
  const seam=new SolidGeometry(),seamW=w*.986,seamH=h*.986;
  seam.strip([roundedLoop(seamW,seamH,r*.98,-d*.347,0,cy+.004),roundedLoop(seamW,seamH,r*.98,-d*.353,0,cy+.004)],0,true);
  mesh(group,seam.finish(),m.rubber,'front-to-rear-cabinet-parting-line');
  return {aperture,screenZ:-(spec.recess||.10)+.0008};
}

function glassGeometry(screen,z,bulge=.052){
  const loop=roundedLoop(screen.width,screen.height,screen.radius,z,screen.x,screen.y,16),g=new SolidGeometry(),rings=[];
  for(let j=0;j<20;j++){const t=1-j/20;rings.push(loop.map(([x,y])=>[screen.x+(x-screen.x)*t,screen.y+(y-screen.y)*t,z+bulge*(1-t*t)]));}
  g.strip(rings).cap(rings[rings.length-1],0,false,[screen.x,screen.y,z+bulge]);
  const geometry=g.finish(),position=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<position.count;i++)uv.setXY(i,(position.getX(i)-screen.x)/screen.width+.5,(position.getY(i)-screen.y)/screen.height+.5);
  uv.needsUpdate=true;return geometry;
}

const FONT={
  A:'01110/10001/10001/11111/10001/10001/10001',B:'11110/10001/10001/11110/10001/10001/11110',C:'01111/10000/10000/10000/10000/10000/01111',D:'11110/10001/10001/10001/10001/10001/11110',E:'11111/10000/10000/11110/10000/10000/11111',F:'11111/10000/10000/11110/10000/10000/10000',G:'01111/10000/10000/10111/10001/10001/01111',H:'10001/10001/10001/11111/10001/10001/10001',I:'11111/00100/00100/00100/00100/00100/11111',J:'00111/00010/00010/00010/10010/10010/01100',K:'10001/10010/10100/11000/10100/10010/10001',L:'10000/10000/10000/10000/10000/10000/11111',M:'10001/11011/10101/10101/10001/10001/10001',N:'10001/11001/10101/10011/10001/10001/10001',O:'01110/10001/10001/10001/10001/10001/01110',P:'11110/10001/10001/11110/10000/10000/10000',Q:'01110/10001/10001/10001/10101/10010/01101',R:'11110/10001/10001/11110/10100/10010/10001',S:'01111/10000/10000/01110/00001/00001/11110',T:'11111/00100/00100/00100/00100/00100/00100',U:'10001/10001/10001/10001/10001/10001/01110',V:'10001/10001/10001/10001/10001/01010/00100',W:'10001/10001/10001/10101/10101/11011/10001',X:'10001/10001/01010/00100/01010/10001/10001',Y:'10001/10001/01010/00100/00100/00100/00100',Z:'11111/00001/00010/00100/01000/10000/11111',
  0:'01110/10001/10011/10101/11001/10001/01110',1:'00100/01100/00100/00100/00100/00100/01110',2:'01110/10001/00001/00010/00100/01000/11111',3:'11110/00001/00001/01110/00001/00001/11110',4:'00010/00110/01010/10010/11111/00010/00010',5:'11111/10000/10000/11110/00001/00001/11110',6:'01110/10000/10000/11110/10001/10001/01110',7:'11111/00001/00010/00100/01000/01000/01000',8:'01110/10001/10001/01110/10001/10001/01110',9:'01110/10001/10001/01111/00001/00001/01110',
  '-':'00000/00000/00000/11111/00000/00000/00000','/':'00001/00001/00010/00100/01000/10000/10000',':':'00000/00100/00100/00000/00100/00100/00000','.':'00000/00000/00000/00000/00000/00100/00100','+':'00000/00100/00100/11111/00100/00100/00000',
};

function label(group,text,x,y,z,height=.033,color=0xbcb9a8,resources=null){
  const scale=4,padding=4,width=Math.max(1,text.length*6-1)*scale+padding*2,h=7*scale+padding*2,data=new Uint8Array(width*h*4);
  for(let c=0;c<text.length;c++){
    const rows=FONT[text[c].toUpperCase()]?.split('/');if(!rows)continue;
    for(let gy=0;gy<7;gy++)for(let gx=0;gx<5;gx++)if(rows[gy][gx]==='1')for(let yy=0;yy<scale;yy++)for(let xx=0;xx<scale;xx++){
      const px=padding+c*6*scale+gx*scale+xx,py=padding+(6-gy)*scale+yy,i=(py*width+px)*4;data[i]=data[i+1]=data[i+2]=data[i+3]=255;
    }
  }
  const texture=new THREE.DataTexture(data,width,h,THREE.RGBAFormat);texture.name=`Own printed lettering: ${text}`;texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  resources?.add(texture);
  const material=new THREE.MeshStandardMaterial({map:texture,color,transparent:true,alphaTest:.2,roughness:.78,metalness:.05,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const object=mesh(group,new THREE.PlaneGeometry(height*width/h,height),material,`printed-${text}`,x,y,z);object.castShadow=false;return object;
}

function fixture(parent,name,x,y,z,normal=new THREE.Vector3(0,0,1)){
  const group=new THREE.Group();group.name=name;group.position.set(x,y,z);group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal.clone().normalize());parent.add(group);return group;
}

function screw(parent,m,x,y,z,size=.012){
  const g=fixture(parent,'recessed-cross-head-screw',x,y,z);
  cylinder(g,m.chrome,'screw-head',0,0,0,size,.009,20);
  box(g,m.rubber,'screw-slot-a',0,0,.005,size*1.25,size*.19,.0015,.001,.0003);
  box(g,m.rubber,'screw-slot-b',0,0,.005,size*.19,size*1.25,.0015,.001,.0003);g.traverse(n=>{if(n.isMesh)n.castShadow=false;});return g;
}

function dial(parent,m,x,y,radius,options={}){
  const depth=options.depth||.065,g=fixture(parent,options.name||'machined-tuning-dial',x,y,options.z??.012);
  cylinder(g,m.dark,'dial-shaft-shadow',0,0,.006,radius*1.06,.025);
  const profile=[[0,.01],[radius*.78,.01],[radius*.95,.018],[radius,Math.min(.030,depth*.45)],[radius,depth],[radius*.91,depth+.012],[radius*.73,depth+.016],[0,depth+.018]];
  mesh(g,latheProfile(profile,64),m.dark,'beveled-knurled-dial');
  const ring=new THREE.TorusGeometry(radius*.94,.0045,8,64);mesh(g,ring,m.chrome,'fine-machined-dial-rim',0,0,depth+.009);
  const ribGeometry=roundedBox(radius*.055,radius*.11,depth*.55,.002,.0007),ribs=new THREE.InstancedMesh(ribGeometry,m.rear,48),matrix=new THREE.Matrix4(),q=new THREE.Quaternion();
  for(let i=0;i<48;i++){const a=i*TAU/48;q.setFromAxisAngle(new THREE.Vector3(0,0,1),a-Math.PI/2);matrix.compose(new THREE.Vector3(Math.cos(a)*radius*.995,Math.sin(a)*radius*.995,depth*.56),q,new THREE.Vector3(1,1,1));ribs.setMatrixAt(i,matrix);}
  ribs.name='forty-eight-physical-knurl-ridges';ribs.castShadow=true;ribs.receiveShadow=true;ribs.instanceMatrix.needsUpdate=true;g.add(ribs);
  const a=options.angle??.62;
  if(options.paddle!==false){const grip=box(g,m.dark,'raised-tuning-paddle',0,0,depth+.028,radius*1.34,radius*.31,.031,radius*.10,.005);grip.rotation.z=a;}
  const marker=box(g,m.silver,'dial-index-mark',Math.sin(a)*radius*.53,Math.cos(a)*radius*.53,depth+.046,.005,radius*.26,.002,.0015,.0004);marker.rotation.z=-a;
  const ticks=new THREE.InstancedMesh(new THREE.BoxGeometry(.003,.010,.0015),m.silver,12);
  for(let i=0;i<12;i++){const angle=i*TAU/12;q.setFromAxisAngle(new THREE.Vector3(0,0,1),-angle);matrix.compose(new THREE.Vector3(Math.sin(angle)*radius*1.16,Math.cos(angle)*radius*1.16,.017),q,new THREE.Vector3(1,1,1));ticks.setMatrixAt(i,matrix);}
  ticks.name='engraved-tuning-scale-ticks';ticks.instanceMatrix.needsUpdate=true;g.add(ticks);
  return g;
}

function button(parent,m,x,y,radius=.022,options={}){
  const g=fixture(parent,options.name||'push-button',x,y,options.z??.011);
  const tiny=radius<.035,finish=material=>{
    if(!tiny)return material;
    const copy=material.clone();copy.bumpMap=null;copy.roughnessMap=null;copy.map=null;return copy;
  };
  cylinder(g,finish(m.rubber),'button-recess',0,0,.003,radius*1.18,.012,24);
  const profile=[[0,.006],[radius*.92,.006],[radius,.012],[radius,.020],[radius*.86,.026],[0,.027]];
  mesh(g,latheProfile(profile,32),finish(options.metal?m.chrome:m.dark),'radiused-mechanical-button-cap');
  if(tiny)g.traverse(n=>{if(n.isMesh){n.castShadow=false;n.receiveShadow=false;}});
  return g;
}

function grille(parent,m,x,y,z,width,height,options={}){
  const g=fixture(parent,options.name||'recessed-speaker-grille',x,y,z,options.normal||new THREE.Vector3(0,0,1));
  box(g,m.rubber,'dark-acoustic-cavity',0,0,-.007,width,height,.028,Math.min(.025,height*.13),.004);
  const pitch=options.pitch||.017,rows=Math.max(3,Math.floor(height/pitch)),barHeight=Math.min(pitch*.36,.007),barMaterial=options.material||m.rear;
  const instances=new Map();
  for(let i=0;i<rows;i++){
    const yy=(i-(rows-1)/2)*pitch,edge=Math.abs(yy)/(height/2),length=width-(edge>.87?.025:0);
    if(!instances.has(length))instances.set(length,[]);instances.get(length).push(yy);
  }
  for(const [length,positions]of instances){
    const bars=new THREE.InstancedMesh(roundedBox(length,barHeight,.015,barHeight*.45,.0015),barMaterial,positions.length),matrix=new THREE.Matrix4();
    positions.forEach((yy,i)=>bars.setMatrixAt(i,matrix.makeTranslation(0,yy,.012)));
    bars.name='individual-formed-vent-lamellae';bars.castShadow=true;bars.receiveShadow=true;bars.instanceMatrix.needsUpdate=true;g.add(bars);
  }
  return g;
}

function perforatedGrille(parent,m,x,y,z,width,height,options={}){
  const g=fixture(parent,options.name||'perforated-metal-acoustic-panel',x,y,z,options.normal||new THREE.Vector3(0,0,1));
  box(g,m.rubber,'acoustic-felt-behind-real-openings',0,0,-.008,width,height,.010,.008,.002);
  const pitch=options.pitch||.015,columns=Math.max(2,Math.floor(width/pitch)),rows=Math.max(2,Math.floor(height/pitch));
  const cw=width/columns,ch=height/rows,r=Math.min(cw,ch)*.30;
  // Each repeated metal tile has a real circular opening and a short inner
  // wall; the dark acoustic felt is behind it, rather than painted on top.
  const b=new SolidGeometry(),outer=[],inner=[],back=[];
  for(let k=0;k<16;k++){
    const a=k*TAU/16,dx=Math.cos(a),dy=Math.sin(a),s=1/Math.max(Math.abs(dx),Math.abs(dy));
    outer.push([dx*s*cw/2,dy*s*ch/2,0]);inner.push([dx*r,dy*r,0]);back.push([dx*r,dy*r,-.005]);
  }
  b.strip([outer,inner],0).strip([inner,back],0);
  const sheet=(options.material||m.silver).clone();sheet.name='Satin perforated sheet — geometric microdetail';
  // The real holes already carry relief. A second 256px bump map repeated on
  // every tiny tile would magnify nanoscopic grain into unstable dark spikes.
  sheet.bumpMap=null;sheet.roughnessMap=null;sheet.map=null;sheet.roughness=Math.max(.52,sheet.roughness);
  const cells=new THREE.InstancedMesh(b.finish(),sheet,columns*rows),matrix=new THREE.Matrix4();let i=0;
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    matrix.makeTranslation((column+.5)*cw-width/2,(row+.5)*ch-height/2,.004);cells.setMatrixAt(i++,matrix);
  }
  // Sub-millimetre perforations are below the studio shadow-map texel size;
  // their actual openings/felt provide depth without unstable self-shadow dots.
  cells.name='metal-perforations-with-physical-hole-walls';cells.castShadow=false;cells.receiveShadow=false;cells.instanceMatrix.needsUpdate=true;g.add(cells);
  return g;
}

function circularGrille(parent,m,x,y,z,radius,normal){
  const g=fixture(parent,'circular-side-speaker',x,y,z,normal);
  cylinder(g,m.rubber,'speaker-acoustic-recess',0,0,-.013,radius,.025,48);
  mesh(g,new THREE.TorusGeometry(radius*.985,.006,6,64),m.rear,'speaker-molded-edge');
  const pitch=.020,entries=[];
  for(let axis=0;axis<2;axis++)for(let v=-radius+.018;v<radius-.018;v+=pitch){
    const length=Math.sqrt(Math.max(0,radius*radius-v*v))*2-.016;
    if(length<=0)continue;
    entries.push({position:new THREE.Vector3(axis?v:0,axis?0:v,axis?.013:.009),scale:new THREE.Vector3(axis?.005:length,axis?length:.005,.008)});
  }
  const bars=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),m.rear,entries.length),matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion();
  entries.forEach((entry,i)=>bars.setMatrixAt(i,matrix.compose(entry.position,quaternion,entry.scale)));
  bars.name='physical-woven-speaker-grid';bars.castShadow=true;bars.receiveShadow=true;bars.instanceMatrix.needsUpdate=true;bars.userData.realSpeakerOpenings=true;g.add(bars);
  return g;
}

function rearHardware(group,spec,m,resources,index){
  const {width:w,height:h,depth:d}=spec.dimensions,back=fixture(group,'serviceable-rear-cover',0,h*.52,-d-.009,new THREE.Vector3(0,0,-1)),rw=w*spec.taper*.82,rh=h*.62;
  box(back,m.rear,'beveled-rear-access-panel',0,0,0,rw,rh,.027,Math.min(.075,spec.radius*.6),.008);
  grille(back,m,0,rh*.28,.017,rw*.84,rh*.23,{pitch:.019,name:'rear-upper-cooling-louvres',material:m.rear});
  grille(back,m,0,rh*.02,.017,rw*.84,rh*.15,{pitch:.018,name:'rear-lower-cooling-louvres',material:m.rear});
  for(const x of[-rw*.43,rw*.43])for(const y of[-rh*.40,rh*.40])screw(back,m,x,y,.021,.012);
  label(back,spec.brand,0,-rh*.15,.020,.041,0xaaa897,resources);
  label(back,`MODEL ${1980+index} / RERUN`,0,-rh*.24,.020,.023,0x8e9085,resources);
  const py=-rh*.37;
  box(back,m.rubber,'recessed-io-connector-panel',0,py,.020,rw*.76,.112,.027,.012,.003);
  for(let i=0;i<3;i++){
    const x=-rw*.24+i*.11,insulator=new THREE.MeshStandardMaterial({color:[0xc2ba91,0xa34134,0xd4b050][i],roughness:.42,metalness:.02});
    cylinder(back,m.chrome,'rca-socket-barrel',x,py,.047,.026,.020,24);
    cylinder(back,insulator,'rca-insulating-ring',x,py,.060,.019,.009,24);
    cylinder(back,m.rubber,'rca-socket-opening',x,py,.066,.009,.003,20);
  }
  box(back,m.dark,'rectangular-multi-pin-socket',rw*.22,py,.042,.17,.070,.026,.012,.003);
  for(let i=0;i<6;i++)box(back,m.brass,'real-connector-pin',rw*.22+(i-2.5)*.022,py,.057,.008,.025,.008,.001,.0005);
  if(index===8)return;
  const t=(.62-.35)/(.65-spec.bevel*.7/d),sideX=w*.5*THREE.MathUtils.lerp(.985,spec.taper,t),dx=(w*.985-w*spec.taper)/2/(d*.65-spec.bevel*.7);
  for(const sign of[-1,1]){
    if(index===7&&sign===1)continue;
    grille(group,m,sign*(sideX+.004),h*.51,-d*.62,d*.44,h*.34,{pitch:.021,material:m.rear,normal:new THREE.Vector3(sign,0,-dx),name:'side-cooling-vent-array'});
  }
}

function frontControls(group,spec,m,resources,index){
  const print=(text,x,y,size=.032,color=0xc0bcaa,z=.012)=>label(group,text,x,y,z,size,color,resources);
  if(index===0){
    print(spec.brand,-.45,.310,.024,0xb6ac91);
    print('SOLID STATE COLOR',.37,.310,.012,0x9d977e);
    box(group,m.dark,'recessed-long-power-window',-.36,.115,.009,.66,.049,.025,.014,.004);
    box(group,m.amber,'warm-tally-light',-.36,.115,.025,.61,.018,.008,.007,.002);
    box(group,m.dark,'lower-chassis-seam',0,.048,.006,1.59,.015,.017,.004,.001);
    for(const x of[-.72,.72])screw(group,m,x,.292,.013,.009);
  }else if(index===1){
    box(group,m.silver,'separate-brushed-lower-fascia',0,.186,.007,2.04,.273,.026,.009,.004);
    box(group,m.dark,'horizontal-tuning-scale-recess',0,.367,.009,2.04,.024,.017,.005,.002);
    box(group,m.brass,'small-brand-badge',0,.402,.012,.25,.035,.009,.004,.002);
    print(spec.brand,0,.402,.018,0x1c211b,.018);
    perforatedGrille(group,m,-.78,.183,.023,.56,.165,{pitch:.013,material:m.silver});
    perforatedGrille(group,m,.78,.183,.023,.56,.165,{pitch:.013,material:m.silver});
    for(const x of[-.36,-.16,.04])button(group,m,x,.205,.017,{metal:false,z:.025});
    for(const [x,y,r]of[[.25,.25,.019],[.34,.20,.020],[.25,.14,.019],[.17,.205,.027]])button(group,m,x,y,r,{metal:false,z:.025});
    for(const x of[-.40,-.34])button(group,m,x,.108,.008,{z:.025});
    print('VOLUME     COLOUR    TUNING',-.01,.280,.012,0x545449,.026);
    print('ELECTRONIC COLOR',0,.097,.011,0x595b50,.026);
    for(const x of[-.995,.995])screw(group,m,x,.075,.026,.007);
  }else if(index===2){
    box(group,m.trim,'dial-bank-divider',.425,1.005,.006,.014,1.03,.018,.003,.001);
    dial(group,m,.655,1.305,.100,{angle:.4,z:.002});dial(group,m,.655,.978,.093,{angle:1.05,z:.002});
    grille(group,m,.651,.613,.003,.303,.269,{pitch:.014,material:m.dark});
    print('VHF',.65,1.455,.016,0xa8a68e);print('UHF',.65,1.117,.015,0xa8a68e);
    box(group,m.body,'separate-cream-lower-control-molding',0,.160,.011,1.69,.205,.055,.025,.006);
    perforatedGrille(group,m,-.56,.166,.042,.30,.063,{pitch:.012,material:m.dark});
    button(group,m,-.19,.16,.015,{z:.041});
    for(const x of[.10,.32,.54,.75])dial(group,m,x,.16,.031,{depth:.030,z:.041,angle:.55,paddle:true});
    print(spec.brand,-.39,.304,.022,0xb4ad95);
    print('COLOUR',.42,.246,.011,0x3d3d2d,.043);
    for(const x of[-.82,.82])screw(group,m,x,.397,.006,.008);
    const handle=fixture(group,'right-side-carrying-handle',.965,1.15,-.36,new THREE.Vector3(1,0,0));
    box(handle,m.dark,'handle-recess',0,0,0,.35,.57,.036,.035,.007);
    box(handle,m.body,'carry-handle-grip',0,0,.035,.12,.48,.060,.035,.010);
  }else if(index===3){
    const console=fixture(group,'backward-raked-upper-control-console',0,1.551,-.133,new THREE.Vector3(0,spec.topSlope||.67,1));
    box(console,m.dark,'raised-service-fascia',0,0,0,1.70,.258,.028,.028,.006);
    dial(console,m,.365,0,.119,{angle:.64,z:.015,depth:.076});dial(console,m,.715,0,.092,{angle:1.13,z:.015,depth:.065});
    box(console,m.rubber,'horizontal-channel-scale',-.365,.055,.020,.56,.048,.012,.007,.003);
    box(console,m.chrome,'scale-top-rule',-.365,.068,.028,.48,.004,.002,.001,.0003);
    box(console,m.amber,'channel-scale-pointer',-.465,.052,.029,.017,.026,.004,.002,.0005);
    button(console,m,-.713,.006,.024,{z:.020});
    label(console,'VHF  UHF',.365,-.084,.021,.014,0x999d87,resources);
    label(console,'COLOR TELEVISION',-.37,-.073,.021,.012,0x7c806f,resources);
    for(const x of[-.78,.79])screw(console,m,x,.094,.018,.008);
    print(spec.brand,0,.098,.021,0xa8a38b);
  }else if(index===4){
    box(group,m.trim,'two-zone-brushed-lower-control-chassis',0,.223,.008,2.02,.315,.037,.012,.005);
    perforatedGrille(group,m,-.798,.213,.031,.365,.197,{pitch:.014,material:m.trim});
    box(group,m.silver,'vertical-channel-bank-rule',-.512,.227,.032,.012,.245,.012,.002,.001);
    for(let i=0;i<6;i++){button(group,m,-.55,.321-i*.038,.009,{metal:true,z:.033});print(String(i+1),-.606,.321-i*.038,.010,0x35362d,.034);}
    box(group,m.rubber,'system-selector-black-recess',-.28,.299,.034,.18,.045,.018,.009,.002);
    box(group,m.chrome,'small-slide-selector',-.31,.300,.047,.037,.021,.016,.004,.002);
    for(const x of[-.38,-.13,.12])dial(group,m,x,.157,.027,{z:.036,depth:.030,paddle:false});
    for(let i=0;i<8;i++)button(group,m,.27+i*.052,.151,.008,{metal:false,z:.035});
    dial(group,m,.835,.218,.099,{z:.033,angle:.68,depth:.057});
    print(spec.brand,0,.424,.022,0xb2ad98);
    print('PAL  SECAM  SYSTEM',-.17,.246,.012,0x35392e,.035);
    print('CONTRAST  COLOUR  VOLUME',-.12,.096,.010,0x404238,.035);
    for(const x of[-.97,.97])screw(group,m,x,.359,.033,.007);
  }else if(index===5){
    for(let i=0;i<7;i++){
      const y=1.495-i*.076;
      box(group,m.rubber,'button-bank-recess',.855,y,.006,.167,.054,.022,.008,.003);
      box(group,m.silver,'channel-preset-key',.855,y,.025,.113,.027,.028,.006,.003);
      print(String(i+1),.735,y,.010,0xa9aa95,.018);
    }
    grille(group,m,.854,.688,.003,.275,.335,{pitch:.014,material:m.dark});
    box(group,m.body,'lower-painted-controls-rail',0,.171,.011,1.98,.231,.049,.023,.006);
    box(group,m.rubber,'recessed-maker-label',-.685,.16,.039,.47,.080,.019,.008,.003);
    print(spec.brand,-.685,.16,.018,0xbab8a4,.051);
    button(group,m,-.18,.162,.016,{z:.037});
    for(const x of[.12,.37,.62,.84])dial(group,m,x,.163,.036,{depth:.033,z:.036,angle:.75});
    print('COLOR TELEVISION',-.49,.352,.017,0xb3ac92);
    for(const x of[-.95,.96])screw(group,m,x,.351,.016,.008);
  }else if(index===6){
    print(spec.brand,0,.477,.025,0x53574f);
    perforatedGrille(group,m,0,.230,.012,1.91,.288,{pitch:.016,material:m.silver});
    for(const x of[-.68,-.61,-.54,-.47,-.40])button(group,m,x,.256,.011,{z:.024});
    box(group,m.silver,'brushed-silver-receiver-inlay',.305,.253,.027,.679,.083,.020,.007,.003);
    box(group,m.dark,'narrow-infrared-receiver-slot',.305,.254,.040,.41,.017,.009,.004,.001);
    print('STEREO COLOR',.305,.254,.009,0x999988,.046);
    box(group,m.dark,'lower-removable-panel-seam',0,.070,.008,1.89,.010,.008,.003,.001);
  }
}

export function buildPhysicalTelevision(index){
  if(!Number.isInteger(index)||!PHYSICAL_TV_SPECS[index])throw new RangeError(`Unknown physical television ${index}`);
  const spec=PHYSICAL_TV_SPECS[index],group=new THREE.Group(),materials=makeTelevisionFinishes(spec,index),resources=new Set(materials.resources);
  if(index>=7)return buildBottomTelevision(index,{spec,materials,resources,helpers:{mesh,box,cylinder,fixture,grille,perforatedGrille,circularGrille,label,button,dial,glassGeometry,rearHardware,physicalGrainUV}});
  group.name=`Physical TV ${index+1} — ${spec.name}`;
  const lift=spec.baseLift||0,chassis=new THREE.Group();chassis.name='cabinet-and-service-chassis';chassis.position.y=lift;group.add(chassis);
  const shell=cabinet(chassis,spec,materials);
  const screen=mesh(chassis,glassGeometry(spec.screen,shell.screenZ,.052),materials.glass,'screen');screen.castShadow=false;screen.userData.screen=true;
  frontControls(chassis,spec,materials,resources,index);
  if(lift){
    const {width:w,depth:d}=spec.dimensions;
    box(group,materials.rear,'integrated-low-bottom-chassis',0,lift*.62,-d*.45,w*.90,lift*.76,d*.76,.028,.004);
    for(const x of[-w*.34,w*.34])for(const z of[-d*.16,-d*.72])box(group,materials.rubber,'low-radiused-rubber-support-pad',x,lift*.36,z,.15,lift*.72,.15,.040,.004);
  }
  rearHardware(chassis,spec,materials,resources,index);
  group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
  const screenAspect=spec.screen.width/spec.screen.height;
  group.userData={physicalTelevision:true,televisionIndex:index,family:spec.name,photographicTextures:false,canonicalFrontAxis:'+Z',supportY:0};
  const faceFrame={origin:new THREE.Vector3(spec.screen.x,spec.screen.y+lift,shell.screenZ),right:new THREE.Vector3(1,0,0),up:new THREE.Vector3(0,1,0),normal:new THREE.Vector3(0,0,1),width:size.x,height:size.y,screenWidth:spec.screen.width,screenHeight:spec.screen.height};
  return{group,screen,screenAspect,physicalScreenAspect:screenAspect,faceFrame,bounds,dimensions:{width:size.x,height:size.y,depth:size.z},supportY:0,resources,spec};
}

