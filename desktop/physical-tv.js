import * as THREE from 'three';
import { makeTelevisionFinishes, applyCabinetReflectance } from './physical-finishes.js?v=20261123-intro-depth-1';
import { BOTTOM_TV_SPECS, buildBottomTelevision } from './physical-bottom.js?v=20261123-intro-depth-1';
import { makePrintedMark, seatPrintedLabels } from './physical-labels.js?v=20261123-intro-depth-1';
import { applyPhysicalAO } from './physical-ao.js';
import { PHYSICAL_AO_DATA } from './physical-ao-data.js?v=20261123-intro-depth-1';

// All dimensions are physical model units. The complete set rests at local
// Y=0, faces +Z, and extends behind its front plane into negative Z.
// These models contain no photographic texture or camera-projected geometry.
export const PHYSICAL_TV_SPECS = [
  {
    name: 'gold-portable', brand: 'NATIONAL', dimensions: { width: 2.07, height: 1.60, depth: 1.71863 },
    screen: { width: 1.49201, height: .9934, x: 0.00069, y: .8732, radius: .046, bowX: .0399, bowY: .0412 },
    panel: { width: 1.8515, height: 1.278, x: 0.0, y: .876, radius: .092 },
    controlLayoutWidth: 1.15,
    radius: .126, bevel: .058, taper: .86, crown: .004, finish: 'gold', recess: .138, baseLift: .032,
    collar: .38, shellBow: .023, trimWidth: .086, glassBulge: .074,
  },
  {
    name: 'silver-polystar', brand: 'POLYSTAR', dimensions: { width: 2.378112, height: 1.85, depth: 1.08957 },
    screen: { width: 1.954592, height: 1.2391, x: -0.00281, y: 1.0613, radius: .0547, bowX: .0161, bowY: .0308 },
    panel: { width: 2.15111, height: 1.328, x: 0.004324, y: 1.074, radius: .018 },
    controlLayoutWidth: 1.08096,
    radius: .067, bevel: .030, taper: .87, crown: .026, finish: 'silver', recess: .126, baseLift: .035,
    collar: .30, shellBow: .011, trimWidth: .050, glassBulge: .069,
  },
  {
    name: 'gold-two-dial', brand: 'GOLDSTAR', dimensions: { width: 2.162, height: 1.60, depth: 1.57701 },
    screen: { width: 1.273625, height: .8605, x: -0.11339, y: .9617, radius: .052, bowX: .0347, bowY: .0495 },
    panel: { width: 1.978, height: 1.143, x: 0.0046, y: .957, radius: .074, lean: -.002 },
    controlLayoutWidth: 1.15,
    radius: .135, bevel: .057, taper: .79, crown: .004, finish: 'gold', recess: .145, baseLift: .034,
    collar: .42, shellBow: .036, plinth: .285, apronFall: .215, trimWidth: .084, glassBulge: .076, controlDivider: 0.61295,
  },
  {
    name: 'red-top-controls', brand: 'PHILIPS', dimensions: { width: 2.049957, height: 1.75, depth: 1.62138 },
    screen: { width: 1.621569, height: 1.0584, x: 0.015243, y: .7555, radius: .0877, bowX: .0724, bowY: .0697 },
    panel: { width: 1.871243, height: 1.39, x: 0.013666, y: .807, radius: .087 },
    controlLayoutWidth: 1.05126,
    radius: .188, bevel: .069, taper: .81, crown: .001, finish: 'red', recess: .078, topSlope: .78,
    collar: .44, shellBow: .034, trimWidth: .077, glassBulge: .057,
  },
  {
    name: 'brown-metal-control', brand: 'PANASONIC', dimensions: { width: 2.362793, height: 1.83, depth: 2.12269 },
    screen: { width: 1.963828, height: 1.1902, x: -0.016583, y: 1.1012, radius: .074, bowX: .0306, bowY: .085 },
    panel: { width: 2.23815, height: 1.367, x: 0.0, y: 1.102, radius: .079 },
    controlLayoutWidth: 1.08385,
    radius: .096, bevel: .046, taper: .76, crown: .003, finish: 'brown', recess: .152, baseLift: .034,
    collar: .39, shellBow: .026, trimWidth: .089, glassBulge: .085,
  },
  {
    name: 'cream-button-bank', brand: 'JVC', dimensions: { width: 2.507, height: 1.72, depth: 2.11499 },
    screen: { width: 1.37655, height: .9562, x: -0.1242, y: 1.0015, radius: .0712, bowX: .0205, bowY: .0563 },
    panel: { width: 2.27125, height: 1.257, x: 0.0023, y: .990, radius: .070, lean: -.003 },
    controlLayoutWidth: 1.15,
    radius: .145, bevel: .065, taper: .75, crown: .006, finish: 'cream', recess: .151, baseLift: .034,
    collar: .42, shellBow: .044, plinth: .275, apronFall: .151, trimWidth: .097, glassBulge: .085, controlDivider: 0.70495,
  },
  {
    name: 'silver-late-crt', brand: 'SAMSUNG', dimensions: { width: 2.461, height: 1.88, depth: 1.91215 },
    screen: { width: 1.9642, height: 1.2181, x: 0.025185, y: 1.1515, radius: .0326, bowX: .012, bowY: .0423 },
    panel: { width: 1.99755, height: 1.2541, x: 0.025185, y: 1.1515, radius: .0466 },
    controlLayoutWidth: 1.15,
    radius: .098, bevel: .056, taper: .65, crown: .014, finish: 'silver', recess: .029,
    bottomInset: .028, barrel: .015, baseLift: .025, collar: .31, shellBow: .032, trimWidth: .008, glassBulge: .03,
  },
  BOTTOM_TV_SPECS[7],
  BOTTOM_TV_SPECS[8],
  BOTTOM_TV_SPECS[9],
];

