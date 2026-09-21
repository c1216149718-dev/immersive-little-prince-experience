import * as THREE from "three";

export interface Spring { value: number; velocity: number }
export function spring(s: Spring, target: number, dt: number, limit: number) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  target = THREE.MathUtils.clamp(target, -limit, limit);
  for (let i = 0; i < steps; i++) {
    s.velocity += ((target - s.value) * 48 - s.velocity * 13) * h;
    s.value += s.velocity * h;
  }
  s.value = THREE.MathUtils.clamp(s.value, -limit, limit);
  return s.value;
}

/** Velocity and yaw are measured in the controller root's moving tangent frame. */
export class LocalMotion {
  private previous = new THREE.Vector3();
  private previousForward = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private forward = new THREE.Vector3();
  private local = new THREE.Vector3();
  private initialized = false;
  private lastSpeed = 0;
  forwardSpeed = 0;
  sideSpeed = 0;
  acceleration = 0;
  turnSpeed = 0;

  update(root: THREE.Object3D, dt: number) {
    root.getWorldQuaternion(this.q).invert();
    root.getWorldPosition(this.local);
    const position = this.local.clone();
    this.local.sub(this.previous).applyQuaternion(this.q);
    this.previous.copy(position);
    this.forward.set(0, 0, -1).applyQuaternion(this.q.clone().invert());
    const oldForward = this.previousForward.clone().applyQuaternion(this.q);
    this.previousForward.copy(this.forward);
    if (!this.initialized || this.local.length() > .3 || dt <= 0) {
      this.initialized = true;
      this.forwardSpeed = this.sideSpeed = this.acceleration = this.turnSpeed = this.lastSpeed = 0;
      return;
    }
    this.forwardSpeed = -this.local.z / dt;
    this.sideSpeed = this.local.x / dt;
    this.acceleration = THREE.MathUtils.clamp((this.forwardSpeed - this.lastSpeed) / dt, -5, 5);
    this.lastSpeed = this.forwardSpeed;
    this.turnSpeed = THREE.MathUtils.clamp(Math.atan2(oldForward.x, -oldForward.z) / dt, -4, 4);
  }
}
