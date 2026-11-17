import type { Camera, Vector3 } from "three";

export function mixCameraNumber(a: number, b: number, t: number): number {
  return (1 - t) * a + t * b;
}

export function mixCameraVector(a: Vector3, b: Vector3, t: number, target: Vector3): Vector3 {
  return target.set(
    mixCameraNumber(a.x, b.x, t),
    mixCameraNumber(a.y, b.y, t),
    mixCameraNumber(a.z, b.z, t),
  );
}

export function nearCameraVector(a: Vector3, b: Vector3): boolean {
  return (["x", "y", "z"] as const).every(
    (axis) =>
      Number.isFinite(a[axis]) &&
      Math.abs(a[axis] - b[axis]) <= 1e-9 * Math.max(1, Math.abs(b[axis])),
  );
}

interface CameraMotion {
  cancel(): void;
}

interface CameraClockController {
  readonly paused: boolean;
  readonly playbackRate: number;
  setPaused(this: void, paused: boolean): void;
  setPlaybackRate(this: void, rate: number): void;
  end(this: void): void;
  hold(this: void): () => void;
}

/** Commit clock requests after the current initialization/frame, never halfway through a native pose write. */
export function createCameraClockController(): CameraClockController {
  let paused = false,
    holds = 0,
    requested: boolean | undefined;
  let playbackRate = 1,
    requestedRate: number | undefined,
    ended = false;
  return {
    get paused() {
      return paused;
    },
    setPaused(value): void {
      if (ended) return;
      if (holds) requested = value;
      else paused = value;
    },
    get playbackRate() {
      return playbackRate;
    },
    setPlaybackRate(rate): void {
      if (ended) throw new Error("Camera transition has ended");
      if (!Number.isFinite(rate) || rate < 0)
        throw new RangeError("Playback rate must be nonnegative and finite");
      if (holds) requestedRate = rate;
      else playbackRate = rate;
    },
    end(): void {
      ended = true;
      requested = undefined;
      requestedRate = undefined;
    },
    hold(): () => void {
      holds++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--holds === 0 && !ended) {
          if (requested !== undefined) {
            paused = requested;
            requested = undefined;
          }
          if (requestedRate !== undefined) {
            playbackRate = requestedRate;
            requestedRate = undefined;
          }
        }
      };
    },
  };
}
const writing = new WeakSet<Camera>();
const motions = new WeakMap<Camera, CameraMotion>();

export function assertCameraWriteAvailable(camera: Camera): void {
  if (writing.has(camera)) throw new Error("Camera framing is already in progress");
}

export function beginCameraWrite(camera: Camera): () => void {
  assertCameraWriteAvailable(camera);
  writing.add(camera);
  return () => {
    writing.delete(camera);
  };
}

export function cancelCameraMotion(camera: Camera): void {
  motions.get(camera)?.cancel();
}

export function registerCameraMotion(camera: Camera, motion: CameraMotion): void {
  motions.set(camera, motion);
}

export function removeCameraMotion(camera: Camera, motion: CameraMotion): void {
  if (motions.get(camera) === motion) motions.delete(camera);
}