const TAU=Math.PI*2,clamp=THREE.MathUtils.clamp;
const geometryCache=new Map();
function roundedLoop(width,height,radius,z=0,x=0,y=0,segments=16,edgeSteps=16){
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
  constructor(smoothLofts=false){this.positions=[];this.uv=[];this.indices=[];this.groups=[];this.lofts=smoothLofts?[]:null;}
  point(p,u=0,v=0){const index=this.positions.length/3;this.positions.push(...p);this.uv.push(u,v);return index;}
  strip(rings,material=0,reverse=false){
    const count=rings[0].length,start=this.indices.length,base=this.positions.length/3;
    rings.forEach((ring,j)=>ring.forEach((p,i)=>this.point(p,i/count,j/(rings.length-1))));
    if(this.lofts)this.lofts.push({base,rings,reverse});
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
    // Equal-weight profile tangents keep an unequal triangle at a corner
    // from pulling its reflection across the full length of a flat bezel.
    if(this.lofts){
      const positions=g.attributes.position,normals=g.attributes.normal;
      const v=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),along=new THREE.Vector3(),across=new THREE.Vector3();
      for(const {base,rings,reverse} of this.lofts){
        const count=rings[0].length;
        for(let j=0;j<rings.length;j++)for(let i=0;i<count;i++){
          const k=base+j*count+i;
          v.fromBufferAttribute(positions,k);
          a.fromBufferAttribute(positions,base+j*count+(i+1)%count).sub(v).normalize();
          b.fromBufferAttribute(positions,base+j*count+(i+count-1)%count).sub(v).normalize();
          along.subVectors(a,b);
          if(j+1<rings.length)a.fromBufferAttribute(positions,k+count).sub(v).normalize();else a.set(0,0,0);
          if(j>0)b.fromBufferAttribute(positions,k-count).sub(v).normalize();else b.set(0,0,0);
          across.subVectors(a,b);
          a.crossVectors(along,across).normalize();
          if(reverse)a.negate();
          if(a.lengthSq()>.99)normals.setXYZ(k,a.x,a.y,a.z);
        }
      }
    }
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

// A folded chassis goes around the sides of the set and carries the front
// controls. Each cross-section is a complete tapered XZ footprint.
function formedPlinth(group, spec, material, name, layers) {
  const { width, depth } = spec.dimensions;
  const rings = layers.map(([y, sideInset, front, rear, radius]) => {
    const length = depth * rear + front;
    return roundedLoop(width - 2 * sideInset, length, radius, 0, 0, 0, 9, 12).map(([x, py]) => {
      const t = py / length + .5;
      const rearSize = spec.plinth ? Math.max(.85, spec.taper) : spec.taper;
      const backWidth = 1 - (1 - rearSize) * THREE.MathUtils.smoothstep(t, .30, 1);
      return [x * backWidth, y, front - t * length];
    });
  });
  const shell = new SolidGeometry(true);
  shell.strip(rings, 0, true).cap(rings[0]).cap(rings.at(-1), 0, true);
  return mesh(group, shell.finish(), material, name);
}

// Slice the actual constructed casting, including its rolled front edge. The
// lower control apron starts with those exact intersection points on all sides.
function cutCastingSection(geometry,signedHeight) {
  const pos=geometry.attributes.position,nor=geometry.attributes.normal;
  const positions=[],normals=[],groups=[],section=new Map(),neighbours=new Map();
  const emit = vertex => {positions.push(...vertex.slice(0,3));normals.push(...vertex.slice(3));};
  const vertex = index => [pos.getX(index),pos.getY(index),pos.getZ(index),nor.getX(index),nor.getY(index),nor.getZ(index)];
  for(const part of geometry.groups){
    const start=positions.length/3;
    for(let i=part.start;i<part.start+part.count;i+=3){
      const triangle=[0,1,2].map(k=>vertex(geometry.index.getX(i+k)));
      if(triangle.every(p=>signedHeight(p)>=0)){triangle.forEach(emit);continue;}
      if(triangle.every(p=>signedHeight(p)<0))continue;
      const polygon=[],segment=[];
      for(let j=0;j<3;j++){
        const a=triangle[j],b=triangle[(j+1)%3];
        const ha=signedHeight(a),hb=signedHeight(b);
        if(ha>=0)polygon.push(a);
        if((ha<0)===(hb<0))continue;
        const t=ha/(ha-hb);
        const p=a.map((v,axis)=>THREE.MathUtils.lerp(v,b[axis],t));
        const key=[p[0],p[2]].map(n=>Math.round(n*1e6)).join('/');
        polygon.push(p);segment.push(key);section.set(key,p.slice(0,3));
      }
      if(segment.length===2 && segment[0]!==segment[1]){
        for(let end=0;end<2;end++){
          const key=segment[end];
          if(!neighbours.has(key))neighbours.set(key,new Set());
          neighbours.get(key).add(segment[1-end]);
        }
      }
      for(let j=1;j<polygon.length-1;j++){emit(polygon[0]);emit(polygon[j]);emit(polygon[j+1]);}
    }
    groups.push({start,count:positions.length/3-start,materialIndex:part.materialIndex});
  }
  const edge=[],visited=new Set();
  let next=neighbours.keys().next().value;
  while(next!==undefined && !visited.has(next)){
    visited.add(next);edge.push(section.get(next));
    next=[...neighbours.get(next)].find(key=>!visited.has(key));
  }
  const winding=edge.reduce((sum,p,i)=>{
    const q=edge[(i+1)%edge.length];
    return sum+p[2]*q[0]-p[0]*q[2];
  },0);
  if(winding<0)edge.reverse();
  const upper = new THREE.BufferGeometry();
  upper.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  upper.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));upper.normalizeNormals();
  upper.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));
  for(const part of groups)upper.addGroup(part.start,part.count,part.materialIndex);
  return {upper,edge};
}

