import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { world, smooth } from "../state";
import { hash } from "./util";

type Props = { sand: { value: number }; cursor: { value: THREE.Vector3 }; quality: number };
const ORIGIN = new THREE.Vector3(0, 600, 0);

/** Geometry is shared by every stalk of its distance tier, with actual seed heads. */
function wheatGeometry(tier: number) {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0) => {
    g.rotateZ(rz); g.translate(x, y, z);
    g.deleteAttribute("uv");
    parts.push(g);
  };
  const stalks = tier === 0 ? 2 : 1;
  for (let stem = 0; stem < stalks; stem++) {
    const x = stem * .12, height = .86 - stem * .14;
    if (tier < 2) {
      add(new THREE.CylinderGeometry(.009, .013, height, 3, tier === 0 ? 2 : 1, true), x, height / 2, 0, -.035);
    } else {
      const blade = new THREE.PlaneGeometry(.016, height);
      add(blade, x, height / 2, 0);
    }
    if (tier === 0) {
      // Alternating plump grains form a recognisable ear, with a fine terminal awn.
      for (let row = 0; row < 5; row++) {
        for (const side of [-1, 1]) {
          const grain = new THREE.OctahedronGeometry(1, 0);
          grain.scale(.023 * (1 - row * .08), .048, .019);
          add(grain, x + side * .022 + .025, height + row * .039, 0, -side * .4);
          const awn = new THREE.PlaneGeometry(.003, .105 - row * .008);
          add(awn, x + side * .043 + .025, height + row * .039 + .064, 0, -side * .24);
        }
      }
    } else if(tier === 1) {
      for(let row=0;row<4;row++) for(const side of [-1,1]){
        const grain=new THREE.OctahedronGeometry(1,0);
        grain.scale(.019*(1-row*.10),.037,.015);
        add(grain,x+.025+side*.018,height+row*.034,0,-side*.4);
      }
    } else {
      const ear = new THREE.SphereGeometry(1, 4, 3);
      ear.scale(.028, .105, .02);
      add(ear, x + .025, height + .08, 0, -.10);
    }
    if (tier === 0) {
      const leaf = new THREE.BufferGeometry();
      leaf.setAttribute("position", new THREE.Float32BufferAttribute([x,.29,0,x-.12,.49,.02,x-.06,.4,-.015],3));
      leaf.computeVertexNormals(); parts.push(leaf);
    }
  }
  // All shapes are non-indexed so the primitive types can share one draw call.
  const flat = parts.map(g => g.index ? g.toNonIndexed() : g);
  const result = mergeGeometries(flat)!;
  for (const g of new Set([...parts, ...flat])) g.dispose();
  return result;
}

