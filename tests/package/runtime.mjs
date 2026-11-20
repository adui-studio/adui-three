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
  "@adui/three/effects": [
    "attachFlyLine",
    "attachLightWall",
    "attachRadar",
    "attachRipple",
    "attachLightPillar",
    "attachShield",
    "attachFlyPoints",
    "attachFlowLine",
  ],
  "@adui/three/lighting": ["attachShadowLight"],
  "@adui/three/rendering": ["attachRendererSettings", "createEditorRenderPreset"],
  "@adui/three": ["ResourceScope", "ThreeApp", "OrthographicThreeApp"],
  "@adui/three/controls": ["attachOrbitControls", "attachTransformControls"],
  "@adui/three/collision": ["createCollisionWorld"],
  "@adui/three/navigation": ["attachFirstPersonControls", "attachThirdPersonControls"],
  "@adui/three/loaders": ["loadGLTF", "cloneGLTF", "loadAssets"],
  "@adui/three/interaction": ["attachPicking"],
  "@adui/three/labels": ["attachDOMLabels"],
  "@adui/three/animation": ["attachGLTFAnimations", "followPath", "attachGSAPTimeline"],
  "@adui/three/camera": [
    "computeObjectFrame",
    "fitObject",
    "transitionToObject",
    "computeOrthographicFrame",
    "fitOrthographicObject",
    "transitionOrthographicToObject",
    "captureCameraView",
    "restoreCameraView",
    "transitionToCameraView",
  ],
  "@adui/three/postprocessing": ["attachBloom", "attachPostprocessing"],
  "@adui/three/environment": ["loadHDR", "loadEXR", "attachEnvironment", "createRoomEnvironment"],
  "@adui/three/textures": ["loadTexture", "loadKTX2"],
  "@adui/three/capture": ["captureFrame"],
  "@adui/three/geometry": [
    "createInstancedMesh",
    "computeObjectBounds",
    "createPathCurve",
    "createPathRibbon",
    "createPathTube",
  ],
};
assert.throws(() => import.meta.resolve("@adui/three/webgpu"), {
  code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
});
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
  const { Scene } = await import("three");
  const { attachRadar } = await import("@adui/three/effects");
  const effectResources = new ResourceScope(),
    effectScene = new Scene();
  const radar = attachRadar({
    state: "ready",
    resources: effectResources,
    scene: effectScene,
    renderer: {},
    onUpdate() {
      return () => {};
    },
  });
  radar.seek(0.3);
  assert.equal(radar.phase, 0.3);
  assert.equal(effectScene.children.length, 1);
  effectResources.dispose();
  assert.equal(effectScene.children.length, 0);
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
  const {
    BoxGeometry,
    BufferGeometry,
    Float32BufferAttribute,
    Mesh,
    MeshBasicMaterial,
    PerspectiveCamera,
  } = await import("three");
  const { computeObjectFrame } = await import("@adui/three/camera");
  const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const { computeObjectBounds } = await import("@adui/three/geometry");
  const { createPathCurve, createPathRibbon, createPathTube } =
    await import("@adui/three/geometry");
  const { Vector3 } = await import("three");
  const path = createPathCurve([new Vector3(), new Vector3(4, 0, 0)]);
  const ribbon = createPathRibbon(path, { width: 2, progress: 0.5 });
  const tube = createPathTube(path, { radius: 0.1, progress: 0.25 });
  assert.equal(ribbon.boundingBox.max.x, 2);
  assert.equal(tube.boundingBox.max.x, 1);
  assert.equal(ribbon.type, "BufferGeometry");
  ribbon.dispose();
  tube.dispose();
  const { createCollisionWorld } = await import("@adui/three/collision");
  const world = createCollisionWorld([mesh]);
  assert.equal(world.triangleCount, 12);
  world.dispose();
  const bounds = computeObjectBounds(mesh);
  assert.deepEqual(bounds.min.toArray(), [-0.5, -0.5, -0.5]);
  assert.deepEqual(bounds.max.toArray(), [0.5, 0.5, 0.5]);
  bounds.min.setScalar(-100);
  assert.deepEqual(computeObjectBounds(mesh).min.toArray(), [-0.5, -0.5, -0.5]);
  const camera = new PerspectiveCamera();
  camera.position.set(3, 2, 5);
  camera.lookAt(0, 0, 0);
  assert.ok(computeObjectFrame(camera, mesh).distance > 0);
  // The archive must share the same native-scratch guard between independently imported entries.
  const pointGeometry = new BufferGeometry();
  pointGeometry.setAttribute("position", new Float32BufferAttribute([1, 2, 3], 3));
  const pointMesh = new Mesh(pointGeometry, mesh.material);
  const getVertex = pointMesh.getVertexPosition.bind(pointMesh);
  pointMesh.getVertexPosition = (index, target) => {
    getVertex(index, target);
    assert.throws(() => computeObjectFrame(camera, mesh), /already in progress/);
    return target;
  };
  try {
    assert.deepEqual(computeObjectBounds(pointMesh).min.toArray(), [1, 2, 3]);
    assert.ok(computeObjectFrame(camera, mesh).distance > 0);
  } finally {
    pointMesh.dispose();
    pointGeometry.dispose();
  }
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
  await assert.rejects(import("@adui/three/src/core/three-app.ts"), {
    code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
  });
  const core = await readFile(fileURLToPath(import.meta.resolve("@adui/three")), "utf8");
  assert.ok(
    !/GLTFLoader|SkeletonUtils|cloneGLTF|OrbitControls|transitionToObject|transitionToCameraView|computeObjectFrame|computeObjectBounds|EffectComposer|attachBloom|OutlinePass|attachPostprocessing|HDRLoader|attachEnvironment|TransformControls|loadTexture|captureFrame|createInstancedMesh|followPath|MeshBVH|createCollisionWorld|attachFirstPersonControls|attachThirdPersonControls|createPathCurve|createPathRibbon|createPathTube|attachFlyLine|attachLightWall|attachRadar|attachRipple|attachLightPillar|attachShield|attachFlyPoints|attachFlowLine|attachShadowLight|ShaderPass|attachRendererSettings|createRoomEnvironment|RoomEnvironment/.test(
      core,
    ),
  );
}
console.log(
  development
    ? `${Object.keys(expected).length} development exports resolve to packaged source (resolution only)`
    : `${Object.keys(expected).length} ESM exports, DOM-free imports, native math, resources and private-path boundaries passed`,
);
