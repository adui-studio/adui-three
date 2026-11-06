import { Quaternion, Vector3 } from "three";
import type { Curve, Object3D } from "three";
import type { ThreeApp } from "./three-app.ts";
import type { ResourceScope } from "./resources.ts";

export type PathMotionState = "running" | "paused" | "completed" | "cancelled" | "failed";
export type PathMotionResult =
  | { status: "completed" }
  | {
      status: "cancelled";
      reason: "cancelled" | "disposed" | "aborted" | "replaced" | "target-changed";
    }
  | { status: "failed"; error: unknown };

export interface FollowPathOptions {
  /** Borrowed, immutable while moving. Coordinates are local to the target's parent. */
  curve: Curve<Vector3>;
  /** Positive finite host seconds per traversal. */
  duration: number;
  loop?: "once" | "repeat" | "pingpong";
  /** Map local +Z to the tangent; no banking/Frenet frame. Default false. */
  orientToPath?: boolean;
  signal?: AbortSignal;
  /** Optional borrowed owner, e.g. model.resources. Automatically untracked on settlement. */
  scope?: ResourceScope;
}

export interface PathMotionHandle {
  readonly state: PathMotionState;
  /** Current arc-length fraction [0,1], decreasing on a return traversal. */
  readonly progress: number;
  readonly finished: Promise<PathMotionResult>;
  pause(this: void): void;
  resume(this: void): void;
  cancel(this: void): void;
  dispose(this: void): void;
}

const motions = new WeakMap<Object3D, { handle: PathMotionHandle; replace(): void }>();
const writing = new WeakSet<Object3D>();

