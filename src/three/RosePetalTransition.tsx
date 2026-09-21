import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useModel } from "./ModelAsset";
import { world, smooth } from "../state";
import { PETAL_CENTRE, rosePetalPosition, rosePetalQuaternion, roseFollowCamera } from "./roseMotion";

/** One real petal: attached -> falling -> rising -> macro cover -> leaving Worlds. */
export function RosePetalTransition({view}:{view:MutableRefObject<THREE.Vector2>}){
  const model=useModel('rose-petal-split');
  const petal=useMemo(()=>model.scene.getObjectByName('RosePetal') as THREE.Mesh,[model]);
  const entered=useRef(world.t<5),version=useRef(world.replayVersion);
  const fx=useMemo(()=>{
    const material=(petal.material as THREE.MeshStandardMaterial).clone();
    material.color.multiply(new THREE.Color('#fff0f0'));material.roughness=.46;
    material.side=THREE.DoubleSide;material.transparent=false;
    const cover={value:0},curtain={value:0};
    // A locked macro exposure prevents the distant scene's lights from flashing
    // across the petal when the hidden camera changes world origins.
    material.onBeforeCompile=shader=>{
      shader.uniforms.uMacroExposure=cover;shader.uniforms.uCurtainColor=curtain;
      shader.fragmentShader='uniform float uMacroExposure,uCurtainColor;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`
        outgoingLight=mix(outgoingLight,diffuseColor.rgb*(.55+.45*max(dot(normal,normalize(vec3(-.3,.5,1.))),0.)),uMacroExposure);
        outgoingLight=mix(outgoingLight,outgoingLight*vec3(.5,.11,.16),uCurtainColor);
        #include <opaque_fragment>`);
    };
    return {material,cover,curtain,position:new THREE.Vector3(),target:new THREE.Vector3(),quaternion:new THREE.Quaternion(),scale:new THREE.Vector3(3,3,3),matrix:new THREE.Matrix4(),relative:new THREE.Matrix4(),exit:new THREE.Matrix4(),reference:new THREE.PerspectiveCamera(42,1.78,.001,700)};
  },[petal]);
  useEffect(()=>{const original=petal.material;petal.material=fx.material;petal.frustumCulled=false;return ()=>{petal.material=original;fx.material.dispose()}},[petal,fx]);
  useFrame(({camera})=>{
    const t=world.t;
    if(version.current!==world.replayVersion){entered.current=t<5;version.current=world.replayVersion}
    if(t<5)entered.current=true;
    petal.visible=t>=4.5&&t<5.34&&(t<5||entered.current);
    if(!petal.visible)return;
    fx.cover.value=smooth(4.84,4.95,t);fx.curtain.value=smooth(5.0,5.13,t);
    petal.scale.setScalar(3);
    if(t<4.5){
      fx.quaternion.setFromEuler(new THREE.Euler(-view.current.y,view.current.x,0));
      petal.position.copy(PETAL_CENTRE).multiplyScalar(3).add(new THREE.Vector3(0,-1.35,0)).applyQuaternion(fx.quaternion).add(new THREE.Vector3(0,-300.7,0));
      petal.quaternion.copy(fx.quaternion);
    }else if(t<5){
      rosePetalPosition(Math.min(t,4.98),petal.position).y-=300;
      rosePetalQuaternion(Math.min(t,4.98),petal.quaternion);
    }else{
      // Preserve the exact covered frame while Worlds changes the camera origin.
      roseFollowCamera(4.98,fx.position,fx.target);fx.position.y-=300;fx.target.y-=300;
      fx.reference.position.copy(fx.position);fx.reference.lookAt(fx.target);fx.reference.updateMatrixWorld();
      rosePetalPosition(4.98,fx.position).y-=300;rosePetalQuaternion(4.98,fx.quaternion);
      fx.matrix.compose(fx.position,fx.quaternion,fx.scale);
      fx.relative.multiplyMatrices(fx.reference.matrixWorldInverse,fx.matrix);
      const exit=smooth(5.04,5.32,t);
      fx.exit.makeTranslation(exit*.45,exit*1.8,-exit*.8);
      fx.relative.premultiply(fx.exit);camera.updateMatrixWorld();
      fx.matrix.multiplyMatrices(camera.matrixWorld,fx.relative);
      fx.matrix.decompose(petal.position,petal.quaternion,petal.scale);
    }
    petal.updateMatrixWorld();
  },.5);
  return <primitive object={petal} dispose={null}/>;
}