function WheatTier({ tier, count, sand, cursor }: Props & { tier: number; count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const elapsed = useRef(0);
  const geo = useMemo(() => wheatGeometry(tier), [tier]);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uSand: sand, uCursor: cursor, uGust: { value: 0 }, uOrigin: { value: ORIGIN } }), [sand, cursor]);
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: .92, side: THREE.DoubleSide, emissive: "#b28849", emissiveIntensity: .13 });
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `uniform float uTime, uSand, uGust; uniform vec3 uCursor, uOrigin; varying float vWheatHeight;
      float dune(vec2 p){return sin(p.x*.11+p.y*.05)*1.4+sin(p.x*.23-p.y*.17+1.7)*.7+sin(p.y*.31+p.x*.07+.4)*.45+sin(p.x*.9+p.y*1.1)*.06;}
      ` + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        vec3 base=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz-uOrigin;
        float seed=fract(sin(dot(base.xz,vec2(12.9898,78.233)))*43758.5453);
        float h=clamp(position.y/1.15,0.,1.);
        float bend=h*h;
        float gust=sin(uTime*1.3+base.x*.6+base.z*.35)*.055+sin(uTime*2.1+base.z*.8)*.022;
        transformed.x += bend*(gust*(1.+uGust*2.)+uGust*.23);
        transformed.z += bend*sin(uTime*.8+base.x)*.035;
        vec2 d=base.xz-uCursor.xz;
        transformed.xz += normalize(d+vec2(.001))*(1.-smoothstep(.2,1.35,length(d)))*bend*.2;
        float start=.06+seed*.42+clamp(-base.z/55.,0.,1.)*.08;
        float cleared=smoothstep(start,min(.965,start+.32),uSand);
        float angle=cleared*1.25;
        transformed.xy=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*transformed.xy;
        transformed *= 1.-cleared;
        transformed.y += dune(vec2(base.x,-base.z-20.))*uSand/max(.1,length(instanceMatrix[1].xyz));
        vWheatHeight=h;
      `);
      shader.fragmentShader = "uniform float uSand; varying float vWheatHeight;\n" + shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        diffuseColor.rgb *= mix(.72,1.13,vWheatHeight);
        float haze=smoothstep(15.,58.,length(vViewPosition));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.48,.43,.32),haze*.28);
      `);
      shader.fragmentShader=shader.fragmentShader.replace("#include <opaque_fragment>",`
        float edge=pow(1.-abs(dot(normal,normalize(vViewPosition))),2.);
        float tip=smoothstep(.48,.95,vWheatHeight);
        outgoingLight+=vec3(1.,.47,.105)*edge*(.12+tip*.25)*(1.-uSand);
        #include <opaque_fragment>`);
    };
    return m;
  }, [uniforms]);
  useEffect(() => () => { geo.dispose(); material.dispose(); }, [geo, material]);
  useEffect(() => {
    const object = new THREE.Object3D(), color = new THREE.Color();
    const palette = ["#e3b04f", "#c49342", "#a49c56", "#e0c183"].map(v => new THREE.Color(v));
    const haze = new THREE.Color("#b5ac8c");
    for (let i = 0; i < count; i++) {
      const n = i + tier * 10001;
      const z = tier === 0 ? 4.8-hash(n*1.17+2)*15 : tier === 1 ? 2-hash(n*1.17+2)*29 : -23-hash(n*1.17+2)*40;
      const width = tier === 0 ? 6.5 : tier === 1 ? 16 : 43;
      let x=(hash(n*2.37+4)*2-1)*width;
      // Broad patches plus correlated lean break the uniform picket-fence silhouette.
      const patch=Math.sin(x*.83+Math.sin(z*.42))*Math.cos(z*.63-x*.17);
      x+=Math.sin(z*1.12+x*.7)*.32;
      // Route remains empty rather than filling it with miniature blades.
      const center=.25+Math.sin(z*.24)*.12;
      const path= z > -8 ? .62 : z > -15 ? .48 : z > -24 ? .25 : 0;
      if (Math.abs(x-center)<path) x=center+(x<center?-1:1)*(path+.08+hash(n*4.4+1)*.8);
      if(Math.hypot(x-.25,z+5.5)<1.25) x=.25+(x<.25?-1:1)*(1.25+hash(n*2.8)*.5);
      object.position.set(x,0,z);
      object.rotation.set((hash(n*3.18)-.5)*.35+patch*.12,hash(n*5.17)*Math.PI*2,(hash(n*4.27)-.5)*.48+patch*.16);
      const height=.58+hash(n*7.3)*.66+patch*.19;
      object.scale.set(1.15+hash(n*6.8)*.65,height*(tier===0?.78:.88),1.15+hash(n*6.8)*.65);
      object.updateMatrix(); ref.current.setMatrixAt(i,object.matrix);
      color.copy(palette[Math.floor(hash(n*9.13)*palette.length)]).lerp(haze,tier*.15).multiplyScalar(.88+hash(n*8.61)*.28+patch*.12);
      ref.current.setColorAt(i,color);
    }
    ref.current.instanceMatrix.needsUpdate=true;
    if(ref.current.instanceColor) ref.current.instanceColor.needsUpdate=true;
  }, [count, tier]);
  useFrame((_, dt) => {
    if (!world.playbackPaused && !world.reducedMotion) elapsed.current+=Math.min(dt,.05);
    uniforms.uTime.value=world.reducedMotion?0:elapsed.current;
    uniforms.uGust.value=world.reducedMotion?0:smooth(9.55,10.3,world.t)*(1-smooth(10.3,10.9,world.t));
    ref.current.visible=sand.value<.97;
  });
  return <instancedMesh name={`Wheat-${["near","middle","far"][tier]}`} ref={ref} args={[geo,material,count]} frustumCulled={false} />;
}

export function WheatField(props: Props) {
  return <group name="WheatField">
    {[700,4000,4500].map((count,tier)=><WheatTier key={tier} {...props} tier={tier} count={Math.floor(count*props.quality)} />)}
  </group>;
}