function separateLowerCasting(geometry,spec) {
  const cut=spec.plinth+.057;
  const {upper,edge}=cutCastingSection(geometry,p=>p[1]-cut-spec.apronFall*p[2]/spec.dimensions.depth);
  const {width,depth}=spec.dimensions,front=-.026;
  // The cut stops where the sloping back wall rises above it. Recover that
  // actual rear extent; the skirt cannot reach the full depth of the case.
  const back=Math.min(...edge.map(p=>p[2]))+.028;
  const centerZ=(front+back)*.5;
  // Method of manufacture: draw the lower sheet into a smooth tapered die.
  // Rays in plan pair the irregular upper casting section to this stamping
  // without carrying every cut triangle as a corrugation down the side.
  const die=roundedLoop(width*.956,front-back,.098,0,0,0,16,12).map(([x,v])=>{
    const z=centerZ+v;
    return [x*shellSection(spec,clamp(-z/depth,0,1)).width,z];
  });
  const foot=edge.map(([x,,z])=>{
    const vz=z-centerZ;
    for(let i=0;i<die.length;i++){
      const a=die[i],b=die[(i+1)%die.length],dx=b[0]-a[0],dz=b[1]-a[1];
      const det=x*dz-vz*dx;
      if(Math.abs(det)<1e-10)continue;
      const t=(a[0]*dz-(a[1]-centerZ)*dx)/det,u=(a[0]*vz-(a[1]-centerZ)*x)/det;
      if(t>0&&u>=-1e-8&&u<=1+1e-8){
        const radius=Math.min(t,1-.012/Math.max(.03,Math.hypot(x,vz)));
        return [radius*x,centerZ+radius*vz];
      }
    }
    return [x,z];
  });
  const footprint=(y,form,inset=0)=>edge.map(([x,sectionY,z],i)=>[
    THREE.MathUtils.lerp(x,foot[i][0]*(1-inset),form),
    .018+(sectionY-.018)*(y-.018)/(cut-.018),
    THREE.MathUtils.lerp(z,centerZ+(foot[i][1]-centerZ)*(1-inset),form),
  ]);
  const apron=new SolidGeometry(true),layers=[
    edge,footprint(cut-.012,.013),footprint(cut-.026,.065),footprint(cut-.041,.21),
    footprint(cut-.052,.43),footprint(cut-.060,.69),footprint(cut-.068,.89),
    footprint(cut-.079,.975),footprint(cut-.087,1),footprint(.087,1),
    footprint(.046,1,.004),footprint(.026,1,.011),footprint(.018,1,.017),
  ];
  apron.strip(layers,0,true).cap(layers.at(-1),1,true);
  const lower=apron.finish().toNonIndexed(), lp=lower.attributes.position;
  // The control band is painted ivory across its face. The side and back
  // portions are sprayed in the same finish as the corresponding cabinet.
  const end=lower.groups[0].count;
  lower.clearGroups();let first=0,previous=-1;
  for(let j=0;j<end;j+=3){
    const z=(lp.getZ(j)+lp.getZ(j+1)+lp.getZ(j+2))/3;
    const layer=Math.floor(j/(edge.length*6));
    const material = z< -spec.dimensions.depth*spec.collar?1:layer<6?0:2;
    if(previous!==material){if(j>first)lower.addGroup(first,j-first,previous);first=j;previous=material;}
  }
  lower.addGroup(first,end-first,previous);lower.addGroup(end,lp.count-end,1);
  return {upper,lower};
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

function box(group,material,name,x,y,z,width,height,depth,radius=.025,bevel=.008){
  const layout=group.userData.controlLayoutWidth||1;
  return mesh(group,roundedBox(width*layout,height,depth,radius,bevel),material,name,x*layout,y,z);
}
function cylinder(group,material,name,x,y,z,radius,depth,segments=40){
  const geometry=new THREE.CylinderGeometry(radius,radius,depth,segments,1);geometry.rotateX(Math.PI/2);
  return mesh(group,geometry,material,name,x*(group.userData.controlLayoutWidth||1),y,z);
}

// A tube's long edges arc even before they meet the rounded corners. The
// surround and video glass share the exact same aperture in model space.
function tubeLoop(width, height, radius, z, cx, cy, screen, influence = 1) {
  const bowX = (screen.bowX || 0) * influence, bowY = (screen.bowY || 0) * influence;
  return roundedLoop(width, height, radius, z, cx, cy).map(([x, y]) => {
    const u = (x - cx) / (width * .5), v = (y - cy) / (height * .5);
    const dy = (y - cy) * (1 - bowY * u * u);
    const dx = (x - cx) * (1 - bowX * v * v);
    // Perspective belongs to the camera and the rigid cabinet pose. The glass,
    // gasket and every nested die share a symmetric manufactured aperture.
    return [cx + dx, cy + dy, z];
  });
}

function glassSurfaceZ(screen, x, y, z, bulge) {
  const u = (x - screen.x) / (screen.width * .5), v = (y - screen.y) / (screen.height * .5);
  return z + bulge * (1 - .5 * u * u - .5 * v * v);
}

// The front mold stays almost full width through its collar. Behind the
// parting line, the rear shell curves around the narrowing neck of the tube.
function shellSection(spec, depthFraction) {
  const t = clamp((depthFraction - spec.collar) / (1 - spec.collar), 0, 1);
  const width = 1 - .018 * Math.min(depthFraction / spec.collar, 1) - (.982 - spec.taper) * t ** 1.55;
  const height = width - (spec.barrel ? .065 * t : 0);
  const midY = spec.dimensions.height * (.5 + (spec.barrel ? .022 : .008) * t);
  return { width, height, midY };
}

function bodySection(spec, width, height, radius, z, cy, face = 1) {
  const h = spec.dimensions.height;
  return roundedLoop(width, height, radius, z, 0, cy).map(([x, y, depth]) => {
    const u = x / (width * .5), v = (y - cy) / (height * .5);
    const taper = (spec.bottomInset || 0) * (1 - y / h) ** 2;
    const cheek = (spec.barrel || 0) * Math.sin(Math.PI * y / h) ** 2;
    // Positive-axis bow of the top/bottom edges, stronger on wide late sets.
    const archY = -v * u * u * spec.shellBow * height * .5;
    const corner = 1 - spec.shellBow * v * v;
    let shoulderY = 0;
    if (spec.barrel) {
      // The late silver cabinet has a deep arched cap over the faceplate.
      // It sweeps back into a much lower charcoal service cover.
      const depthRatio = -depth / spec.dimensions.depth;
      const crest = .025 + .014 * (1 - u * u);
      shoulderY = THREE.MathUtils.smoothstep(v, .39, .94) *
        (crest * (1 - THREE.MathUtils.smoothstep(depthRatio, .31, .69)) -
          .019 * THREE.MathUtils.smoothstep(depthRatio, .50, .78));
    }
    return [x * (1 - taper + cheek) * corner,
      y + archY + shoulderY, depth - face * (spec.topSlope || 0) * Math.max(0, y - h * .77)];
  });
}

function cabinet(group,spec,m){
  const {width:w,height:h,depth:d}=spec.dimensions,{x:sx,y:sy,width:sw,height:sh,radius:sr}=spec.screen,b=spec.bevel,r=spec.radius,cy=h/2;
  const bodyRings=[];
  for(let i=0;i<=6;i++){
    const t=i/6*Math.PI/2,e=Math.sin(t)*b;
    // The rounded edge turns further back into the case than it travels across
    // the fascia. Leave the panel's top corners on the continuous front face.
    const inset = (b - e) * (spec.plinth ? .44 : spec.barrel ? .49 : .78);
    bodyRings.push(bodySection(spec,w-2*inset,h-2*inset,r-inset,-b+b*Math.cos(t),cy));
  }
  const front = bodyRings[0];
  const rb=Math.min(b*.78,r*.38), stations=[.18, spec.collar, ...[.24,.49,.72,.88,1].map(n => spec.collar + (1 - rb/d - spec.collar) * n)];
  for (const depth of stations) {
    const section = shellSection(spec, depth);
    bodyRings.push(bodySection(spec, w*section.width, h*section.height, r*section.width, -d*depth, section.midY,
      spec.topSlope ? 1 - THREE.MathUtils.smoothstep(depth,0,spec.collar)
        : 1 - THREE.MathUtils.smoothstep(depth, spec.collar, 1)));
  }
  const end=shellSection(spec,1-rb/d);
  for(let i=1;i<=5;i++){
    const t=i/5*Math.PI/2,e=(1-Math.cos(t))*rb;
    bodyRings.push(bodySection(spec,w*end.width-2*e,h*end.height-2*e,r*end.width-e,-d+rb-rb*Math.sin(t),end.midY,0));
  }
  const p=spec.panel;
  const panelLoop=(inset,z)=>tubeLoop(p.width-2*inset,p.height-2*inset,p.radius-inset,z,p.x,p.y,spec.screen,
    spec.controlDivider ? .12 : spec.barrel ? 1 : .34).map(([x,y,depth])=>[
      x+(p.lean||0)*(y-p.y)/(p.height*.5),y,depth-(spec.topSlope||0)*Math.max(0,y-h*.77)]);
  const panelOuter=panelLoop(0,.003),panelEdge=panelLoop(.009,.011),panelInner=panelLoop(.017,.002);
  const clearance=Math.min(p.width/2-Math.abs(sx-p.x)-sw/2,p.height/2-Math.abs(sy-p.y)-sh/2);
  const margin = Math.max(.007, Math.min(spec.trimWidth, clearance - .030));
  const shoulder = spec.finish === 'silver' && !spec.barrel;
  const mouth = (pad, z, curve, rad = sr) => tubeLoop(sw+2*pad,sh+2*pad,rad+pad*.45,z,sx,sy,spec.screen,spec.barrel ? 1 : curve);
  const lipOuter=mouth(margin, .002, spec.barrel ? 1 : .38), lipCrest=mouth(margin*.90, .008, .49);
  const screenZ = -spec.recess;
  const glassZ = (x, y) => glassSurfaceZ(spec.screen, x, y, screenZ, spec.glassBulge);
  const aperture = mouth(0, screenZ, 1).map(([x, y]) => [x, y, glassZ(x, y)]);
  const throat = mouth(margin*.24, 0, .88).map(([x, y]) => [
    x, y, Math.max(-spec.recess * .49, glassZ(x, y) + spec.recess * .20),
  ]);
  // A gasket that actually follows the spherical faceplate: its outer bead
  // stands proud, its inner edge shares all three coordinates with the glass.
  const bead = aperture.map(([x, y], i) => {
    const px = THREE.MathUtils.lerp(x, throat[i][0], .50);
    const py = THREE.MathUtils.lerp(y, throat[i][1], .50);
    return [px, py, glassZ(px, py) + spec.recess * .12];
  });
  const cavity = aperture.map(([x, y, z]) => [x, y, z - .055]);
  const g=new SolidGeometry(true);
  g.strip(bodyRings.slice(0,9),0,true).strip(bodyRings.slice(8),1,true).cap(bodyRings.at(-1),1,true);
  const frontCrown=[front];
  const crownSteps=5;
  for(let j=1;j<crownSteps;j++){
    const t=j/crownSteps;
    frontCrown.push(front.map((p,i)=>{
      const y=THREE.MathUtils.lerp(p[1],panelOuter[i][1],t);
      // The Polystar fascia is pressed sheet. Its broad face stays nearly
      // planar between the outer bend and the single bevel around the tube.
      const crownHeight = shoulder ? .002 : (spec.crown || .018);
      const crown=spec.plinth?0:crownHeight*Math.sin(Math.PI*t)*THREE.MathUtils.smoothstep(y/h,.22,.48);
      return p.map((v,a)=>THREE.MathUtils.lerp(v,panelOuter[i][a],t)+(a===2?crown:0));
    }));
  }
  frontCrown.push(panelOuter);
  g.strip(frontCrown,2);
  if (shoulder || spec.barrel) {
    // These silver bezels are a single stamping: only the inner rubber gasket
    // separates the silver sweep from the CRT. There is no outer chrome ring.
    if (shoulder) {
      // The Polystar has a bright cut metal edge and a separate charcoal
      // liner immediately inside it. Its opposing bevels catch different lights.
      const stamping = panelLoop(.010, .003);
      const blackReturn = lipOuter.map(([x, y, z]) => [x, y, z - .032]);
      const cutBevel=stamping.map((q,i)=>q.map((v,k)=>THREE.MathUtils.lerp(v,blackReturn[i][k],.61)));
      g.strip([panelOuter,stamping,cutBevel],2).strip([cutBevel,blackReturn,throat],6);
    } else g.strip([panelOuter,lipOuter,throat],2);
  } else {
    g.strip([panelOuter,panelEdge],3).strip([panelEdge,panelInner],4);
    if (spec.controlDivider) {
      // The CRT cassette ends at the tuner bank and has an independent thin
      // reveal. Its four bevels have different widths around the off-centre tube.
      const left=p.x-p.width*.5+.035,right=spec.controlDivider-.012;
      const socket=(inset,z)=>tubeLoop(right-left-2*inset,p.height-.072-2*inset,
        p.radius*.78-inset,z,(left+right)*.5,p.y,spec.screen,.16);
      const cassette=socket(0,-.005),line=socket(.007,.014),ledge=socket(.019,.015);
      const revealProfile=(outer,t,z)=>outer.map(([x,y],i)=>[
        THREE.MathUtils.lerp(x,throat[i][0],t),THREE.MathUtils.lerp(y,throat[i][1],t),z]);
      const shoulder=revealProfile(ledge,.100,.005),step=revealProfile(ledge,.206,-.014);
      g.strip([panelInner,cassette],4).strip([cassette,line],3).strip([line,ledge,shoulder],6)
        .strip([shoulder,step],5);
      // A flat cassette apron and a rolled reveal precede the sloping inner
      // wall. Keep separate physical widths on the tuner and speaker sides.
      // Each nested die expands the same curved opening. Using its own
      // radius at each step keeps the return smooth even where the tuner
      // bank leaves much less space on one side than the other.
      const apron=revealProfile(ledge,.41,-.025),curb=revealProfile(ledge,.47,-.022);
      const bevel=revealProfile(ledge,.62,-.028),reveal=revealProfile(ledge,.73,-.035);
      g.strip([step,apron],5).strip([apron,curb,bevel],6).strip([bevel,reveal,throat],5);
    } else {
      const liner=spec.topSlope?2:5;
      g.strip([panelInner,lipOuter],liner).strip([lipOuter,lipCrest],liner)
        .strip([lipCrest,throat],liner);
    }
  }
  g.strip([throat,bead,aperture],4).strip([aperture,cavity],4).cap(cavity,4);
  const shellGeometry=g.finish(),cut = spec.plinth ? separateLowerCasting(shellGeometry,spec) : null;
  const mapped=physicalGrainUV(cut?.upper || shellGeometry);
  cut?.upper.dispose();shellGeometry.dispose();
  if(cut){
    const apron=physicalGrainUV(cut.lower);cut.lower.dispose();
    // The ivory spray wraps around the rolled front corner and fades into
    // the same gold enamel used on the sides of the upper molding.
    const paint=m.front.clone();paint.vertexColors=true;paint.name='Two-tone control apron enamel';
    const pos=apron.attributes.position,colors=new Float32Array(pos.count*3).fill(1);
    const base=m.body.color,face=m.front.color;
    for(const part of apron.groups)if(part.materialIndex===2){
      for(let i=part.start;i<part.start+part.count;i++){
        const blend=THREE.MathUtils.smoothstep(pos.getZ(i),-.154,-.046);
        colors[i*3]=THREE.MathUtils.lerp(base.r/face.r,1,blend);
        colors[i*3+1]=THREE.MathUtils.lerp(base.g/face.g,1,blend);
        colors[i*3+2]=THREE.MathUtils.lerp(base.b/face.b,1,blend);
      }
    }
    apron.setAttribute('color',new THREE.BufferAttribute(colors,3));
    mesh(group,apron,[m.body,m.rear,paint],spec.finish==='cream'?'lower-painted-controls-rail':'separate-cream-lower-control-molding');
  }
  mesh(group,mapped,[m.body,m.rear,(spec.plinth||spec.brand==='NATIONAL')?m.body:m.front,m.trim,m.rubber,m.dark,m.apertureLip],'closed-cabinet-with-stepped-inset-bezel');
  const seam=new SolidGeometry();
  const split = shellSection(spec,spec.collar);
  const seamLoop = fraction => bodySection(spec,w*split.width+.0016,h*split.height+.0016,r*split.width,
    -d*fraction,split.midY,spec.topSlope?0:1);
  seam.strip([seamLoop(spec.collar-.0015),seamLoop(spec.collar+.0015)],0,true);
  mesh(group,seam.finish(),m.rear,'front-to-rear-cabinet-parting-line');
  return {aperture,screenZ};
}

function glassGeometry(screen, z, bulge=.052, boundary=null) {
  const loop = boundary || tubeLoop(screen.width,screen.height,screen.radius,z,screen.x,screen.y,screen)
    .map(([x, y]) => [x, y, glassSurfaceZ(screen, x, y, z, bulge)]);
  const rings = [loop];
  for (let j = 1; j < 20; j++) {
    const t = 1 - j / 20;
    rings.push(loop.map(([x, y]) => {
      const px = screen.x + (x - screen.x) * t, py = screen.y + (y - screen.y) * t;
      return [px, py, glassSurfaceZ(screen, px, py, z, bulge)];
    }));
  }
  const builder = new SolidGeometry();
  builder.strip(rings).cap(rings.at(-1), 0, false, [screen.x,screen.y,z+bulge]);
  const geometry = builder.finish(), position = geometry.attributes.position;
  const uv = geometry.attributes.uv, normals = geometry.attributes.normal;
  const hx = screen.width * .5, hy = screen.height * .5, n = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    const u = (position.getX(i) - screen.x) / hx, v = (position.getY(i) - screen.y) / hy;
    n.set(bulge * u / hx, bulge * v / hy, 1).normalize();
    normals.setXYZ(i, n.x, n.y, n.z);
    uv.setXY(i, u * .5 + .5, v * .5 + .5);
  }
  return geometry;
}

