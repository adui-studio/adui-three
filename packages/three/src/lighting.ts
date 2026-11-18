import {
  BasicShadowMap,
  Box3,
  DirectionalLight,
  Matrix4,
  Mesh,
  PCFShadowMap,
  Sphere,
  Vector3,
  VSMShadowMap,
} from "three";
import type { Object3D } from "three";
import type { AnyThreeApp } from "./core/three-app.ts";
import { ResourceScope } from "./core/resources.ts";
import { retireAfterRender } from "./core/render-retirement.ts";
export interface ShadowLightOptions {
  /** World bounds to cover, including the receiving area. Copied; fit again after moving the scene. */
  bounds: Box3;
  casters?: readonly Object3D[];
  receivers?: readonly Object3D[];
  /** Direction from target toward the light. Default (5,10,5). */
  direction?: Vector3;
  type?: "basic" | "pcf" | "vsm";
  mapSize?: number;
  bias?: number;
  normalBias?: number;
  radius?: number;
  blurSamples?: number;
  shadowIntensity?: number;
  color?: number;
  intensity?: number;
  autoUpdate?: boolean;
  scope?: ResourceScope;
}
export interface ShadowLightHandle {
  readonly light: DirectionalLight;
  readonly disposed: boolean;
  readonly enabled: boolean;
  fit(this: void, bounds: Box3): void;
  setEnabled(this: void, value: boolean): void;
  requestUpdate(this: void): void;
  dispose(this: void): void;
}
const renderers = new WeakSet<object>(),
  objects = new WeakSet<Object3D>();
function nonnegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(name + " must be finite and nonnegative");
  return value;
}
function snapshot(bounds: Box3): Box3 {
  if (
    !(bounds instanceof Box3) ||
    bounds.isEmpty() ||
    !bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite)
  )
    throw new RangeError("Finite nonempty world bounds are required");
  const result = bounds.clone(),
    radius = result.getBoundingSphere(new Sphere()).radius;
  if (!Number.isFinite(radius) || radius <= 0)
    throw new RangeError("Shadow bounds must have a finite positive extent");
  return result;
}
function meshes(roots: readonly Object3D[]): Set<Mesh> {
  if (!Array.isArray(roots) || roots.length > 4096)
    throw new TypeError("Shadow roots must be an array of Object3D values");
  const result = new Set<Mesh>();
  for (const root of Array.from<Object3D>(roots)) {
    if (!root?.isObject3D) throw new TypeError("Shadow roots must be Object3D values");
    root.traverse((child) => {
      if (child instanceof Mesh) result.add(child);
    });
  }
  return result;
}
/** Owns one directional light, its target/maps and one renderer shadow-settings lease. */
export function attachShadowLight(
  app: AnyThreeApp,
  options: ShadowLightOptions,
): ShadowLightHandle {
  const renderer = app.renderer;
  if (app.state === "disposed" || app.resources.disposed || options.scope?.disposed)
    throw new Error("Shadow owner has been disposed");
  if (renderers.has(renderer)) throw new Error("A shadow light already owns this renderer");
  const {
    type = "pcf",
    mapSize = 2048,
    bias = -0.0001,
    normalBias = 0.02,
    radius = 2,
    blurSamples = 8,
    shadowIntensity = 1,
    color = 0xffffff,
    intensity = 3,
    autoUpdate = true,
    scope,
  } = options;
  if (
    !["basic", "pcf", "vsm"].includes(type) ||
    !Number.isInteger(mapSize) ||
    mapSize < 128 ||
    mapSize > 4096 ||
    (mapSize & (mapSize - 1)) !== 0 ||
    mapSize > renderer.capabilities.maxTextureSize ||
    !Number.isInteger(blurSamples) ||
    blurSamples < 1 ||
    blurSamples > 32 ||
    !Number.isFinite(bias) ||
    !Number.isFinite(shadowIntensity) ||
    shadowIntensity < 0 ||
    shadowIntensity > 1 ||
    !Number.isInteger(color) ||
    color < 0 ||
    color > 0xffffff ||
    typeof autoUpdate !== "boolean"
  )
    throw new RangeError("Invalid shadow map, bias, intensity or update options");
  nonnegative(normalBias, "normalBias");
  nonnegative(radius, "radius");
  nonnegative(intensity, "intensity");
  const direction = options.direction?.clone() ?? new Vector3(5, 10, 5);
  if (
    !direction.toArray().every(Number.isFinite) ||
    !Number.isFinite(direction.length()) ||
    direction.lengthSq() === 0
  )
    throw new RangeError("A finite nonzero light direction is required");
  direction.normalize();
  const bounds = snapshot(options.bounds),
    casters = meshes(options.casters ?? []),
    receivers = meshes(options.receivers ?? []),
    all = new Set([...casters, ...receivers]);
  for (const object of all)
    if (objects.has(object)) throw new Error("A mesh already has a managed shadow lease");
  const previous = {
    enabled: renderer.shadowMap.enabled,
    type: renderer.shadowMap.type,
    autoUpdate: renderer.shadowMap.autoUpdate,
  };
  const nativeType =
    type === "basic" ? BasicShadowMap : type === "pcf" ? PCFShadowMap : VSMShadowMap;
  const light = new DirectionalLight(color, intensity);
  light.castShadow = true;
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.bias = bias;
  light.shadow.normalBias = normalBias;
  light.shadow.radius = radius;
  light.shadow.blurSamples = blurSamples;
  light.shadow.intensity = shadowIntensity;
  light.shadow.autoUpdate = autoUpdate;
  const flags = Array.from(all, (object) => ({
    object,
    cast: object.castShadow,
    receive: object.receiveShadow,
  }));
  let disposed = false,
    installed = false;
  let handle!: ShadowLightHandle;
  const alive = () =>
    !disposed && app.state !== "disposed" && !app.resources.disposed && !scope?.disposed;
  const active = (): void => {
    if (!alive()) throw new Error("Shadow light has been disposed");
    const scene = app.scene;
    if (
      scene.parent ||
      !scene.matrixAutoUpdate ||
      !scene.matrixWorldAutoUpdate ||
      scene.position.lengthSq() !== 0 ||
      scene.scale.x !== 1 ||
      scene.scale.y !== 1 ||
      scene.scale.z !== 1 ||
      scene.quaternion.x !== 0 ||
      scene.quaternion.y !== 0 ||
      scene.quaternion.z !== 0 ||
      scene.quaternion.w !== 1
    )
      throw new Error("Shadow light requires an untransformed automatic scene");
  };
  const update = (): void => {
    renderer.shadowMap.needsUpdate = true;
    light.shadow.needsUpdate = true;
  };
  const fit = (value: Box3): void => {
    const center = value.getCenter(new Vector3()),
      size = value.getBoundingSphere(new Sphere()).radius,
      padding = size * 0.05;
    const position = center.clone().addScaledVector(direction, size * 3 + padding);
    const inverse = new Matrix4()
        .lookAt(position, center, new Vector3(0, 1, 0))
        .setPosition(position)
        .invert(),
      viewBounds = new Box3();
    for (let i = 0; i < 8; i++)
      viewBounds.expandByPoint(
        new Vector3(
          i & 1 ? value.max.x : value.min.x,
          i & 2 ? value.max.y : value.min.y,
          i & 4 ? value.max.z : value.min.z,
        ).applyMatrix4(inverse),
      );
    const camera = light.shadow.camera;
    const values = [
      viewBounds.min.x - padding,
      viewBounds.max.x + padding,
      viewBounds.min.y - padding,
      viewBounds.max.y + padding,
      -viewBounds.max.z - padding,
      -viewBounds.min.z + padding,
    ];
    if (!values.every(Number.isFinite) || values[4]! <= 0 || values[5]! <= values[4]!)
      throw new RangeError("Shadow frustum exceeds the numeric range");
    light.position.copy(position);
    light.target.position.copy(center);
    [camera.left, camera.right, camera.bottom, camera.top, camera.near, camera.far] = values as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    camera.updateProjectionMatrix();
    light.updateWorldMatrix(true, false);
    light.target.updateWorldMatrix(true, false);
    light.shadow.updateMatrices(light);
    light.shadow.needsUpdate = true;
    if (installed) update();
  };
  try {
    active();
    fit(bounds);
    active();
    handle = {
      light,
      get disposed() {
        return disposed;
      },
      get enabled() {
        return !disposed && light.castShadow;
      },
      fit(value) {
        active();
        const candidate = snapshot(value);
        fit(candidate);
        active();
      },
      setEnabled(value) {
        active();
        if (typeof value !== "boolean") throw new TypeError("enabled must be boolean");
        light.castShadow = value;
        update();
      },
      requestUpdate() {
        active();
        update();
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        const errors: unknown[] = [];
        const attempt = (fn: () => unknown): void => {
          try {
            fn();
          } catch (error) {
            errors.push(error);
          }
        };
        attempt(() => app.resources.untrack(handle));
        attempt(() => scope?.untrack(handle));
        attempt(() =>
          retireAfterRender(renderer, () => {
            const released: unknown[] = [];
            const clean = (fn: () => unknown): void => {
              try {
                fn();
              } catch (error) {
                released.push(error);
              }
            };
            // Shadow traversal walks live scene children; detach only after every native pass returns.
            clean(() => light.removeFromParent());
            clean(() => light.target.removeFromParent());
            if (installed) {
              renderers.delete(renderer);
              for (const flag of flags) {
                objects.delete(flag.object);
                if (casters.has(flag.object) && flag.object.castShadow === true)
                  flag.object.castShadow = flag.cast;
                if (receivers.has(flag.object) && flag.object.receiveShadow === true)
                  flag.object.receiveShadow = flag.receive;
              }
              if (renderer.shadowMap.enabled === true)
                renderer.shadowMap.enabled = previous.enabled;
              if (renderer.shadowMap.type === nativeType) renderer.shadowMap.type = previous.type;
              if (renderer.shadowMap.autoUpdate === true)
                renderer.shadowMap.autoUpdate = previous.autoUpdate;
              renderer.shadowMap.needsUpdate = true;
            }
            const owned = new ResourceScope();
            if (light.shadow.map) owned.track(light.shadow.map);
            if (light.shadow.mapPass) owned.track(light.shadow.mapPass);
            light.shadow.map = null;
            light.shadow.mapPass = null;
            clean(() => owned.dispose());
            clean(() => light.dispose());
            if (released.length)
              throw new AggregateError(released, "Shadow resource cleanup failed");
          }),
        );
        if (errors.length) throw new AggregateError(errors, "Shadow light cleanup failed");
      },
    };
    renderers.add(renderer);
    for (const object of all) objects.add(object);
    installed = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = nativeType;
    renderer.shadowMap.autoUpdate = true;
    update();
    for (const object of casters) object.castShadow = true;
    for (const object of receivers) object.receiveShadow = true;
    app.resources.track(handle);
    if (scope && scope !== app.resources) scope.track(handle);
    app.scene.add(light.target);
    active();
    app.scene.add(light);
    active();
    return handle;
  } catch (error) {
    try {
      if (handle) handle.dispose();
      else light.dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Shadow preparation and cleanup failed");
    }
    throw error;
  }
}
