import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  ShaderMaterial,
  Vector3,
} from "three";
import type { Curve } from "three";
import type { AnyThreeApp } from "./three-app.ts";
import { ResourceScope } from "./resources.ts";
import { createPathCurve, createPathTube } from "./path-geometry.ts";
import { retireAfterRender } from "./render-retirement.ts";
export interface EffectOptions {
  color?: number;
  intensity?: number;
  opacity?: number;
  /** Cycles per host second. Default .25; zero retains the running state. */
  speed?: number;
  addToScene?: boolean;
  scope?: ResourceScope;
}
export interface FlyLineOptions extends EffectOptions {
  curve: Curve<Vector3>;
  radius?: number;
  segments?: number;
  tail?: number;
}
export interface LightWallOptions extends EffectOptions {
  points: readonly Vector3[];
  height?: number;
  segments?: number;
  cornerTrim?: number;
  closed?: boolean;
}
export interface RadarOptions extends EffectOptions {
  radius?: number;
  segments?: number;
  tail?: number;
  rings?: number;
}
export interface EffectHandle {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
  readonly disposed: boolean;
  readonly state: "running" | "paused" | "disposed";
  readonly phase: number;
  readonly speed: number;
  pause(this: void): void;
  resume(this: void): void;
  seek(this: void, phase: number): void;
  setSpeed(this: void, speed: number): void;
  dispose(this: void): void;
}
function positive(value: number, name: string, zero = false): number {
  if (!Number.isFinite(value) || (zero ? value < 0 : value <= 0))
    throw new RangeError(name + " must be finite and " + (zero ? "nonnegative" : "positive"));
  return value;
}
function tail(value: number): number {
  if (!Number.isFinite(value) || Math.fround(value) <= 0 || value > 1)
    throw new RangeError("tail must be in (0,1]");
  return value;
}
function settings(app: AnyThreeApp, options: EffectOptions) {
  if (app.state === "disposed" || app.resources.disposed || options.scope?.disposed)
    throw new Error("Effect owner has been disposed");
  const {
    color = 0x55ddff,
    intensity = 2,
    opacity = 1,
    speed = 0.25,
    addToScene = true,
    scope,
  } = options;
  if (
    !Number.isInteger(color) ||
    color < 0 ||
    color > 0xffffff ||
    !Number.isFinite(opacity) ||
    opacity < 0 ||
    opacity > 1 ||
    typeof addToScene !== "boolean"
  )
    throw new RangeError("Invalid effect color, opacity or scene flag");
  positive(intensity, "intensity", true);
  if (!Number.isFinite(Math.fround(intensity)))
    throw new RangeError("Effect intensity exceeds Float32 range");
  positive(speed, "speed", true);
  return { color, intensity, opacity, speed, addToScene, scope };
}
const vertexShader = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const declarations = `uniform vec3 uColor;uniform float uOpacity;uniform float uPhase;varying vec2 vUv;`;
const output = `gl_FragColor=vec4(uColor,clamp(alpha*uOpacity,0.0,1.0));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
const flyFragment =
  declarations +
  `uniform float uSpan;uniform float uTail;
