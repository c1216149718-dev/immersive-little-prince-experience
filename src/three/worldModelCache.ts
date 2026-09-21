import * as THREE from "three";
import { GLTFLoader, MeshoptDecoder } from "three-stdlib";
import { stageIndex } from "./stageMotion";
import models from "./world-models.json";

type Entry = { scene?: THREE.Group; error?: string; controller: AbortController; users: number; wanted: boolean };
const entries = new Map<number, Entry>();
const listeners = new Set<() => void>();
let revision = 0;
const loader = new GLTFLoader().setMeshoptDecoder(typeof MeshoptDecoder === "function" ? MeshoptDecoder() : MeshoptDecoder);
const emit = () => { revision++; listeners.forEach(fn => fn()); };
export const subscribeWorldModels = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const worldModelSnapshot = () => revision;
export const getWorldModel = (index: number) => entries.get(index);

function disposeScene(scene: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
  const images = new Set<ImageBitmap>();
  textures.forEach(texture => {
    if (typeof ImageBitmap !== "undefined" && texture.image instanceof ImageBitmap) images.add(texture.image);
    texture.dispose();
  });
  images.forEach(image => image.close());
}

function retire(index: number, entry: Entry) {
  if (entry.wanted || entry.users) return;
  entry.controller.abort();
  if (entry.scene) disposeScene(entry.scene);
  if (entries.get(index) === entry) entries.delete(index);
}
function request(index: number) {
  const entry: Entry = { controller: new AbortController(), users: 0, wanted: true };
  entries.set(index, entry);
  const url = `${import.meta.env.BASE_URL}models/worlds/${models[index].id}.glb`;
  fetch(url, { signal: entry.controller.signal }).then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
  }).then(buffer => loader.parseAsync(buffer, url.substring(0, url.lastIndexOf("/") + 1))).then(gltf => {
    if (entry.controller.signal.aborted || entries.get(index) !== entry) {
      disposeScene(gltf.scene);
      return;
    }
    gltf.scene.traverse(object => {
      if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
    });
    entry.scene = gltf.scene;
    emit();
    retire(index, entry);
  }).catch(error => {
    if (entry.controller.signal.aborted) return;
    entry.error = String(error);
    console.error(`World model ${models[index].id} failed to load:`, error);
    emit();
  });
}
export function setWorldResidency(indices: number[]) {
  const wanted = new Set(indices);
  entries.forEach((entry, index) => { entry.wanted = wanted.has(index); retire(index, entry); });
  indices.forEach(index => { if (!entries.has(index)) request(index); });
  emit();
}
export function retainWorldModel(index: number) {
  const entry = entries.get(index);
  if (!entry) return () => {};
  entry.users++;
  return () => { entry.users--; retire(index, entry); };
}
export function retryWorldModel(index: number) {
  const entry = entries.get(index);
  if (!entry?.error) return;
  // Failed requests own no GPU resources.
  entries.delete(index);
  request(index);
  emit();
}
export function currentWorldIndex(t: number) {
  return stageIndex(t);
}
export function isWorldFrameReady(t: number) {
  if (t < 5 || t >= 8.4) return true;
  const entry = entries.get(currentWorldIndex(t));
  // An explicit error leaves chapter navigation available and exposes a retry.
  return Boolean(entry?.scene || entry?.error);
}