function label(group, text, x, y, z, height = .033, color = 0xbcb9a8) {
  const mark = makePrintedMark(text, height, color);
  mark.position.set(x*(group.userData.controlLayoutWidth||1), y, z);
  group.add(mark);
  return mark;
}

function fixture(parent,name,x,y,z,normal=new THREE.Vector3(0,0,1)){
  const group=new THREE.Group();group.name=name;group.position.set(x*(parent.userData.controlLayoutWidth||1),y,z);group.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal.clone().normalize());parent.add(group);return group;
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
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion();
  const flute=(ratio,z,cut)=>Array.from({length:144},(_,i)=>{
    const a=i*TAU/144,r=radius*ratio*(1-(i%3===1?cut:0));
    return [Math.cos(a)*r,Math.sin(a)*r,z];
  });
  const hub=new SolidGeometry(true), face=flute(.26,depth+.028,0);
  const back=flute(.83,.010,0);
  hub.strip([face,flute(.55,depth+.024,0),flute(.76,depth+.020,0),flute(.89,depth+.014,0),flute(.98,depth+.007,.008),
    flute(1,depth-.004,.026),flute(1,.033,.031),flute(.94,.020,.013),back],0,true)
    .cap(face).cap(back,0,true);
  const bakelite=m.dark.clone();
  bakelite.color.setHex(0x26221e);bakelite.roughness=.30;bakelite.clearcoat=.32;
  mesh(g,hub.finish(),bakelite,'beveled-knurled-dial');
  const rim=new THREE.TorusGeometry(radius*.90,options.rim??.0045,8,64);
  mesh(g,rim,options.rimMaterial||m.chrome,'fine-machined-dial-rim',0,0,depth+.014);
  const a=options.angle??.62;
  if(options.paddle!==false){
    const grip=new THREE.Group();grip.name='raised-tuning-paddle';grip.rotation.z=a;g.add(grip);
    const crown = new SolidGeometry(true);
    const profile = (length,width,height) => roundedLoop(length*radius,width*radius,width*radius*.42,
      depth+height,0,0,7,4).map(([x,y,z])=>{
        const taper=1-.16*(x/radius);
        return [x,y*taper,z+.008*(1-(x/radius)**2)+.003*x/radius];
      });
    const top=profile(1.37,.29,.065),bottom=profile(1.55,.56,.020);
    crown.strip([top,profile(1.48,.43,.056),profile(1.55,.54,.039),bottom],0,true)
      .cap(top,1).cap(bottom,0,true);
    mesh(grip,crown.finish(),[options.polishedPaddle?m.silver:bakelite,options.polishedPaddle?m.chrome:bakelite],'cast-paddle-with-polished-index');
  }
  const marker=box(g,m.silver,'dial-index-mark',Math.cos(a)*radius*.69,Math.sin(a)*radius*.69,depth+.072,
    radius*.19,.004,.003,.001,.0004);marker.rotation.z=a;
  const ticks=new THREE.InstancedMesh(new THREE.BoxGeometry(.003,.010,.0015),m.silver,12);
  for(let i=0;i<12;i++){const angle=i*TAU/12;q.setFromAxisAngle(new THREE.Vector3(0,0,1),-angle);matrix.compose(new THREE.Vector3(Math.sin(angle)*radius*1.16,Math.cos(angle)*radius*1.16,.017),q,new THREE.Vector3(1,1,1));ticks.setMatrixAt(i,matrix);}
  ticks.name='engraved-tuning-scale-ticks';ticks.instanceMatrix.needsUpdate=true;g.add(ticks);
  return g;
}

