import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  NumberKeyframeTrack,
  Scene,
  Skeleton,
  SkinnedMesh,
  Texture,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { FrameInfo, ThreeApp } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";
import { cloneGLTF, loadGLTF } from "../src/loaders.ts";
import { attachGLTFAnimations } from "../src/animation.ts";

const owners: ResourceScope[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) {
    try {
      owner.dispose();
    } catch {
      // Cleanup failures are asserted by individual tests.
    }
  }
  vi.restoreAllMocks();
});

function host() {
  const controller = new AbortController();
  const callbacks = new Set<(frame: FrameInfo) => void>();
  const state = {
    signal: controller.signal,
    resources: new ResourceScope(),
    scene: new Scene(),
    state: "ready",
    onUpdate(callback: (frame: FrameInfo) => void): () => void {
      callbacks.add(callback);
      return () => {
        callbacks.delete(callback);
      };
    },
  };
  owners.push(state.resources);
  return {
    app: state as unknown as ThreeApp,
    state,
    callbacks,
    tick(delta: number): void {
      for (const callback of Array.from(callbacks)) callback({ delta, elapsed: delta });
    },
    dispose(): void {
      state.state = "disposed";
      controller.abort();
      state.resources.dispose();
    },
  };
}

async function fixture() {
  const owner = host();
  const image = { close: vi.fn() };
  const texture = new Texture(image as unknown as HTMLImageElement);
  const geometry = new BoxGeometry();
  geometry.morphAttributes.position = [geometry.attributes.position!.clone()];
  const material = new MeshBasicMaterial({ map: texture });
  const mesh = new Mesh(geometry, material);
  const bone = new Bone();
  const skinGeometry = geometry.clone();
  const vertices = skinGeometry.attributes.position!.count;
  skinGeometry.setAttribute(
    "skinIndex",
    new Float32BufferAttribute(new Float32Array(vertices * 4), 4),
  );
  const weights = new Float32Array(vertices * 4);
  for (let i = 0; i < vertices; i++) weights[i * 4] = 1;
  skinGeometry.setAttribute("skinWeight", new Float32BufferAttribute(weights, 4));
  const skin = new SkinnedMesh(skinGeometry, material);
  const skeleton = new Skeleton([bone]);
  skin.add(bone);
  skin.bind(skeleton);
  const scene = new Group();
  scene.add(mesh, skin);
  const clip = new AnimationClip("Move", 2, [
    new NumberKeyframeTrack(`${mesh.uuid}.position[x]`, [0, 2], [0, 4]),
    new NumberKeyframeTrack(`${bone.uuid}.position[y]`, [0, 2], [0, 2]),
    new NumberKeyframeTrack(`${mesh.uuid}.morphTargetInfluences[0]`, [0, 2], [0, 1]),
  ]);
  const gltf: GLTF = {
    scene,
    scenes: [scene],
    animations: [clip],
    cameras: [],
    asset: { version: "2.0" },
    userData: {},
    parser: {} as GLTF["parser"],
  };
  const load = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockResolvedValue(gltf);
  const model = await loadGLTF(owner.app, "original.glb");
  return {
    owner,
    model,
    scene,
    mesh,
    bone,
    skin,
    skeleton,
    geometry,
    material,
    texture,
    image,
    clip,
    load,
  };
}

