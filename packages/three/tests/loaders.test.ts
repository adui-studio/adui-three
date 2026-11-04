import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  Bone,
  BoxGeometry,
  Cache,
  Group,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Skeleton,
  SkinnedMesh,
  Texture,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { ThreeApp, ThreeAppState } from "../src/index.ts";
import { ResourceScope } from "../src/resources.ts";
import { loadGLTF } from "../src/loaders.ts";

afterEach(() => {
  vi.restoreAllMocks();
  Cache.enabled = false;
});

function host() {
  const controller = new AbortController();
  const state = {
    scene: new Scene(),
    resources: new ResourceScope(),
    signal: controller.signal,
    state: "ready" as ThreeAppState,
  };
  return {
    state,
    app: state as unknown as ThreeApp,
    dispose(): void {
      state.state = "disposed";
      controller.abort();
      state.resources.dispose();
      state.scene.clear();
    },
  };
}

function asset() {
  const image = { close: vi.fn() };
  const texture = new Texture(image as unknown as HTMLImageElement);
  const geometry = new BoxGeometry();
  const material = new MeshStandardMaterial({ map: texture, normalMap: texture, roughness: 0.7 });
  const scene = new Group();
  scene.add(new Mesh(geometry, material), new Mesh(geometry, material));
  const gltf: GLTF = {
    scene,
    scenes: [scene],
    animations: [],
    cameras: [],
    asset: { version: "2.0" },
    userData: {},
    parser: {} as GLTF["parser"],
  };
  return {
    gltf,
    scene,
    geometry,
    material,
    texture,
    image,
    geometryDisposal: vi.spyOn(geometry, "dispose"),
    materialDisposal: vi.spyOn(material, "dispose"),
    textureDisposal: vi.spyOn(texture, "dispose"),
  };
}

function transport() {
  const requests: Array<{
    url: string;
    manager: LoadingManager;
    resolve: (gltf: GLTF) => void;
    reject: (error: unknown) => void;
    progress?: (event: ProgressEvent) => void;
  }> = [];
  const load = vi.spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(function (
    this: GLTFLoader,
    url,
    progress,
  ) {
    return new Promise<GLTF>((resolve, reject) => {
      requests.push({ url, manager: this.manager, resolve, reject, progress });
    });
  });
  return { requests, load };
}

test("loaded model keeps native materials and owns decoded resources exactly once", async () => {
  const env = host();
  const data = asset();
  const io = transport();
  const promise = loadGLTF(env.app, "/model.glb?version=2");
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  expect(model.gltf).toBe(data.gltf);
  expect(model.scene.parent).toBe(env.state.scene);
  expect(data.material.roughness).toBe(0.7);
  expect(data.material.map).toBe(data.texture);
  model.dispose();
  model.dispose();
  env.dispose();
  expect(model.disposed).toBe(true);
  expect(data.scene.parent).toBeNull();
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
  expect(data.materialDisposal).toHaveBeenCalledOnce();
  expect(data.textureDisposal).toHaveBeenCalledOnce();
  expect(data.image.close).toHaveBeenCalledOnce();
});

test("detached models remain owned and are released by the host", async () => {
  const env = host();
  const data = asset();
  const io = transport();
  const promise = loadGLTF(env.app, "data:model", { addToScene: false });
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  expect(model.scene.parent).toBeNull();
  env.dispose();
  expect(model.disposed).toBe(true);
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
});

test("pre-aborted and disposed hosts never start a request", async () => {
  const env = host();
  const io = transport();
  const controller = new AbortController();
  controller.abort();
  await expect(loadGLTF(env.app, "model.glb", { signal: controller.signal })).rejects.toMatchObject(
    { name: "AbortError" },
  );
  env.dispose();
  await expect(loadGLTF(env.app, "model.glb")).rejects.toMatchObject({ name: "AbortError" });
  expect(io.load).not.toHaveBeenCalled();
});

test("abort rejects immediately and disposes the late decoded model without attaching", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const controller = new AbortController();
  const promise = loadGLTF(env.app, "model.glb", { signal: controller.signal });
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  io.requests[0]!.resolve(data.gltf);
  await Promise.resolve();
  expect(env.state.scene.children).toHaveLength(0);
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
  expect(data.image.close).toHaveBeenCalledOnce();
  env.dispose();
});

test("host disposal and standalone scope disposal cancel pending work", async () => {
  for (const mode of ["app", "scope"]) {
    const env = host();
    const io = transport();
    const data = asset();
    const promise = loadGLTF(env.app, "model.glb");
    if (mode === "app") env.dispose();
    else env.state.resources.dispose();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    io.requests[0]!.resolve(data.gltf);
    await Promise.resolve();
    expect(data.geometryDisposal).toHaveBeenCalledOnce();
    expect(env.state.scene.children).toHaveLength(0);
    env.dispose();
    vi.restoreAllMocks();
  }
});

test("one task cancellation does not abort its manager or another task with the same URL", async () => {
  const env = host();
  const io = transport();
  const first = asset();
  const second = asset();
  const controller = new AbortController();
  const cancelled = loadGLTF(env.app, "same.glb", { signal: controller.signal });
  const surviving = loadGLTF(env.app, "same.glb");
  const abort = vi.spyOn(io.requests[0]!.manager, "abort");
  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  io.requests[0]!.resolve(first.gltf);
  io.requests[1]!.resolve(second.gltf);
  const model = await surviving;
  expect(first.geometryDisposal).toHaveBeenCalledOnce();
  expect(model.scene.parent).toBe(env.state.scene);
  expect(abort).not.toHaveBeenCalled();
  env.dispose();
});