function shaftControl(parent,m,x,y,z,radius) {
  const control=fixture(parent,'projecting-front-adjuster',x,y,z);
  mesh(control,latheProfile([[0,-.004],[radius*1.27,-.004],[radius*1.30,.005],
    [radius*1.25,.013],[radius*1.04,.018],[0,.018]],36),
    m.chrome,'rolled-metal-spindle-collar');
  mesh(control,latheProfile([[0,.009],[radius*.80,.009],[radius*.89,.019],
    [radius*.77,.031],[radius*.98,.052],[radius,.065],[radius*.88,.077],[radius*.64,.082],[0,.083]],36),
    m.dark,'tapered-bakelite-knob');
  const index=box(control,m.trim,'spindle-setting-index',radius*.21,radius*.32,.082,
    radius*.13,radius*.55,.002,.001,.0003);index.rotation.z=-.45;
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
  width*=parent.userData.controlLayoutWidth||1;
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
  width*=parent.userData.controlLayoutWidth||1;
  const g=fixture(parent,options.name||'perforated-metal-acoustic-panel',x,y,z,options.normal||new THREE.Vector3(0,0,1));
  const contoured = options.contoured, crown = options.crown || 0;
  const facePoint = (px,py) => {
    const u = px/(width*.5), t = py/height+.5;
    const rowWidth = contoured ? .955+.045*t : 1;
    return [px*rowWidth, py-(contoured?.010:0)*(1-u*u)*(1-.5*t), .004+crown*(1-u*u)];
  };
  if(contoured){
    const felt=new THREE.PlaneGeometry(width,height,48,8),pos=felt.attributes.position;
    for(let i=0;i<pos.count;i++){
      const [px,py,pz]=facePoint(pos.getX(i),pos.getY(i));pos.setXYZ(i,px,py,pz-.0075);
    }
    felt.computeVertexNormals();
    mesh(g,felt,m.rubber,'acoustic-felt-behind-real-openings');
  }else box(g,m.rubber,'acoustic-felt-behind-real-openings',0,0,-.008,width,height,.010,.008,.002);
  const pitch=options.pitch||.015,columns=Math.max(2,Math.floor(width/pitch)),rows=Math.max(2,Math.floor(height/pitch));
  const cw=width/columns,ch=height/rows,r=Math.min(cw,ch)*(options.holeRatio ?? .30);
  // Each repeated metal tile has a real circular opening and a short inner
  // wall; the dark acoustic felt is behind it, rather than painted on top.
  const b=new SolidGeometry(),outer=[],inner=[],back=[];
  for(let k=0;k<8;k++){
    const a=k*TAU/8,dx=Math.cos(a),dy=Math.sin(a),s=1/Math.max(Math.abs(dx),Math.abs(dy));
    outer.push([dx*s*cw/2,dy*s*ch/2,0]);inner.push([dx*r,dy*r,0]);back.push([dx*r,dy*r,-.005]);
  }
  b.strip([outer,inner],0).strip([inner,back],0);
  const sheet=(options.material||m.silver).clone();sheet.name='Satin perforated sheet — geometric microdetail';
  // The real holes already carry relief. A second 256px bump map repeated on
  // every tiny tile would magnify nanoscopic grain into unstable dark spikes.
  sheet.bumpMap=null;sheet.roughnessMap=null;sheet.map=null;sheet.roughness=Math.max(.52,sheet.roughness);
  if(contoured)sheet.color.multiplyScalar(.56);
  const cells=new THREE.InstancedMesh(b.finish(),sheet,columns*rows),matrix=new THREE.Matrix4();let i=0;
  for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
    const px=(column+.5)*cw-width/2, py=(row+.5)*ch-height/2;
    const u=px/(width*.5), t=py/height+.5;
    if(contoured){
      const tx=new THREE.Vector3(.955+.045*t,.040*u*(1-.5*t)/width,-4*crown*u/width);
      const ty=new THREE.Vector3(.045*px/height,1+.005*(1-u*u)/height,0);
      matrix.makeBasis(tx,ty,new THREE.Vector3().crossVectors(tx,ty).normalize());
    }else matrix.makeRotationY(Math.atan(crown*4*u/width));
    matrix.setPosition(...facePoint(px,py));cells.setMatrixAt(i++,matrix);
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
  if(index===8 || index===9)return;
  // Visible side vents are different shells, not a repeated rear grille.
  const profile = {
    0: {depth: .66, y: .424, width: .30, height: .52, banks: 2, pitch: .028},
    3: {depth: .65, y: .41, width: .33, height: .46, banks: 3, pitch: .028},
    6: {depth: .61, y: .51, width: .36, height: .31, banks: 4, pitch: .029},
  }[index];
  const ratio=profile?.depth ?? .63;
  // Bottom-row shells own their original side profile.
  const useShoulder=Number.isFinite(spec.collar);
  const sideAt=f=>useShoulder ? .5*w*shellSection(spec,f).width : .5*w*THREE.MathUtils.lerp(.985,spec.taper,(f-.35)/(.65-spec.bevel*.7/d));
  for (const sign of [-1,1]) {
    if (([2,5].includes(index) && sign===-1) || (index===7 && sign===1)) continue;
    const y=h*(profile?.y ?? .51),height=h*(profile?.height ?? .31),width=d*(profile?.width ?? .35);
    const slope=(sideAt(ratio-.002)-sideAt(ratio+.002))/(.004*d);
    const normal=new THREE.Vector3(sign,0,-slope);
    if (!profile) {
      grille(group,m,sign*(sideAt(ratio)+.004),y,-d*ratio,width,height,
        {pitch:.025,material:m.rear,normal,name:'side-cooling-vent-array'});
      continue;
    }
    // Individual punched slots follow the back's narrowing shoulder. Raised
    // shell-colored webs remain between the banks instead of a black patch.
    const nRows=Math.floor(height/profile.pitch), slots=[];
    for(let bank=0;bank<profile.banks;bank++){
      const bankWidth=width/profile.banks;
      const depth=ratio+(bank+.5-profile.banks*.5)*bankWidth/d;
      const slope=(sideAt(depth-.002)-sideAt(depth+.002))/(.004*d);
      const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(sign,0,-slope).normalize());
      for(let row=0;row<nRows;row++){
        const py=y+(row+.5-nRows*.5)*profile.pitch, v=2*(py-h*.5)/h;
        const barrel=(spec.barrel || 0)*Math.sin(Math.PI*py/h)**2 - (spec.bottomInset || 0)*(1-py/h)**2;
        const px=sideAt(depth)*(1+barrel)*(1-spec.shellBow*v*v);
        slots.push(new THREE.Matrix4().compose(new THREE.Vector3(sign*(px+.003),py,-depth*d),rotation,new THREE.Vector3(1,1,1)));
      }
    }
    if(index===0){
      const t=.68,py=h*.756,px=sideAt(t)*(1-spec.shellBow*(2*py/h-1)**2);
      const recess=fixture(group,'recessed-cabinet-service-notch',sign*(px+.003),py,-t*d,normal);
      box(recess,m.rear,'pressed-service-notch-wall',0,0,0,.098,.090,.014,.013,.003);
      box(recess,m.rubber,'service-notch-opening',0,.017,.007,.071,.026,.007,.005,.002);
    }
    const length=width/profile.banks*.86;
    const holes=new THREE.InstancedMesh(roundedBox(length,.012,.006,.005,.0015),m.rubber,slots.length);
    slots.forEach((matrix,i)=>holes.setMatrixAt(i,matrix));
    holes.name='rows-of-separated-side-vent-slots';holes.instanceMatrix.needsUpdate=true;group.add(holes);
  }
}