test("clones independently own nodes, bones, morph weights and clip arrays while assets remain shared", async () => {
  const env = await fixture();
  const copy = cloneGLTF(env.owner.app, env.model);
  const mesh = copy.scene.children[0] as Mesh;
  const skin = copy.scene.children[1] as SkinnedMesh;
  expect(copy.scene.parent).toBe(env.owner.state.scene);
  expect(copy.scene.uuid).not.toBe(env.scene.uuid);
  expect(mesh.geometry).toBe(env.geometry);
  expect(mesh.material).toBe(env.material);
  expect(mesh.morphTargetInfluences).not.toBe(env.mesh.morphTargetInfluences);
  expect(skin.skeleton).not.toBe(env.skeleton);
  expect(skin.skeleton.bones[0]).toBe(skin.children[0]);
  expect(skin.skeleton.boneInverses[0]).not.toBe(env.skeleton.boneInverses[0]);
  skin.skeleton.boneInverses[0]!.elements[12] = 9;
  expect(env.skeleton.boneInverses[0]!.elements[12]).not.toBe(9);
  expect(copy.animations[0]).not.toBe(env.clip);
  expect(copy.animations[0]!.tracks[0]!.values).not.toBe(env.clip.tracks[0]!.values);
  expect(copy.animations[0]!.tracks[0]!.name).toBe(`${mesh.uuid}.position[x]`);
  expect(Object.isFrozen(copy.animations)).toBe(true);
  expect(env.load).toHaveBeenCalledOnce();
  expect(env.owner.callbacks.size).toBe(0);
});

test("UUID node, bone and morph tracks sample independently, including a clone of a clone", async () => {
  const env = await fixture();
  const other = host();
  const first = cloneGLTF(other.app, env.model);
  const second = cloneGLTF(env.owner.app, first, { addToScene: false });
  const sourceAnimation = attachGLTFAnimations(env.owner.app, env.model);
  const animation = attachGLTFAnimations(other.app, first);
  const next = attachGLTFAnimations(env.owner.app, second);
  for (const handle of [sourceAnimation, animation, next]) handle.play(0);
  animation.seek(1);
  next.seek(0.5);
  expect(first.scene.children[0]!.position.x).toBeCloseTo(2);
  expect((first.scene.children[1] as SkinnedMesh).skeleton.bones[0]!.position.y).toBeCloseTo(1);
  expect((first.scene.children[0] as Mesh).morphTargetInfluences![0]).toBeCloseTo(0.5);
  expect(second.scene.children[0]!.position.x).toBeCloseTo(1);
  expect(env.mesh.position.x).toBe(0);
  expect(env.bone.position.y).toBe(0);
  expect(second.scene.parent).toBeNull();
  env.model.dispose();
  expect(sourceAnimation.disposed).toBe(true);
  expect(animation.disposed).toBe(false);
  expect(next.disposed).toBe(false);
  animation.resume();
  other.tick(0.25);
  expect(first.scene.children[0]!.position.x).toBeCloseTo(2.5);
  expect(second.scene.children[0]!.position.x).toBeCloseTo(1);
});

test("source cleanup releases local skeletons immediately and shared assets only after the last instance", async () => {
  const env = await fixture();
  const other = host();
  const first = cloneGLTF(other.app, env.model);
  const second = cloneGLTF(other.app, first);
  const geometry = vi.spyOn(env.geometry, "dispose");
  const material = vi.spyOn(env.material, "dispose");
  const texture = vi.spyOn(env.texture, "dispose");
  const skeleton = vi.spyOn(env.skeleton, "dispose");
  const cloneSkeleton = vi.spyOn((first.scene.children[1] as SkinnedMesh).skeleton, "dispose");
  env.owner.dispose();
  expect(skeleton).toHaveBeenCalledOnce();
  expect(geometry).not.toHaveBeenCalled();
  expect(env.image.close).not.toHaveBeenCalled();
  first.dispose();
  expect(cloneSkeleton).toHaveBeenCalledOnce();
  expect(geometry).not.toHaveBeenCalled();
  second.dispose();
  second.dispose();
  expect(geometry).toHaveBeenCalledOnce();
  expect(material).toHaveBeenCalledOnce();
  expect(texture).toHaveBeenCalledOnce();
  expect(env.image.close).toHaveBeenCalledOnce();
  expect(first.scene.parent).toBeNull();
  expect(second.scene.parent).toBeNull();
});

test("removing a clone first never disposes source resources or stops its animation", async () => {
  const env = await fixture();
  const copy = cloneGLTF(env.owner.app, env.model);
  const first = attachGLTFAnimations(env.owner.app, env.model);
  const second = attachGLTFAnimations(env.owner.app, copy);
  first.play(0);
  second.play(0);
  const dispose = vi.spyOn(env.geometry, "dispose");
  copy.dispose();
  expect(second.disposed).toBe(true);
  expect(first.disposed).toBe(false);
  expect(dispose).not.toHaveBeenCalled();
  env.owner.tick(0.5);
  expect(env.mesh.position.x).toBeCloseTo(1);
  env.model.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});

