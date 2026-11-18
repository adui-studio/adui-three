import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  SphereGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";
import type { Curve } from "three";
import type { AnyThreeApp } from "./core/three-app.ts";
import { ResourceScope } from "./core/resources.ts";
import { createPathCurve, createPathTube, createPathRibbon } from "./geometry/path-geometry.ts";
import { retireAfterRender } from "./core/render-retirement.ts";
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
export interface RippleOptions extends EffectOptions {
  radius?: number;
  segments?: number;
  rings?: number;
  /** Fractional width of each repeating radial wave. Default .15. */
  width?: number;
}
export interface LightPillarOptions extends EffectOptions {
  radius?: number;
  height?: number;
  segments?: number;
}
export interface ShieldOptions extends EffectOptions {
  radius?: number;
  /** Native sphere width segments; height segments are half (rounded up). Default 48. */
  segments?: number;
  /** View-angle rim exponent, .1..16. Default 2. */
  fresnelPower?: number;
  /** Longitude cells, 4..64. Default 12. Latitude cells use half this count. */
  gridSegments?: number;
}
export interface EffectPlayback {
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
export interface EffectHandle extends EffectPlayback {
  readonly mesh: Mesh<BufferGeometry, ShaderMaterial>;
}
export interface FlyPointsHandle extends EffectPlayback {
  readonly points: Points<BufferGeometry, ShaderMaterial>;
}
export interface FlyPointsOptions extends EffectOptions {
  curve: Curve<Vector3>;
  /** Total stationary path samples, 2..65536. Default 256. */
  count?: number;
  /** Physical drawing-buffer pixels, 1..64; native hardware may clamp further. Default 6. */
  size?: number;
  tail?: number;
}
export interface FlowLineOptions extends EffectOptions {
  curve: Curve<Vector3>;
  width?: number;
  segments?: number;
  /** Simultaneous repeating pulses, 1..32. Default 3. */
  pulses?: number;
  tail?: number;
}
function positive(value: number, name: string, zero = false): number {
  if (!Number.isFinite(value) || (zero ? value < 0 : value <= 0))
    throw new RangeError(name + " must be finite and " + (zero ? "nonnegative" : "positive"));
  return value;
}
function tail(value: number, name = "tail"): number {
  if (!Number.isFinite(value) || Math.fround(value) <= 0 || value > 1)
    throw new RangeError(name + " must be in (0,1]");
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
const rippleFragment =
  declarations +
  `uniform float uRings;uniform float uWidth;
void main(){float radius=length((vUv-.5)*2.0);float distanceToWave=abs(fract(radius*uRings-uPhase)-.5);float wave=1.0-smoothstep(uWidth*.25,uWidth*.5,distanceToWave);float alpha=wave*max(1.0-radius,0.0)*(1.0-smoothstep(.98,1.0,radius));` +
  output;
const pillarFragment =
  declarations +
  `void main(){float streak=.35+.65*pow(.5+.5*cos(vUv.x*50.2654824574),6.0);float pulse=.35+.65*pow(.5+.5*cos((vUv.y-uPhase)*12.5663706144),4.0);float alpha=streak*pulse*pow(1.0-vUv.y,1.5);` +
  output;
const shieldVertex = `varying vec2 vUv;varying vec3 vNormal;varying vec3 vViewPosition;
void main(){vUv=uv;vec4 viewPosition=modelViewMatrix*vec4(position,1.0);vNormal=normalMatrix*normal;vViewPosition=-viewPosition.xyz;gl_Position=projectionMatrix*viewPosition;}`;
const shieldFragment =
  declarations +
  `uniform float uFresnel;uniform float uGrid;varying vec3 vNormal;varying vec3 vViewPosition;
void main(){vec3 viewDirection=isOrthographic?vec3(0.0,0.0,1.0):normalize(vViewPosition);float rim=pow(1.0-clamp(abs(dot(normalize(vNormal),viewDirection)),0.0,1.0),uFresnel);vec2 cell=abs(fract(vUv*vec2(uGrid,uGrid*.5))-.5);float grid=1.0-smoothstep(.015,.045,min(cell.x,cell.y));float pulse=.65+.35*(.5+.5*cos((vUv.y-uPhase)*6.28318530718));float alpha=(.04+.8*rim+.12*grid)*pulse;` +
  output;
type EffectNode = Mesh<BufferGeometry, ShaderMaterial> | Points<BufferGeometry, ShaderMaterial>;
function mountDrawable<T extends EffectNode, K extends "mesh" | "points">(
  app: AnyThreeApp,
  geometry: BufferGeometry,
  config: ReturnType<typeof settings>,
  fragmentShader: string,
  extra: Record<string, { value: number }>,
  key: K,
  createNode: (geometry: BufferGeometry, material: ShaderMaterial) => T,
  vertex = vertexShader,
): EffectPlayback & Readonly<Record<K, T>> {
  const owned = new ResourceScope();
  owned.track(geometry);
  let handle!: EffectPlayback & Readonly<Record<K, T>>,
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
        vertexShader: vertex,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    );
    const mesh = owned.track(createNode(geometry, material));
    handle = Object.assign(
      {
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
        seek(value: number) {
          active();
          if (!Number.isFinite(value) || value < 0 || value > 1)
            throw new RangeError("phase must be in [0,1]");
          phaseUniform.value = value === 1 ? 0 : value;
          if (alive()) phase = phaseUniform.value;
        },
        setSpeed(value: number) {
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
                if (errors.length)
                  throw new AggregateError(errors, "Effect resource cleanup failed");
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
      },
      { [key]: mesh },
    ) as EffectPlayback & Readonly<Record<K, T>>;
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
function mount(
  app: AnyThreeApp,
  geometry: BufferGeometry,
  config: ReturnType<typeof settings>,
  fragment: string,
  extra: Record<string, { value: number }>,
  vertex = vertexShader,
): EffectHandle {
  return mountDrawable(
    app,
    geometry,
    config,
    fragment,
    extra,
    "mesh",
    (g, m) => new Mesh(g, m),
    vertex,
  );
}
const pointsVertex = `attribute float aProgress;uniform float uPhase;uniform float uTail;uniform float uSize;varying float vTrail;
void main(){float behind=fract(uPhase-aProgress+1.0);vTrail=pow(1.0-smoothstep(0.0,uTail,behind),2.0);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_PointSize=uSize;}`;
const pointsFragment =
  `uniform vec3 uColor;uniform float uOpacity;varying float vTrail;
void main(){float disc=1.0-smoothstep(.18,.5,length(gl_PointCoord-.5));float alpha=disc*vTrail;` +
  output;
const flowFragment =
  declarations +
  `uniform float uSpan;uniform float uPulses;uniform float uTail;
void main(){float behind=fract(uPhase-vUv.x/uSpan*uPulses+1.0);float trail=pow(1.0-smoothstep(0.0,uTail,behind),2.0);float edge=1.0-smoothstep(.3,.5,abs(vUv.y-.5));float alpha=(.04+.96*trail)*edge;` +
  output;
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

function dimension(value: number, name: string): number {
  positive(value, name);
  if (Math.fround(value) <= 0 || !Number.isFinite(Math.fround(value)))
    throw new RangeError(name + " exceeds the positive Float32 range");
  return value;
}
function subdivisions(value: number): number {
  if (!Number.isInteger(value) || value < 16 || value > 256)
    throw new RangeError("segments must be an integer in 16..256");
  return value;
}
/** Repeating expanding rings on the local XZ plane; move slightly above a receiving surface. */
export function attachRipple(app: AnyThreeApp, options: RippleOptions = {}): EffectHandle {
  const config = settings(app, options),
    radius = dimension(options.radius ?? 2, "radius"),
    segments = subdivisions(options.segments ?? 64),
    rings = options.rings ?? 3,
    width = tail(options.width ?? 0.15, "width");
  if (!Number.isInteger(rings) || rings < 1 || rings > 16)
    throw new RangeError("rings must be an integer in 1..16");
  const geometry = new CircleGeometry(radius, segments);
  geometry.rotateX(-Math.PI / 2);
  return mount(app, geometry, config, rippleFragment, {
    uRings: { value: rings },
    uWidth: { value: width },
  });
}
/** Open cylinder rising along local Y, with its base at y=0. */
export function attachLightPillar(
  app: AnyThreeApp,
  options: LightPillarOptions = {},
): EffectHandle {
  const config = settings(app, options),
    radius = dimension(options.radius ?? 0.45, "radius"),
    height = dimension(options.height ?? 4, "height"),
    segments = subdivisions(options.segments ?? 64);
  const geometry = new CylinderGeometry(radius, radius, height, segments, 1, true);
  geometry.translate(0, height / 2, 0);
  return mount(app, geometry, config, pillarFragment, {});
}
/** Local sphere with a view-angle rim, latitude/longitude grid and traveling pulse. */
export function attachShield(app: AnyThreeApp, options: ShieldOptions = {}): EffectHandle {
  const config = settings(app, options),
    radius = dimension(options.radius ?? 2, "radius"),
    segments = subdivisions(options.segments ?? 48),
    fresnel = options.fresnelPower ?? 2,
    grid = options.gridSegments ?? 12;
  if (
    !Number.isFinite(fresnel) ||
    fresnel < 0.1 ||
    fresnel > 16 ||
    !Number.isInteger(grid) ||
    grid < 4 ||
    grid > 64
  )
    throw new RangeError("Invalid shield Fresnel power (.1..16) or grid segments (4..64)");
  const geometry = new SphereGeometry(radius, segments, Math.ceil(segments / 2));
  return mount(
    app,
    geometry,
    config,
    shieldFragment,
    {
      uFresnel: { value: fresnel },
      uGrid: { value: grid },
    },
    shieldVertex,
  );
}

/** GPU particle tail along a sampled native curve; positions stay fixed after construction. */
export function attachFlyPoints(app: AnyThreeApp, options: FlyPointsOptions): FlyPointsHandle {
  const config = settings(app, options),
    curve = options.curve,
    count = options.count ?? 256,
    size = options.size ?? 6,
    trail = tail(options.tail ?? 0.25);
  if (
    !Number.isInteger(count) ||
    count < 2 ||
    count > 65536 ||
    !Number.isFinite(size) ||
    size < 1 ||
    size > 64
  )
    throw new RangeError("Invalid fly point count (2..65536) or pixel size (1..64)");
  dimension(curve.getLength(), "curve length");
  const positions = new Float32Array(count * 3),
    progress = new Float32Array(count),
    point = new Vector3();
  for (let i = 0; i < count; i++) {
    const ratio = i / (count - 1),
      sampled = curve.getPointAt(ratio, point);
    if (!sampled?.isVector3 || !sampled.toArray().every(Number.isFinite))
      throw new RangeError("Fly point samples must be finite Vector3 values");
    sampled.toArray(positions, i * 3);
    progress[i] = ratio;
  }
  if (!positions.every(Number.isFinite))
    throw new RangeError("Fly points exceed the Float32 range");
  const geometry = new BufferGeometry();
  try {
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aProgress", new Float32BufferAttribute(progress, 1));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  } catch (error) {
    geometry.dispose();
    throw error;
  }
  return mountDrawable(
    app,
    geometry,
    config,
    pointsFragment,
    {
      uTail: { value: trail },
      uSize: { value: size },
    },
    "points",
    (g, m) => new Points(g, m),
    pointsVertex,
  );
}
/** Repeating traveling light pulses on a continuous path ribbon. */
export function attachFlowLine(app: AnyThreeApp, options: FlowLineOptions): EffectHandle {
  const config = settings(app, options),
    curve = options.curve,
    length = dimension(curve.getLength(), "curve length"),
    width = dimension(options.width ?? 0.12, "width"),
    pulses = options.pulses ?? 3,
    trail = tail(options.tail ?? 0.3);
  if (!Number.isInteger(pulses) || pulses < 1 || pulses > 32)
    throw new RangeError("pulses must be an integer in 1..32");
  const geometry = createPathRibbon(curve, { width, segments: options.segments ?? 128 });
  return mount(app, geometry, config, flowFragment, {
    uSpan: { value: length },
    uPulses: { value: pulses },
    uTail: { value: trail },
  });
}