function frontControls(group,spec,m,resources,index){
  const print=(text,x,y,size=.032,color=0xc0bcaa,z=.012)=>label(group,text,x,y,z,size,color,resources);
  if(index===0){
    box(group,m.dark,'inlaid-maker-strip',-.55,.294,.001,.221,.026,.012,.009,.002);
    print(spec.brand,-.55,.294,.020,0xbab09a);
    box(group,m.dark,'inlaid-model-strip',.568,.284,.001,.233,.026,.014,.007,.002);
    print('SOLID STATE COLOR',.568,.284,.014,0xb5a384);
    box(group,m.brass,'recessed-long-power-window',-.435,.071,.003,.74,.044,.025,.019,.007);
    const lens=m.amber.clone();
    lens.color.setHex(0xff5401);lens.emissive.setHex(0xff4c00);lens.emissiveIntensity=2.2; lens.roughness=.21;
    const tally = box(group,lens,'warm-tally-light',-.435,.071,.025,.706,.029,.026,.014,.006);
    tally.castShadow = false;
    
    for(const x of[-.72,.72])screw(group,m,x,.292,.013,.009);
  }else if(index===1){
    box(group,m.silver,'separate-brushed-lower-fascia',0,.186,.007,2.04,.273,.026,.009,.004);
    box(group,m.dark,'horizontal-tuning-scale-recess',0,.339,.009,2.07,.016,.017,.005,.002);
    for (const [x, width] of [[-.806, .445], [.77, .468]]) {
      box(group,m.dark,'upper-service-slot',x,.363,.012,width,.022,.013,.009,.003);
    }
    box(group,m.dark,'small-brand-badge',.008,.366,.012,.224,.052,.009,.004,.002);
    print(spec.brand,.008,.366,.032,0xe8dfcf,.018);
    perforatedGrille(group,m,-.742,.171,.028,.556,.179,{pitch:.011,material:m.trim,holeRatio:.32});
    perforatedGrille(group,m,.724,.172,.028,.572,.177,{pitch:.011,material:m.trim,holeRatio:.32});
    for(const x of[-.32,-.12,.071])button(group,m,x,.213,.023,{metal:false,z:.025});
    for(const [x,y,r]of[[.296,.263,.024],[.378,.210,.024],[.294,.146,.022],[.215,.213,.027]])button(group,m,x,y,r,{metal:false,z:.025});
    for(const x of[-.40,-.34])button(group,m,x,.108,.008,{z:.025});
    print('VOLUME     COLOUR    TUNING',-.01,.280,.012,0x545449,.026);
    print('ELECTRONIC COLOR',0,.097,.011,0x595b50,.026);
    screw(group,m,.856,.191,.034,.014);
  }else if(index===2){
    const tunerRight = spec.panel.x + spec.panel.width * .5 - .028;
    const tunerLeft = spec.controlDivider - .003;
    const tunerPanel=m.dark.clone();tunerPanel.name='Satin graphite tuner housing';tunerPanel.color.setHex(0x35383e);
    box(group,tunerPanel,'separate-bakelite-tuner-plate',(tunerLeft+tunerRight)/2,.977,.004,tunerRight-tunerLeft,1.025,.020,.024,.004);
    box(group,m.trim,'dial-bank-divider',spec.controlDivider,.952,.012,.012,1.055,.018,.004,.001);
    dial(group,m,.684,1.316,.130,{angle:1.45,z:.025,depth:.058,rim:.003,rimMaterial:m.trim,polishedPaddle:true});
    dial(group,m,.697,.931,.124,{angle:-.20,z:.025,depth:.061,rim:.003,rimMaterial:m.trim,polishedPaddle:true});
    grille(group,m,.694,.575,.025,.284,.315,{pitch:.022,material:m.dark});
    print('VHF',.65,1.465,.016,0xa8a68e,.025);print('UHF',.65,1.125,.015,0xa8a68e,.025);
    perforatedGrille(group,m,-.481,.159,-.018,.402,.069,{pitch:.012,material:m.dark});
    cylinder(group,m.chrome,'recessed-switch-collar',-.062,.154,-.022,.031,.016,32);
    button(group,m,-.062,.154,.019,{z:-.018});
    for(const x of[.14,.34,.54,.74])shaftControl(group,m,x,.151,-.025,.040);
    print(spec.brand,-.39,.304,.026,0x5b503b);
    print('COLOUR',.42,.207,.011,0x3d3d2d,-.042);
    for(const x of[-.82,.82])screw(group,m,x,.397,.006,.008);
    const handle=fixture(group,'right-side-carrying-handle',.925,1.04,-.036);
    // Folded strap, open between the two hinge ears; the outer reach stays
    // visible past the right side of the cabinet in the installed pose.
    for(const sign of [-1,1]){
      box(handle,m.dark,'handle-hinge-socket',.002,sign*.263,-.015,.058,.083,.108,.023,.008);
    }
    // One swept strip turns through both mounting ears. The section rotates
    // with the bend, leaving a continuous radius at the top and bottom.
    const section=roundedLoop(.053,.082,.016,0,0,0,5,2);
    const strip=new SolidGeometry(true),hoops=[];
    const hoop=(x,y,tx,ty)=>section.map(([u,v])=>[x-ty*u,y+tx*u,.010+v]);
    hoops.push(hoop(-.008,.263,1,0));
    for(let j=0;j<=8;j++){
      const a=Math.PI*.5*(1-j/8);
      hoops.push(hoop(.057+.051*Math.cos(a),.212+.051*Math.sin(a),Math.sin(a),-Math.cos(a)));
    }
    for(let j=0;j<=8;j++){
      const a=-Math.PI*.5*j/8;
      hoops.push(hoop(.057+.051*Math.cos(a),-.212+.051*Math.sin(a),Math.sin(a),-Math.cos(a)));
    }
    hoops.push(hoop(-.008,-.263,-1,0));
    strip.strip(hoops).cap(hoops[0],0,true).cap(hoops.at(-1));
    mesh(handle,strip.finish(),m.front,'continuous-bent-carrying-strap');
    box(handle,m.dark,'inlaid-handle-grip',.108,0,.052,.036,.440,.011,.016,.003);
  }else if(index===3){
    const console=fixture(group,'backward-raked-upper-control-console',0,1.551,-(1.551-spec.dimensions.height*.77)*spec.topSlope,new THREE.Vector3(0,spec.topSlope,1));
    console.userData.controlLayoutWidth=group.userData.controlLayoutWidth;
    box(console,m.dark,'raised-service-fascia',0,0,0,1.76,.321,.028,.028,.006);
    dial(console,m,.331,.010,.126,{angle:.49,z:.018,depth:.075,rim:.003,rimMaterial:m.brass,polishedPaddle:true});
    dial(console,m,.704,.018,.100,{angle:.76,z:.018,depth:.053,rim:.005,rimMaterial:m.trim});
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
    perforatedGrille(group,m,-.706,.226,.033,.557,.229,{pitch:.012,material:m.trim,holeRatio:.31});
    // The die-cast brow over the controls and the bent leading edge are
    // visible above the selector and below the bank of projecting shafts.
    box(group,m.dark,'overhanging-control-fascia-brow',0,.389,.016,2.010,.018,.071,.007,.004);
    box(group,m.chrome,'folded-control-chassis-edge',0,.070,.024,1.993,.012,.025,.004,.002);
    button(group,m,-.770,.300,.016,{metal:true,z:.044});
    box(group,m.silver,'vertical-channel-bank-rule',-.512,.227,.032,.012,.245,.012,.002,.001);
    for(let i=0;i<6;i++){button(group,m,-.55,.321-i*.038,.009,{metal:true,z:.033});print(String(i+1),-.606,.321-i*.038,.010,0x35362d,.034);}
    box(group,m.rubber,'system-selector-black-recess',-.28,.299,.034,.18,.045,.018,.009,.002);
    box(group,m.chrome,'small-slide-selector',-.31,.300,.047,.037,.021,.016,.004,.002);
    button(group,m,-.451,.164,.018,{z:.033});
    for(const x of[-.319,-.147,.024])shaftControl(group,m,x,.150,.035,.034);
    for(let i=0;i<8;i++)button(group,m,.27+i*.052,.151,.008,{metal:false,z:.035});
    dial(group,m,.828,.227,.113,{z:.033,angle:.41,depth:.071,rim:.007,polishedPaddle:true});
    print(spec.brand,0,.403,.022,0xb2ad98);
    print('PAL  SECAM  SYSTEM',-.17,.246,.012,0x35392e,.035);
    print('CONTRAST  COLOUR  VOLUME',-.12,.096,.010,0x404238,.035);
    for(const x of[-.97,.97])screw(group,m,x,.359,.033,.007);
  }else if(index===5){
    const tunerPanel=m.dark.clone();tunerPanel.name='Gunmetal preset-key mounting plate';tunerPanel.color.setHex(0x4b5057);
    box(group,tunerPanel,'inset-channel-and-speaker-bank',.807,1.008,.010,.344,1.153,.028,.024,.006);
    box(group,m.trim,'tuner-chassis-divider',.623,.988,.014,.012,1.148,.013,.003,.001);
    const ivoryKey = m.front.clone();
    ivoryKey.name = 'Ivory moulded channel keys';
    ivoryKey.color.setHex(0xd7d6cb);
    ivoryKey.metalness = .03;
    for(let i=0;i<8;i++){
      const y=1.512-i*.079;
      box(group,m.rubber,'button-bank-recess',.855,y,.023,.167,.054,.022,.008,.003);
      box(group,ivoryKey,'channel-preset-key',.855,y,.040,.131,.030,.028,.006,.003);
      print(String(i+1),.735,y,.010,0xa9aa95,.018);
    }
    grille(group,m,.806,.668,.025,.326,.423,{pitch:.020,material:m.dark});
    box(group,m.dark,'recessed-maker-label',-.53,.148,-.021,.467,.079,.018,.009,.003);
    screw(group,m,-.717,.148,-.012,.015);
    print(spec.brand,-.525,.149,.021,0xbab8a4,-.010);
    cylinder(group,m.chrome,'recessed-switch-collar',-.049,.151,-.023,.028,.014,32);
    button(group,m,-.049,.151,.017,{z:-.019});
    for(const x of[.176,.385,.58,.78])shaftControl(group,m,x,.148,-.025,.037);
    print('COLOR TELEVISION',-.49,.352,.017,0xb3ac92);
    for(const x of[-.95,.96])screw(group,m,x,.351,.016,.008);
  }else if(index===6){
    print(spec.brand,.096,.435,.034,0x3a3835);
    perforatedGrille(group,m,0,.230,.020,2.00,.308,
      {pitch:.0105,material:m.front,holeRatio:.17,crown:.013,contoured:true,name:'full-width-curved-acoustic-front'});
    for(const [i,x] of [-.627,-.557,-.487,-.406,-.325].entries()){
      button(group,m,x,.264,.014,{z:.036-.013*x*x,metal:i<3});
    }
    box(group,m.silver,'brushed-silver-receiver-inlay',.062,.281,.041,.66,.088,.019,.009,.003);
    box(group,m.dark,'narrow-infrared-receiver-slot',.187,.280,.054,.277,.025,.008,.005,.002);
    for(let i=0;i<14;i++)box(group,m.front,'infrared-window-fine-louvre',
      .067+i*.018,.280,.059,.005,.025,.004,.001,.0003);
    box(group,m.dark,'lower-removable-panel-seam',0,.075,.011,1.81,.009,.009,.003,.001);
  }
}

