import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { world, smooth } from "../state";

/** Single scene render with a depth texture; DOM text never enters this pass. */
export function FoxDepthOfField({focus,interval=[9.12,9.30,11.5,11.8],nearRadius=9.5}:{focus:THREE.Vector3;interval?:readonly [number,number,number,number];nearRadius?:number}){
  const {gl,size}=useThree();
  const viewportDpr=useThree(state=>state.viewport.dpr);
  const fx=useMemo(()=>{
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
    target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
    const material=new THREE.ShaderMaterial({
      depthTest:false,depthWrite:false,uniforms:{uColor:{value:target.texture},uDepth:{value:target.depthTexture},uPixel:{value:new THREE.Vector2()},uNear:{value:.05},uFar:{value:700},uFocus:{value:14},uStrength:{value:0},uNearRadius:{value:nearRadius}},
      vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
      fragmentShader:`varying vec2 vUv;uniform sampler2D uColor,uDepth;uniform vec2 uPixel;uniform float uNear,uFar,uFocus,uStrength,uNearRadius;
      float distanceAt(vec2 uv){float d=texture2D(uDepth,uv).x;return uNear*uFar/(uFar-d*(uFar-uNear));}
      void main(){
        float depth=distanceAt(vUv);
        float coc=clamp(abs(depth-uFocus)/max(depth,1.)-.12,0.,1.);
        float radius=coc*uStrength*(depth<uFocus?uNearRadius:2.6);
        vec3 sum=texture2D(uColor,vUv).rgb;float weight=1.;
        for(int i=0;i<24;i++){
          float a=float(i)*2.39996323;vec2 off=vec2(cos(a),sin(a))*sqrt((float(i)+.5)/24.)*radius*uPixel;
          float sampleDepth=distanceAt(vUv+off);
          float w=depth<uFocus*.7?1.:1.-smoothstep(1.5,5.,abs(sampleDepth-depth));
          sum+=texture2D(uColor,vUv+off).rgb*w;weight+=w;
        }
        gl_FragColor=vec4(sum/weight,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);scene.add(mesh);
    return {target,material,scene,camera,mesh,point:new THREE.Vector3()};
  },[]);
  useEffect(()=>{
    const dpr=Math.min(viewportDpr,1.5),w=Math.floor(size.width*dpr),h=Math.floor(size.height*dpr);
    fx.target.setSize(w,h);fx.material.uniforms.uPixel.value.set(1/w,1/h);
  },[viewportDpr,size.width,size.height,fx]);
  useEffect(()=>()=>{fx.target.dispose();fx.target.depthTexture?.dispose();fx.material.dispose();fx.mesh.geometry.dispose()},[fx]);
  useFrame(({scene,camera})=>{
    const strength=smooth(interval[0],interval[1],world.t)*(1-smooth(interval[2],interval[3],world.t));
    if(strength<=0){gl.render(scene,camera);return}
    const u=fx.material.uniforms,cam=camera as THREE.PerspectiveCamera;
    u.uNear.value=cam.near;u.uFar.value=cam.far;
    camera.updateMatrixWorld();fx.point.copy(focus).applyMatrix4(camera.matrixWorldInverse);
    u.uFocus.value=Math.max(1,-fx.point.z);u.uStrength.value=strength*(world.quality<.75?.65:1);
    const old=gl.getRenderTarget();gl.setRenderTarget(fx.target);gl.clear();gl.render(scene,camera);
    gl.setRenderTarget(old);gl.render(fx.scene,fx.camera);
  },1);
  return null;
}