test("last-owner errors still release assets, detach, uncache animations and attempt all cleanup", async () => {
  const env = await fixture();
  const copy = cloneGLTF(env.owner.app, env.model);
  const animation = attachGLTFAnimations(env.owner.app, copy);
  animation.play(0);
  const calls: string[] = [];
  copy.resources.track({
    dispose: () => {
      calls.push("extension");
      throw new Error("extension");
    },
  });
  env.geometry.addEventListener("dispose", () => {
    calls.push("geometry");
    throw new Error("geometry");
  });
  const material = vi.spyOn(env.material, "dispose");
  env.model.dispose();
  expect(() => copy.dispose()).toThrow(AggregateError);
  expect(animation.disposed).toBe(true);
  expect(animation.mixer.stats.actions.total).toBe(0);
  expect(copy.scene.parent).toBeNull();
  expect(material).toHaveBeenCalledOnce();
  expect(env.image.close).toHaveBeenCalledOnce();
  expect(calls).toEqual(["extension", "geometry"]);
  expect(() => copy.dispose()).not.toThrow();
});

test("rejects disposed/foreign owners, invalid mounting options and external skeleton bones before cloning", async () => {
  const env = await fixture();
  const other = host();
  other.dispose();
  expect(() => cloneGLTF(other.app, env.model)).toThrow("disposed");
  expect(() => cloneGLTF(env.owner.app, { ...env.model })).toThrow("created by");
  expect(() =>
    cloneGLTF(env.owner.app, env.model, { addToScene: 1 as unknown as boolean }),
  ).toThrow(TypeError);
  env.skin.remove(env.bone);
  expect(() => cloneGLTF(env.owner.app, env.model)).toThrow("descendants");
  env.skin.add(env.bone);
  env.model.dispose();
  expect(() => cloneGLTF(env.owner.app, env.model)).toThrow("disposed");
});

test("bad clip binding rollback relinquishes only its temporary lease", async () => {
  const env = await fixture();
  const dispose = vi.spyOn(env.geometry, "dispose");
  env.clip.tracks[0]!.name = "invalid track";
  expect(() => cloneGLTF(env.owner.app, env.model)).toThrow("parse");
  expect(env.owner.state.scene.children).toEqual([env.scene]);
  expect(dispose).not.toHaveBeenCalled();
  env.model.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});

test("synchronous attachment disposal rolls back hierarchy and releases the lease", async () => {
  const env = await fixture();
  const other = host();
  other.state.scene.addEventListener("childadded", () => other.dispose());
  expect(() => cloneGLTF(other.app, env.model)).toThrow("disposed");
  expect(other.state.scene.children).toHaveLength(0);
  const dispose = vi.spyOn(env.geometry, "dispose");
  env.model.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});

test("source invalidation inside copy rolls back the retained asset snapshot", async () => {
  const env = await fixture();
  const native = env.scene.clone.bind(env.scene);
  vi.spyOn(env.scene, "clone").mockImplementation((recursive) => {
    const copied = native(recursive);
    env.model.dispose();
    return copied;
  });
  const dispose = vi.spyOn(env.geometry, "dispose");
  expect(() => cloneGLTF(env.owner.app, env.model)).toThrow("disposed");
  expect(dispose).toHaveBeenCalledOnce();
  expect(env.image.close).toHaveBeenCalledOnce();
});