function finishTelevisionAO(model,index,enabled){
  applyCabinetReflectance(model.group,index);
  if(enabled){
    try{model.group.userData.physicalAOReport=applyPhysicalAO(model.group,PHYSICAL_AO_DATA.models[index]?.tv||[],{mode:'vertex-color',strength:.75});}
    catch(error){model.group.userData.physicalAOReport={applied:[],mismatched:[],missing:[],error:String(error?.message||error)};}
  }
  return model;
}

export function buildPhysicalTelevision(index,{ambientOcclusion=true}={}){
  if(!Number.isInteger(index)||!PHYSICAL_TV_SPECS[index])throw new RangeError(`Unknown physical television ${index}`);
  const spec=PHYSICAL_TV_SPECS[index],group=new THREE.Group(),materials=makeTelevisionFinishes(spec,index),resources=new Set(materials.resources);
  if(index>=7)return finishTelevisionAO(buildBottomTelevision(index,{spec,materials,resources,helpers:{cutCastingSection,mesh,box,cylinder,fixture,grille,perforatedGrille,circularGrille,label,button,dial,glassGeometry,rearHardware,physicalGrainUV,seatPrintedLabels}}),index,ambientOcclusion);
  group.name=`Physical TV ${index+1} — ${spec.name}`;
  const lift=spec.baseLift||0,chassis=new THREE.Group();chassis.name='cabinet-and-service-chassis';chassis.position.y=lift;group.add(chassis);
  const shell=cabinet(chassis,spec,materials);
  const screen=mesh(chassis,glassGeometry(spec.screen,shell.screenZ,spec.glassBulge,shell.aperture),materials.glass,'screen');screen.castShadow=false;screen.userData.screen=true;
  // The cabinet is dimensioned before construction. The control layout moves
  // mounting centres and sizes sheet panels; circular shafts, screws and dial
  // caps retain their physical radii. No anisotropic Object3D scale is used.
  const controls=new THREE.Group(),layout=spec.controlLayoutWidth||1;
  controls.name='dimensioned-front-control-assembly';
  controls.userData.controlLayoutWidth=layout;chassis.add(controls);
  const controlSpec={...spec,panel:{...spec.panel,width:spec.panel.width/layout,x:spec.panel.x/layout},
    controlDivider:spec.controlDivider===undefined?undefined:spec.controlDivider/layout};
  frontControls(controls,controlSpec,materials,resources,index);
  if(lift){
    const {width:w,depth:d}=spec.dimensions;
    if (index === 1) {
      formedPlinth(group,spec,materials.silver,'polystar-integral-plinth',[
        [.081,.037,.034,.90,.040],[.074,.039,.044,.915,.036],
        [.060,.047,.040,.913,.032],[.018,.060,.008,.90,.025],[.003,.062,-.002,.89,.020],
      ]);
    } else box(group,materials.rear,'integrated-low-bottom-chassis',0,lift*.62,-d*.45,w*.90,lift*.76,d*.76,.028,.004);
    for(const x of[-w*.34,w*.34])for(const z of[-d*.16,-d*.72])box(group,materials.rubber,'low-radiused-rubber-support-pad',x,lift*.36,z,.15,lift*.72,.15,.040,.004);
  }
  if(index===6){
    // The closed rear shell already includes its lower return. A second hull
    // here crossed the side wall and produced a triangular wing in three-quarter view.
    formedPlinth(group,spec,materials.silver,'samsung-front-support-flange',[
      [.077,.169,.008,.25,.025],[.063,.164,.014,.25,.025],[.008,.176,.002,.25,.020]
    ]);
  }
  rearHardware(chassis,spec,materials,resources,index);
  seatPrintedLabels(group);
  group.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
  const screenAspect=spec.screen.width/spec.screen.height;
  group.userData={physicalTelevision:true,televisionIndex:index,family:spec.name,photographicTextures:false,canonicalFrontAxis:'+Z',supportY:0};
  const faceFrame={origin:new THREE.Vector3(spec.screen.x,spec.screen.y+lift,shell.screenZ),right:new THREE.Vector3(1,0,0),up:new THREE.Vector3(0,1,0),normal:new THREE.Vector3(0,0,1),width:size.x,height:size.y,screenWidth:spec.screen.width,screenHeight:spec.screen.height};
  return finishTelevisionAO({group,screen,screenAspect,physicalScreenAspect:screenAspect,faceFrame,bounds,dimensions:{width:size.x,height:size.y,depth:size.z},supportY:0,resources,spec},index,ambientOcclusion);
}

