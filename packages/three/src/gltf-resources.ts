import { Cache } from "three";
import type { BufferGeometry, Material, Object3D, Skeleton, Texture } from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { ResourceScope } from "./resources.ts";

type ModelNode = Object3D & {
  geometry?: BufferGeometry;
  material?: Material | Material[];
  skeleton?: Skeleton;
};

interface ClosableImage {
  close(): void;
}

function closableImage(image: unknown): image is ClosableImage {
  return (
    typeof image === "object" &&
    image !== null &&
    "close" in image &&
    typeof image.close === "function"
  );
}

/** Snapshot decoded ownership before callers can attach borrowed objects or replace materials. */
export function collectGLTFResources(gltf: GLTF, closeImages: boolean): ResourceScope {
  const resources = new ResourceScope();
  const nodes = new Set<ModelNode>();
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const skeletons = new Set<Skeleton>();
  const images = new Set<ClosableImage>();
  for (const root of new Set([gltf.scene, ...gltf.scenes])) {
    root.traverse((object) => {
      const node = object as ModelNode;
      nodes.add(node);
      if (node.geometry) geometries.add(node.geometry);
      if (node.skeleton) skeletons.add(node.skeleton);
      for (const material of Array.isArray(node.material)
        ? node.material
        : node.material
          ? [node.material]
          : []) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (
            value &&
            typeof value === "object" &&
            "isTexture" in value &&
            value.isTexture === true
          )
            textures.add(value as Texture);
        }
      }
    });
  }
  for (const texture of textures) {
    const data: unknown = texture.source.data;
    for (const image of Array.isArray(data) ? data : [data])
      if (closableImage(image)) images.add(image);
  }
  // Register images first so textures release their GPU state before image backing data closes.
  for (const image of images)
    resources.track({
      dispose: () => {
        if (closeImages && !Cache.enabled) image.close();
      },
    });
  for (const texture of textures) resources.track(texture);
  for (const material of materials) resources.track(material);
  for (const geometry of geometries) resources.track(geometry);
  for (const skeleton of skeletons) resources.track(skeleton);
  for (const node of nodes) resources.track(node);
  return resources;
}