test("native instanced matrices and morph data belong to each cloned object", async () => {
  const env = await fixture();
  const instanced = new InstancedMesh(env.geometry, env.material, 2);
  const morph = new Mesh(env.geometry, env.material);
  morph.morphTargetInfluences![0] = 0.25;
  instanced.setMorphAt(0, morph);
  env.scene.add(instanced); // Added resources remain borrowed; only cloned nodes become instance-owned.
  const copy = cloneGLTF(env.owner.app, env.model);
  const cloned = copy.scene.children[2] as InstancedMesh;
  expect(cloned.instanceMatrix).not.toBe(instanced.instanceMatrix);
  expect(cloned.morphTexture!.source).not.toBe(instanced.morphTexture!.source);
  expect(cloned.morphTexture!.image.data).not.toBe(instanced.morphTexture!.image.data);
  morph.morphTargetInfluences![0] = 0.75;
  cloned.setMorphAt(0, morph);
  instanced.getMorphAt(0, morph);
  expect(morph.morphTargetInfluences![0]).toBeCloseTo(0.25);
  const dispose = vi.spyOn(cloned.morphTexture!, "dispose");
  copy.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  instanced.dispose();
});

test("clones snapshot current pose and clip data and do not copy model extension scopes", async () => {
  const env = await fixture();
  const hook = { dispose: vi.fn() };
  env.model.resources.track(hook);
  env.mesh.position.x = 7;
  const first = cloneGLTF(env.owner.app, env.model);
  const values = first.animations[0]!.tracks[0]!.values.slice();
  env.clip.tracks[0]!.values[1] = 100;
  expect(first.scene.children[0]!.position.x).toBe(7);
  expect(first.animations[0]!.tracks[0]!.values).toEqual(values);
  first.dispose();
  expect(hook.dispose).not.toHaveBeenCalled();
  env.model.dispose();
  expect(hook.dispose).toHaveBeenCalledOnce();
});

test("shared snapshot retains all originally loaded scenes and excludes later borrowed assets", async () => {
  const env = await fixture();
  // A separate original load captures a second scene, sharing one original material.
  env.model.dispose();
  const extra = new Group();
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial();
  extra.add(new Mesh(geometry, material));
  const scene = new Group();
  scene.add(new Mesh(geometry, material));
  const gltf: GLTF = {
    ...env.model.gltf,
    scene,
    scenes: [scene, extra],
    animations: [],
  };
  env.load.mockResolvedValue(gltf);
  const model = await loadGLTF(env.owner.app, "multi.glb");
  const borrowedGeometry = new BoxGeometry();
  const borrowedMaterial = new MeshBasicMaterial();
  scene.add(new Mesh(borrowedGeometry, borrowedMaterial));
  const borrowed = vi.spyOn(borrowedGeometry, "dispose");
  const dispose = vi.spyOn(geometry, "dispose");
  const copy = cloneGLTF(env.owner.app, model);
  model.dispose();
  expect(dispose).not.toHaveBeenCalled();
  copy.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  expect(borrowed).not.toHaveBeenCalled();
  borrowedGeometry.dispose();
  borrowedMaterial.dispose();
});

test("named bindings and native interpolation factories survive independent clip copies", async () => {
  const env = await fixture();
  env.mesh.name = "Named";
  env.clip.tracks[0]!.name = "Named.position[x]";
  const factory: unknown = Reflect.get(env.clip.tracks[0]!, "createInterpolant");
  const copy = cloneGLTF(env.owner.app, env.model);
  expect(copy.animations[0]!.tracks[0]!.name).toBe("Named.position[x]");
  expect(Reflect.get(copy.animations[0]!.tracks[0]!, "createInterpolant")).toBe(factory);
  const animation = attachGLTFAnimations(env.owner.app, copy);
  animation.play(0);
  animation.seek(1);
  expect(copy.scene.children[0]!.position.x).toBeCloseTo(2);
  expect(env.mesh.position.x).toBe(0);
});

test("a disposed extension scope prevents new cloning without revoking existing instances", async () => {
  const env = await fixture();
  const copy = cloneGLTF(env.owner.app, env.model);
  env.model.resources.dispose();
  expect(() => cloneGLTF(env.owner.app, env.model)).toThrow("disposed");
  const next = cloneGLTF(env.owner.app, copy);
  expect(next.disposed).toBe(false);
  env.model.dispose();
  copy.dispose();
  const geometry = vi.spyOn(env.geometry, "dispose");
  next.dispose();
  expect(geometry).toHaveBeenCalledOnce();
});
