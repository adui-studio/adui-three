import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Use a real DOM-free Node environment. Throwing getters would also reject safe `typeof window` checks.
for (const name of ["window", "document", "Worker", "ResizeObserver"])
  assert.equal(typeof globalThis[name], "undefined", `${name} must be absent in the consumer`);
globalThis.fetch = () => {
  throw new Error("Unexpected import-time network access");
};

const expected = {
  "@adui/three": ["ResourceScope", "ThreeApp", "OrthographicThreeApp"],
  "@adui/three/controls": ["attachOrbitControls", "attachTransformControls"],
  "@adui/three/loaders": ["loadGLTF", "cloneGLTF"],
  "@adui/three/interaction": ["attachPicking"],
  "@adui/three/labels": ["attachDOMLabels"],
  "@adui/three/animation": ["attachGLTFAnimations", "followPath"],
  "@adui/three/camera": [
    "computeObjectFrame",
    "fitObject",
    "transitionToObject",
    "computeOrthographicFrame",
    "fitOrthographicObject",
    "transitionOrthographicToObject",
    "captureCameraView",
    "restoreCameraView",
  ],
  "@adui/three/postprocessing": ["attachBloom", "attachPostprocessing"],
  "@adui/three/environment": ["loadHDR", "loadEXR", "attachEnvironment"],
  "@adui/three/textures": ["loadTexture", "loadKTX2"],
  "@adui/three/capture": ["captureFrame"],
  "@adui/three/geometry": ["createInstancedMesh"],
};
const development = process.argv.includes("--resolve-only");
for (const [specifier, names] of Object.entries(expected)) {
  const target = import.meta.resolve(specifier);
  assert.ok(target.endsWith(development ? ".ts" : ".mjs"), `Unexpected export target: ${target}`);
  assert.ok(target.includes(development ? "/src/" : "/dist/"));
  await access(fileURLToPath(target));
  if (!development) assert.deepEqual(Object.keys(await import(specifier)).sort(), names.sort());
}
if (!development) {
  const { ResourceScope } = await import("@adui/three");
  const scope = new ResourceScope();
  let disposed = 0;
  scope.track({
    dispose() {
      disposed++;
    },
  });
  scope.dispose();
  scope.dispose();
  assert.equal(disposed, 1);
  const { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera } = await import("three");
  const { computeObjectFrame } = await import("@adui/three/camera");
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const camera = new PerspectiveCamera();
  camera.position.set(3, 2, 5);
  camera.lookAt(0, 0, 0);
  assert.ok(computeObjectFrame(camera, mesh).distance > 0);
  const { captureCameraView, restoreCameraView } = await import("@adui/three/camera");
  const viewHost = {
    camera,
    state: "ready",
    resources: new ResourceScope(),
    size: { width: 800, height: 400 },
  };
  const cameraView = captureCameraView(viewHost);
  camera.position.set(90, 90, 90);
  restoreCameraView(viewHost, JSON.parse(JSON.stringify(cameraView)));
  assert.deepEqual(camera.position.toArray(), [3, 2, 5]);
  assert.equal(camera.aspect, 2);
  viewHost.resources.dispose();
  mesh.geometry.dispose();
  mesh.material.dispose();
  await assert.rejects(import("@adui/three/src/three-app.ts"), {
    code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
  });
  const core = await readFile(fileURLToPath(import.meta.resolve("@adui/three")), "utf8");
  assert.ok(
    !/GLTFLoader|SkeletonUtils|cloneGLTF|OrbitControls|transitionToObject|computeObjectFrame|EffectComposer|attachBloom|OutlinePass|attachPostprocessing|HDRLoader|attachEnvironment|TransformControls|loadTexture|captureFrame|createInstancedMesh|followPath/.test(
      core,
    ),
  );
}
console.log(
  development
    ? `${Object.keys(expected).length} development exports resolve to packaged source (resolution only)`
    : `${Object.keys(expected).length} ESM exports, DOM-free imports, native math, resources and private-path boundaries passed`,
);
