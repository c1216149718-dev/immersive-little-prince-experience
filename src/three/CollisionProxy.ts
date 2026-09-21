import * as THREE from "three";

export interface SphereObstacle { id: string; direction: number[]; radius: number }

/** Small spherical footprints, independent of the visual mesh and its normals. */
export function makeSphereCollision(obstacles: SphereObstacle[], radius = 2.4, clearance = .105) {
  const proxies=obstacles.map(o=>({id:o.id,n:new THREE.Vector3().fromArray(o.direction).normalize(),angle:(o.radius+clearance)/radius}));
  const previous=new THREE.Vector3(),candidate=new THREE.Vector3(),tangent=new THREE.Vector3();
  return {
    proxies,
    move(position: THREE.Vector3, displacement: THREE.Vector3, out: THREE.Vector3) {
      out.copy(position).normalize();
      // Bound travel per solve so a long frame cannot tunnel through a footprint.
      const steps=Math.max(1,Math.ceil(displacement.length()/.035));
      for(let i=0;i<steps;i++){
        previous.copy(out);candidate.copy(out).multiplyScalar(radius).addScaledVector(displacement,1/steps).normalize();
        for(let pass=0;pass<3;pass++)for(const p of proxies){
          if(candidate.dot(p.n)>=Math.cos(p.angle)){
            tangent.copy(candidate).addScaledVector(p.n,-candidate.dot(p.n));
            if(tangent.lengthSq()<1e-10)tangent.copy(previous).addScaledVector(p.n,-previous.dot(p.n));
            if(tangent.lengthSq()<1e-10)tangent.crossVectors(p.n,Math.abs(p.n.y)<.9?THREE.Object3D.DEFAULT_UP:new THREE.Vector3(1,0,0));
            candidate.copy(p.n).multiplyScalar(Math.cos(p.angle+1e-5)).addScaledVector(tangent.normalize(),Math.sin(p.angle+1e-5));
          }
        }
        // In tightly adjacent obstacles, staying outside is preferable to pushing through.
        if(proxies.every(p=>candidate.dot(p.n)<Math.cos(p.angle)-1e-9))out.copy(candidate);
      }
      return out.multiplyScalar(radius);
    },
  };
}