void main(){float behind=fract(uPhase-vUv.x/uSpan+1.0);float alpha=pow(1.0-smoothstep(0.0,uTail,behind),2.0);` +
  output;
const wallFragment =
  declarations +
  `void main(){float band=pow(1.0-abs(fract(vUv.y-uPhase)*2.0-1.0),5.0);float alpha=(0.15+0.85*band)*pow(1.0-vUv.y,1.5);` +
  output;
const radarFragment =
  declarations +
  `uniform float uTail;uniform float uRings;
void main(){vec2 p=(vUv-0.5)*2.0;float radius=length(p);float angle=radius<0.00001?0.0:atan(p.y,p.x)/6.28318530718+0.5;float sweep=1.0-smoothstep(0.0,uTail,fract(uPhase-angle+1.0));float grid=1.0-smoothstep(0.015,0.035,abs(fract(radius*uRings)-0.5));float rim=1.0-smoothstep(0.015,0.035,abs(radius-0.96));float alpha=(0.08*grid+0.2*rim+0.8*sweep)*(1.0-smoothstep(0.98,1.0,radius));` +
  output;
function mount(
  app: AnyThreeApp,
  geometry: BufferGeometry,
  config: ReturnType<typeof settings>,
  fragmentShader: string,
  extra: Record<string, { value: number }>,
): EffectHandle {
  const owned = new ResourceScope();
  owned.track(geometry);
  let handle!: EffectHandle,
    disposed = false,
    paused = false,
    phase = 0,
    speed = config.speed,
    unsubscribe = () => {};
  const alive = () =>
    !disposed && app.state !== "disposed" && !app.resources.disposed && !config.scope?.disposed;
  const active = (): void => {
    if (!alive()) throw new Error("Effect has been disposed");
  };
  try {
    const phaseUniform = { value: 0 };
    const material = owned.track(
      new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(config.color).multiplyScalar(config.intensity) },
          uOpacity: { value: config.opacity },
          uPhase: phaseUniform,
          ...extra,
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    );
    const mesh = owned.track(new Mesh(geometry, material));
    handle = {
      mesh,
      get disposed() {
        return disposed;
      },
      get state() {
        return disposed ? "disposed" : paused ? "paused" : "running";
      },
      get phase() {
        return phase;
      },
      get speed() {
        return speed;
      },
      pause() {
        active();
        paused = true;
      },
      resume() {
        active();
        paused = false;
      },
      seek(value) {
        active();
        if (!Number.isFinite(value) || value < 0 || value > 1)
          throw new RangeError("phase must be in [0,1]");
        phaseUniform.value = value === 1 ? 0 : value;
        if (alive()) phase = phaseUniform.value;
      },
      setSpeed(value) {
        active();
        speed = positive(value, "speed", true);
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        const errors: unknown[] = [];
        for (const cleanup of [
          unsubscribe,
          () => app.resources.untrack(handle),
          () => config.scope?.untrack(handle),

          () =>
            retireAfterRender(app.renderer, () => {
              const errors: unknown[] = [];
              try {
                mesh.removeFromParent();
              } catch (error) {
                errors.push(error);
              }
              try {
                owned.dispose();
              } catch (error) {
                errors.push(error);
              }
              if (errors.length) throw new AggregateError(errors, "Effect resource cleanup failed");
            }),
        ]) {
          try {
            cleanup();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length) throw new AggregateError(errors, "Effect cleanup failed");
      },
    };
    app.resources.track(handle);
    if (config.scope && config.scope !== app.resources) config.scope.track(handle);
    if (config.addToScene) app.scene.add(mesh);
    active();
    unsubscribe = app.onUpdate(({ delta }) => {
      if (!alive() || paused || speed === 0) return;
      try {
        const step = delta * speed;
        if (!Number.isFinite(step) || delta < 0)
          throw new RangeError("Effect step exceeds the numeric range");
        const next = (phase + (step % 1)) % 1;
        phaseUniform.value = next;
        if (alive()) phase = next;
      } catch (error) {
        try {
          handle.dispose();
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], "Effect update and cleanup failed");
        }
        throw error;
      }
    });
    if (disposed) unsubscribe();
    active();
    return handle;
  } catch (error) {
    try {
      if (handle) handle.dispose();
      else owned.dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Effect preparation and cleanup failed");
    }
    throw error;
  }
}
export function attachFlyLine(app: AnyThreeApp, options: FlyLineOptions): EffectHandle {
  const config = settings(app, options),
    length = positive(options.curve.getLength(), "curve length"),
    trail = tail(options.tail ?? 0.25);
  if (Math.fround(length) <= 0 || !Number.isFinite(Math.fround(length)))
    throw new RangeError("Fly line length exceeds Float32 range");
  const geometry = createPathTube(options.curve, {
    radius: options.radius ?? 0.035,
    segments: options.segments ?? 128,
    radialSegments: 6,
  });
  return mount(app, geometry, config, flyFragment, {
    uSpan: { value: length },
    uTail: { value: trail },
  });
}
export function attachLightWall(app: AnyThreeApp, options: LightWallOptions): EffectHandle {
  const config = settings(app, options),
    height = positive(options.height ?? 2, "height"),
    segments = options.segments ?? 128;
  if (!Number.isInteger(segments) || segments < 1 || segments > 4096)
    throw new RangeError("segments must be 1..4096");
  const curve = createPathCurve(options.points, {
      cornerTrim: options.cornerTrim ?? 0,
      closed: options.closed ?? false,
    }),
    points = curve.getSpacedPoints(segments);
  const positions: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const p = points[i]!;
    if (i > 0 && Math.hypot(p.x - points[i - 1]!.x, p.z - points[i - 1]!.z) === 0)
      throw new RangeError("A wall path cannot contain a vertical or collapsed segment");
    positions.push(p.x, p.y, p.z, p.x, p.y + height, p.z);
    uvs.push(i / segments, 0, i / segments, 1);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new BufferGeometry();
  try {
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    for (const value of geometry.getAttribute("position").array)
      if (!Number.isFinite(value)) throw new RangeError("Wall exceeds the Float32 range");
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  } catch (error) {
    geometry.dispose();
    throw error;
  }
  return mount(app, geometry, config, wallFragment, {});
}
export function attachRadar(app: AnyThreeApp, options: RadarOptions = {}): EffectHandle {
  const config = settings(app, options),
    radius = positive(options.radius ?? 2, "radius"),
    segments = options.segments ?? 64,
    rings = options.rings ?? 4,
    trail = tail(options.tail ?? 0.25);
  if (
    !Number.isInteger(segments) ||
    segments < 16 ||
    segments > 256 ||
    !Number.isInteger(rings) ||
    rings < 1 ||
    rings > 16 ||
    !Number.isFinite(Math.fround(radius))
  )
    throw new RangeError("Invalid radar radius, segments or rings");
  const geometry = new CircleGeometry(radius, segments);
  geometry.rotateX(-Math.PI / 2);
  return mount(app, geometry, config, radarFragment, {
    uTail: { value: trail },
    uRings: { value: rings },
  });
}
