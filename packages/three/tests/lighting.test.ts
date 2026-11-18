import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  Box3,
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  Scene,
  Vector3,
  VSMShadowMap,
  WebGLRenderTarget,
} from "three";
import { ResourceScope } from "../src/core/resources.ts";
import { attachShadowLight } from "../src/lighting.ts";
import { renderWithRetirement } from "../src/core/render-retirement.ts";
import type { AnyThreeApp } from "../src/index.ts";
const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0).reverse()) fn();
});
function fixture() {
  const resources = new ResourceScope(),
    scope = new ResourceScope(),
    scene = new Scene(),
    renderer = {
      capabilities: { maxTextureSize: 4096 },
      shadowMap: {
        enabled: false,
        type: PCFShadowMap as number,
        autoUpdate: false,
        needsUpdate: false,
      },
    };
  const mesh = new Mesh(
    resources.track(new BoxGeometry()),
    resources.track(new MeshBasicMaterial()),
  );
  scene.add(mesh);
  const bounds = new Box3(new Vector3(-2, -1, -3), new Vector3(3, 4, 2));
  const value = { resources, scope, scene, renderer, state: "ready" };
  cleanup.push(() => {
    scope.dispose();
    resources.dispose();
  });
  return { app: value as unknown as AnyThreeApp, ...value, mesh, bounds };
}
test("world bounds fit all eight corners in the native directional shadow camera", () => {
  const e = fixture(),
    h = attachShadowLight(e.app, {
      bounds: e.bounds,
      casters: [e.mesh],
      receivers: [e.mesh],
      type: "vsm",
    });
  expect(e.renderer.shadowMap.type).toBe(VSMShadowMap);
  expect(h.light.shadow.mapSize.x).toBe(2048);
  expect(e.mesh.castShadow && e.mesh.receiveShadow).toBe(true);
  for (let i = 0; i < 8; i++) {
    const p = new Vector3(i & 1 ? 3 : -2, i & 2 ? 4 : -1, i & 4 ? 2 : -3).project(
      h.light.shadow.camera,
    );
    expect(Math.abs(p.x)).toBeLessThan(1);
    expect(Math.abs(p.y)).toBeLessThan(1);
    expect(p.z).toBeGreaterThan(-1);
    expect(p.z).toBeLessThan(1);
  }
  const old = h.light.shadow.camera.left;
  expect(() => h.fit(new Box3())).toThrow();
  expect(h.light.shadow.camera.left).toBe(old);
  h.fit(new Box3(new Vector3(-20, -2, -10), new Vector3(20, 10, 10)));
  expect(h.light.shadow.camera.right - h.light.shadow.camera.left).toBeGreaterThan(20);
});
test("only owned targets retire after rendering, flags/settings restore and leases can be reacquired", () => {
  const e = fixture(),
    h = attachShadowLight(e.app, { bounds: e.bounds, casters: [e.mesh], receivers: [e.mesh] });
  const map = new WebGLRenderTarget(16, 16),
    pass = new WebGLRenderTarget(16, 16),
    a = vi.spyOn(map, "dispose"),
    b = vi.spyOn(pass, "dispose"),
    borrowed = vi.spyOn(e.mesh.geometry, "dispose");
  h.light.shadow.map = map;
  h.light.shadow.mapPass = pass;
  renderWithRetirement(e.renderer, () => {
    h.dispose();
    expect(a).not.toHaveBeenCalled();
    expect(h.light.parent).toBe(e.scene);
  });
  expect(a).toHaveBeenCalledOnce();
  expect(b).toHaveBeenCalledOnce();
  expect(h.light.shadow.map).toBeNull();
  expect(e.renderer.shadowMap.enabled).toBe(false);
  expect(e.renderer.shadowMap.autoUpdate).toBe(false);
  expect(e.mesh.castShadow || e.mesh.receiveShadow).toBe(false);
  expect(borrowed).not.toHaveBeenCalled();
  expect(() => attachShadowLight(e.app, { bounds: e.bounds })).not.toThrow();
});
test("shadow updates are explicit while stopped and scope cleanup keeps consumer edits", () => {
  const e = fixture(),
    h = attachShadowLight(e.app, {
      bounds: e.bounds,
      scope: e.scope,
      casters: [e.mesh],
      autoUpdate: false,
    });
  expect(h.light.shadow.autoUpdate).toBe(false);
  h.setEnabled(false);
  expect(h.enabled).toBe(false);
  h.setEnabled(true);
  e.renderer.shadowMap.needsUpdate = false;
  h.requestUpdate();
  expect(e.renderer.shadowMap.needsUpdate).toBe(true);
  e.renderer.shadowMap.type = VSMShadowMap;
  e.mesh.castShadow = false;
  e.scope.dispose();
  expect(h.disposed).toBe(true);
  expect(e.renderer.shadowMap.type).toBe(VSMShadowMap);
  expect(e.mesh.castShadow).toBe(false);
});
test("duplicate renderer and mesh leases reject without altering existing owners", () => {
  const a = fixture(),
    b = fixture(),
    h = attachShadowLight(a.app, { bounds: a.bounds, casters: [a.mesh] });
  expect(() => attachShadowLight(a.app, { bounds: a.bounds })).toThrow(/already/);
  expect(() => attachShadowLight(b.app, { bounds: b.bounds, casters: [a.mesh] })).toThrow(/lease/);
  expect(h.disposed).toBe(false);
  expect(b.renderer.shadowMap.enabled).toBe(false);
});
test("invalid bounds, map sizes, directions and transformed scenes reject before mounting", () => {
  const e = fixture();
  for (const mapSize of [0, 300, 8192])
    expect(() => attachShadowLight(e.app, { bounds: e.bounds, mapSize })).toThrow();
  expect(() => attachShadowLight(e.app, { bounds: e.bounds, direction: new Vector3() })).toThrow();
  e.scene.position.x = 1;
  expect(() => attachShadowLight(e.app, { bounds: e.bounds })).toThrow(/untransformed/);
  expect(e.renderer.shadowMap.enabled).toBe(false);
  expect(e.scene.children).toHaveLength(1);
});

test("Basic is the native unfiltered Editor shadow choice", () => {
  const e = fixture();
  const handle = attachShadowLight(e.app, { bounds: e.bounds, type: "basic" });
  expect(e.renderer.shadowMap.type).toBe(0);
  handle.dispose();
  expect(e.renderer.shadowMap.type).toBe(PCFShadowMap);
});