/** Own a transform-writing subscription, borrow a target/curve. Never start or render the host. */
export function followPath(
  app: ThreeApp,
  object: Object3D,
  options: FollowPathOptions,
): PathMotionHandle {
  const { curve, duration, loop = "once", orientToPath = false, signal, scope } = options;
  const ownerAlive = (): boolean =>
    app.state !== "disposed" && !app.resources.disposed && !app.signal.aborted && !scope?.disposed;
  if (!ownerAlive()) throw new Error("Path owner has been disposed");
  if (
    scope !== undefined &&
    (scope === null || typeof scope.track !== "function" || typeof scope.untrack !== "function")
  )
    throw new TypeError("Path scope must be a ResourceScope");
  if (!object?.isObject3D || object === app.scene)
    throw new TypeError("A borrowed scene object is required");
  if (!Number.isFinite(duration) || duration <= 0 || !["once", "repeat", "pingpong"].includes(loop))
    throw new RangeError(
      "Path duration must be positive and finite; loop must be once/repeat/pingpong",
    );
  if (
    typeof orientToPath !== "boolean" ||
    typeof curve?.getPointAt !== "function" ||
    typeof curve.getLength !== "function" ||
    (orientToPath && typeof curve.getTangentAt !== "function")
  )
    throw new TypeError("A 3D curve and boolean orientToPath are required");
  if (writing.has(object)) throw new Error("A path update is already in progress for this object");
  if (signal?.aborted)
    return {
      state: "cancelled",
      progress: 0,
      finished: Promise.resolve({ status: "cancelled", reason: "aborted" }),
      pause(): void {},
      resume(): void {},
      cancel(): void {},
      dispose(): void {},
    };

  writing.add(object);
  try {
    const parent = object.parent;
    const attached = (): boolean => {
      if (object.parent !== parent || !object.matrixAutoUpdate || !object.matrixWorldAutoUpdate)
        return false;
      for (let node = object.parent; node; node = node.parent) if (node === app.scene) return true;
      return false;
    };
    const lastPosition = object.position.clone(),
      lastRotation = object.quaternion.clone();
    const unchanged = (): boolean =>
      object.position.equals(lastPosition) &&
      (!orientToPath || object.quaternion.equals(lastRotation));
    if (!attached() || !lastPosition.toArray().every(Number.isFinite))
      throw new RangeError(
        "Path target must be attached with automatic matrices and finite position",
      );
    const point = new Vector3(),
      tangent = new Vector3(),
      rotation = new Quaternion();
    const forward = new Vector3(0, 0, 1);
    let samplingAllowed = (): boolean => ownerAlive() && !signal?.aborted;
    const prepare = (progress: number, direction: number): boolean => {
      const sampled = curve.getPointAt(progress, point);
      if (!samplingAllowed()) return false;
      if (!sampled?.isVector3 || !sampled.toArray().every(Number.isFinite))
        throw new RangeError("Path sample must be a finite Vector3");
      point.copy(sampled);
      if (orientToPath) {
        const value = curve.getTangentAt(progress, tangent);
        if (!samplingAllowed()) return false;
        if (!value?.isVector3 || !value.toArray().every(Number.isFinite))
          throw new RangeError("Path tangent must be a finite nonzero Vector3");
        const magnitude = Math.max(Math.abs(value.x), Math.abs(value.y), Math.abs(value.z));
        if (magnitude === 0) throw new RangeError("Path tangent must be nonzero");
        tangent
          .set(value.x / magnitude, value.y / magnitude, value.z / magnitude)
          .normalize()
          .multiplyScalar(direction);
        rotation.setFromUnitVectors(forward, tangent);
      }
      return true;
    };
    const length = curve.getLength();
    if (!samplingAllowed()) throw new Error("Path owner ended during preparation");
    if (!Number.isFinite(length) || length <= 0)
      throw new RangeError("Path length must be positive and finite");
    if (!prepare(0, 1)) throw new Error("Path owner ended during preparation");
    if (!ownerAlive() || signal?.aborted) throw new Error("Path owner ended during preparation");
    if (!attached() || !unchanged()) throw new Error("Path target changed during preparation");

    let state: PathMotionState = "running",
      progress = 0,
      phase = 0;
    let outcome: PathMotionResult | undefined;
    samplingAllowed = (): boolean =>
      ownerAlive() && !signal?.aborted && !outcome && state === "running";
    let resolve!: (result: PathMotionResult) => void;
    const finished = new Promise<PathMotionResult>((complete) => {
      resolve = complete;
    });
    const cleanup: Array<() => void> = [];
    const finish = (result: PathMotionResult): PathMotionResult => {
      if (outcome) return outcome;
      outcome = result;
      state = result.status;
      if (motions.get(object)?.handle === handle) motions.delete(object);
      const errors: unknown[] = [];
      for (const release of cleanup.splice(0).reverse()) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        if (result.status === "failed") errors.unshift(result.error);
        outcome = {
          status: "failed",
          error: new AggregateError(errors, "Path motion cleanup failed"),
        };
        state = "failed";
      }
      resolve(outcome);
      return outcome;
    };
    const retained = (): boolean => {
      if (outcome) return false;
      if (!ownerAlive()) {
        finish({ status: "cancelled", reason: "disposed" });
        return false;
      }
      if (!attached() || !unchanged()) {
        finish({ status: "cancelled", reason: "target-changed" });
        return false;
      }
      return true;
    };
    const apply = (): boolean => {
      if (!retained() || state !== "running") return false;
      object.position.copy(point);
      if (!ownerAlive() || outcome) {
        if (!outcome) finish({ status: "cancelled", reason: "disposed" });
        return false;
      }
      if (
        !attached() ||
        !object.position.equals(point) ||
        (orientToPath && !object.quaternion.equals(lastRotation))
      ) {
        finish({ status: "cancelled", reason: "target-changed" });
        return false;
      }
      if (orientToPath) object.quaternion.copy(rotation);
      lastPosition.copy(object.position);
      lastRotation.copy(object.quaternion);
      return retained() && state === "running";
    };
    const abort = (): void => {
      finish({ status: "cancelled", reason: "aborted" });
    };
    const handle: PathMotionHandle = {
      get state() {
        return state;
      },
      get progress() {
        return progress;
      },
      finished,
      pause(): void {
        if (state === "running") state = "paused";
      },
      resume(): void {
        if (state === "paused") state = "running";
      },
      cancel(): void {
        finish({ status: "cancelled", reason: "cancelled" });
      },
      dispose(): void {
        finish({ status: "cancelled", reason: "disposed" });
      },
    };
    try {
      motions.get(object)?.replace();
      motions.set(object, {
        handle,
        replace(): void {
          finish({ status: "cancelled", reason: "replaced" });
        },
      });
      cleanup.push(() => app.resources.untrack(handle));
      app.resources.track(handle);
      if (scope && scope !== app.resources) {
        cleanup.push(() => scope.untrack(handle));
        scope.track(handle);
      }
      app.signal.addEventListener("abort", handle.dispose, { once: true });
      cleanup.push(() => app.signal.removeEventListener("abort", handle.dispose));
      if (signal) {
        signal.addEventListener("abort", abort, { once: true });
        cleanup.push(() => signal.removeEventListener("abort", abort));
        if (signal.aborted) abort();
      }
      if (apply()) {
        const unsubscribe = app.onUpdate(({ delta }) => {
          if (!retained() || state !== "running") return;
          if (writing.has(object))
            throw new Error("A path update is already in progress for this object");
          writing.add(object);
          try {
            const step = delta / duration;
            if (!Number.isFinite(delta) || delta < 0 || !Number.isFinite(step))
              throw new RangeError("Path delta exceeds the supported numeric range");
            const next = phase + step;
            if (!Number.isFinite(next))
              throw new RangeError("Path phase exceeds the supported numeric range");
            const local =
              loop === "once" ? Math.min(1, next) : next % (loop === "pingpong" ? 2 : 1);
            const position = loop === "pingpong" && local > 1 ? 2 - local : local;
            if (!prepare(position, loop === "pingpong" && local > 1 ? -1 : 1)) {
              retained();
              return;
            }
            if (!apply()) return;
            phase = local;
            progress = position;
            if (loop === "once" && progress === 1) finish({ status: "completed" });
          } catch (error) {
            const result = finish({ status: "failed", error });
            throw result.status === "failed" ? result.error : error;
          } finally {
            writing.delete(object);
          }
        });
        if (outcome) unsubscribe();
        else cleanup.push(unsubscribe);
      }
      return handle;
    } catch (error) {
      const result = finish({ status: "failed", error });
      throw result.status === "failed" ? result.error : error;
    }
  } finally {
    writing.delete(object);
  }
}