test("late loader errors after cancellation are consumed", async () => {
  const env = host();
  const io = transport();
  const controller = new AbortController();
  const promise = loadGLTF(env.app, "model.glb", { signal: controller.signal });
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  io.requests[0]!.reject(new Error("late network failure"));
  await Promise.resolve();
  env.dispose();
});

test("ordinary loader errors reject with the original cause and remove lifecycle subscriptions", async () => {
  const env = host();
  const io = transport();
  const remove = vi.spyOn(env.state.signal, "removeEventListener");
  const promise = loadGLTF(env.app, "bad.gltf");
  const error = new Error("invalid glTF");
  io.requests[0]!.reject(error);
  await expect(promise).rejects.toBe(error);
  expect(remove).toHaveBeenCalledOnce();
  env.dispose();
});

test("unknown byte totals stay unknown and progress stops after cancel", async () => {
  const env = host();
  const io = transport();
  const progress = vi.fn();
  const controller = new AbortController();
  const promise = loadGLTF(env.app, "model.glb", {
    signal: controller.signal,
    onProgress: progress,
  });
  io.requests[0]!.progress!({ loaded: 50, total: 0, lengthComputable: false } as ProgressEvent);
  expect(progress).toHaveBeenLastCalledWith({ loaded: 50, total: null, ratio: null });
  io.requests[0]!.progress!({ loaded: 50, total: 100, lengthComputable: true } as ProgressEvent);
  expect(progress).toHaveBeenLastCalledWith({ loaded: 50, total: 100, ratio: 0.5 });
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  io.requests[0]!.progress!({ loaded: 100, total: 100 } as ProgressEvent);
  expect(progress).toHaveBeenCalledTimes(2);
  io.requests[0]!.reject(new Error("late"));
  env.dispose();
});

test("a throwing progress callback fails only its own task and still releases a late result", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const error = new Error("progress failed");
  const promise = loadGLTF(env.app, "model.glb", {
    onProgress(): void {
      throw error;
    },
  });
  expect(() => io.requests[0]!.progress!({ loaded: 1, total: 2 } as ProgressEvent)).not.toThrow();
  await expect(promise).rejects.toBe(error);
  io.requests[0]!.resolve(data.gltf);
  await Promise.resolve();
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
  env.dispose();
});

test("all glTF scenes and shared skeletons are included in the ownership snapshot", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const extra = new Group();
  const skeleton = new Skeleton([new Bone()]);
  const releaseSkeleton = vi.spyOn(skeleton, "dispose");
  const a = new SkinnedMesh(data.geometry, data.material);
  const b = new SkinnedMesh(data.geometry, data.material);
  a.skeleton = skeleton;
  b.skeleton = skeleton;
  extra.add(a, b);
  data.gltf.scenes.push(extra);
  const promise = loadGLTF(env.app, "model.gltf");
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  model.dispose();
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
  expect(releaseSkeleton).toHaveBeenCalledOnce();
  env.dispose();
});

test("later borrowed objects and replacement materials are not accidentally taken into ownership", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const promise = loadGLTF(env.app, "model.glb");
  io.requests[0]!.resolve(data.gltf);
  const model = await promise;
  const borrowedGeometry = new BoxGeometry();
  const borrowedMaterial = new MeshStandardMaterial();
  const borrowed = new Mesh(borrowedGeometry, borrowedMaterial);
  const geometrySpy = vi.spyOn(borrowedGeometry, "dispose");
  const materialSpy = vi.spyOn(borrowedMaterial, "dispose");
  model.scene.add(borrowed);
  (model.scene.children[0] as Mesh).material = borrowedMaterial;
  model.dispose();
  expect(geometrySpy).not.toHaveBeenCalled();
  expect(materialSpy).not.toHaveBeenCalled();
  expect(data.materialDisposal).toHaveBeenCalledOnce();
  borrowedGeometry.dispose();
  borrowedMaterial.dispose();
  env.dispose();
});

test("cached or explicitly borrowed image backing data is preserved", async () => {
  for (const mode of ["cache", "borrowed"]) {
    const env = host();
    const io = transport();
    const data = asset();
    Cache.enabled = mode === "cache";
    const promise = loadGLTF(env.app, "model.glb", { closeImageBitmaps: mode !== "borrowed" });
    io.requests[0]!.resolve(data.gltf);
    (await promise).dispose();
    expect(data.image.close).not.toHaveBeenCalled();
    expect(data.textureDisposal).toHaveBeenCalledOnce();
    env.dispose();
    Cache.enabled = false;
    vi.restoreAllMocks();
  }
});

test("synchronous scene-added disposal cannot resolve with a dead model", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  env.state.scene.addEventListener("childadded", () => env.dispose());
  const promise = loadGLTF(env.app, "model.glb");
  io.requests[0]!.resolve(data.gltf);
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  expect(data.scene.parent).toBeNull();
  expect(data.geometryDisposal).toHaveBeenCalledOnce();
});

test("cleanup failure still releases other resources and a late failure is reported", async () => {
  const env = host();
  const io = transport();
  const data = asset();
  const onCleanupError = vi.fn();
  data.geometryDisposal.mockImplementation(() => {
    throw new Error("geometry release failed");
  });
  const controller = new AbortController();
  const promise = loadGLTF(env.app, "model.glb", { signal: controller.signal, onCleanupError });
  controller.abort();
  await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  io.requests[0]!.resolve(data.gltf);
  await Promise.resolve();
  expect(onCleanupError).toHaveBeenCalledOnce();
  expect(data.textureDisposal).toHaveBeenCalledOnce();
  expect(data.image.close).toHaveBeenCalledOnce();
  env.dispose();
});

test("invalid URLs reject before starting transport", async () => {
  const env = host();
  const io = transport();
  await expect(loadGLTF(env.app, "  ")).rejects.toThrow(TypeError);
  expect(io.load).not.toHaveBeenCalled();
  env.dispose();
});
