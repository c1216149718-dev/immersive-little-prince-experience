import * as THREE from "three";

/** Restrained textured solar disc, rendered independently of its halo. */
export function createSunDiscMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uOpacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float uOpacity; varying vec2 vUv;
      void main(){vec2 p=vUv*2.0-1.0;float r=length(p);float edge=1.0-smoothstep(.96,1.0,r);
        float cloud=sin(p.x*12.0+sin(p.y*9.0))*sin(p.y*14.0+p.x*4.0)*.015;
        vec3 c=mix(vec3(.87,.55,.26),vec3(1.0,.81,.48),sqrt(max(0.0,1.0-r*r)))+cloud;
        gl_FragColor=vec4(c,edge*uOpacity); }`
  });
}
