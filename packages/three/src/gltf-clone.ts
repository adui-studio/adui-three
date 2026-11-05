import { InstancedMesh, PropertyBinding, TextureSource } from "three";
import type { AnimationClip, Group, Object3D, Skeleton, SkinnedMesh } from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import type { GLTFModel } from "./loaders.ts";
import type { ThreeApp } from "./three-app.ts";
import { ResourceScope } from "./resources.ts";
import { gltfAssets } from "./gltf-assets.ts";

export interface CloneGLTFOptions {
  /** Default true. Detached instances are still owned by this app. */
  addToScene?: boolean;
}

export interface GLTFInstance {
  readonly scene: Group;
  /** Independent clip/track data; UUID bindings point to this instance. No source parser. */
  readonly animations: readonly AnimationClip[];
  readonly resources: ResourceScope;
  readonly disposed: boolean;
  dispose(): void;
}

function skinned(node: Object3D): node is SkinnedMesh {
  return "isSkinnedMesh" in node && node.isSkinnedMesh === true;
}

/** Clone the current default-scene hierarchy. Geometry/material/texture mutations remain shared. */
export function cloneGLTF(
  app: ThreeApp,
  source: GLTFModel | GLTFInstance,
  options: CloneGLTFOptions = {},
): GLTFInstance {
  const { addToScene = true } = options;
  if (typeof addToScene !== "boolean") throw new TypeError("addToScene must be boolean");
  const active = (): void => {
    if (app.signal.aborted || app.resources.disposed) throw new Error("ThreeApp has been disposed");
    if (source.disposed || source.resources.disposed)
      throw new Error("GLTF source has been disposed");
  };
  active();
  const assets = gltfAssets.get(source);
  if (!assets) throw new TypeError("Clone a model or instance created by @adui/three");
  const sourceNodes: Object3D[] = [];
  source.scene.traverse((node) => sourceNodes.push(node));
  const contained = new Set(sourceNodes);
  for (const node of sourceNodes)
    if (skinned(node) && node.skeleton.bones.some((bone) => !contained.has(bone)))
      throw new Error("All skeleton bones must be descendants of the cloned scene");

  const lease = assets.acquire();
  const objects = new ResourceScope();
  const resources = new ResourceScope();
  let scene: Group | undefined;
  let disposed = false;
  let instance: GLTFInstance | undefined;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    if (instance) {
      gltfAssets.delete(instance);
      app.resources.untrack(instance);
    }
    const errors: unknown[] = [];
    for (const cleanup of [
      () => resources.dispose(),
      () => scene?.removeFromParent(),
      () => objects.dispose(),
      () => lease.dispose(),
    ]) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, "GLTF instance cleanup failed");
  };
  try {
    scene = clone(source.scene) as Group;
    const clonedNodes: Object3D[] = [];
    const skeletons = new Set<Skeleton>();
    scene.traverse((node) => {
      clonedNodes.push(node);
      if (node instanceof InstancedMesh && node.morphTexture) {
        const image = node.morphTexture.image;
        node.morphTexture.source = new TextureSource({
          data: image.data?.slice() ?? null,
          width: image.width,
          height: image.height,
        });
        node.morphTexture.needsUpdate = true;
      }
      if (skinned(node)) {
        node.skeleton.boneInverses = node.skeleton.boneInverses.map((matrix) => matrix.clone());
        skeletons.add(node.skeleton);
      }
    });
    for (const skeleton of skeletons) objects.track(skeleton);
    for (const node of clonedNodes) objects.track(node);
    if (sourceNodes.length !== clonedNodes.length)
      throw new Error("Clone changed the source hierarchy");
    const uuids = new Map(sourceNodes.map((node, index) => [node.uuid, clonedNodes[index]!.uuid]));
    const animations = Object.freeze(
      ("animations" in source ? source.animations : source.gltf.animations).map((clip) => {
        const copied = clip.clone();
        for (const track of copied.tracks) {
          const path = PropertyBinding.parseTrackName(track.name);
          const uuid = uuids.get(path.nodeName);
          if (!uuid) continue;
          track.name =
            uuid +
            (path.objectName
              ? `.${path.objectName}${path.objectIndex !== undefined ? `[${path.objectIndex}]` : ""}`
              : "") +
            `.${path.propertyName}${path.propertyIndex !== undefined ? `[${path.propertyIndex}]` : ""}`;
        }
        return copied;
      }),
    );
    active(); // Native clone/copy can be overridden and can synchronously dispose an owner.
    instance = {
      scene,
      animations,
      resources,
      get disposed(): boolean {
        return disposed;
      },
      dispose,
    };
    gltfAssets.set(instance, assets);
    app.resources.track(instance);
    if (addToScene) app.scene.add(scene);
    active(); // Native added/childadded handlers may invalidate either owner.
    if (disposed) throw new Error("GLTF instance was disposed during attachment");
    return instance;
  } catch (error) {
    try {
      dispose();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "GLTF cloning and rollback failed");
    }
    throw error;
  }
}
