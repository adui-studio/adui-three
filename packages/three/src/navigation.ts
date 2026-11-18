import { PerspectiveCamera, Quaternion, Ray, Vector3 } from "three";
import type { Object3D } from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ThreeApp } from "./core/three-app.ts";
import type { ResourceScope } from "./core/resources.ts";
import type { CollisionWorld } from "./collision.ts";
import { createCharacterBody } from "./navigation/character-body.ts";
import {
  beginCameraWrite,
  cancelCameraMotion,
  registerCameraMotion,
  removeCameraMotion,
} from "./camera/camera-runtime.ts";

export interface CharacterInput {
  forward?: number;
  right?: number;
  sprint?: boolean;
}
export interface CharacterControlsOptions {
  /** Borrowed static collision world. Gravity defaults to 20 with a world, otherwise 0. */
  world?: CollisionWorld;
  position?: Vector3;
  speed?: number;
  sprintMultiplier?: number;
  radius?: number;
  height?: number;
  eyeHeight?: number;
  gravity?: number;
  jumpSpeed?: number;
  terminalSpeed?: number;
  maxSubsteps?: number;
  maxSlopeAngle?: number;
  keyboard?: boolean;
  scope?: ResourceScope;
}
export interface ThirdPersonControlsOptions extends CharacterControlsOptions {
  distance?: number;
  cameraPadding?: number;
}
export interface CharacterControlsHandle {
  readonly disposed: boolean;
  /** Requested state; native enabled also reflects host visibility, size and lifecycle. */
  readonly enabled: boolean;
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly grounded: boolean;
  setEnabled(this: void, value: boolean): void;
  /** Programmatic/gamepad input does not require pointer lock. Copies numbers, applies next update. */
  setInput(this: void, input: CharacterInput): void;
  clearInput(this: void): void;
  jump(this: void): void;
  teleport(this: void, position: Vector3): void;
  dispose(this: void): void;
}
export interface FirstPersonControlsHandle extends CharacterControlsHandle {
  readonly controls: PointerLockControls;
  readonly locked: boolean;
  /** Call from a user gesture after starting the host. Never starts the host itself. */
  lock(this: void): Promise<void>;
  unlock(this: void): void;
}
export interface ThirdPersonControlsHandle extends CharacterControlsHandle {
  readonly controls: OrbitControls;
}

const owners = new WeakSet<PerspectiveCamera>();
const pendingLocks = new WeakMap<HTMLCanvasElement, object>();
const up = new Vector3(0, 1, 0);
function positive(value: number, name: string, zero = false): number {
  if (!Number.isFinite(value) || (zero ? value < 0 : value <= 0))
    throw new RangeError(`${name} must be ${zero ? "nonnegative" : "positive"} and finite`);
  return value;
}
export function attachFirstPersonControls(
  app: ThreeApp,
  options: CharacterControlsOptions = {},
): FirstPersonControlsHandle {
  return attach(app, null, options) as FirstPersonControlsHandle;
}
export function attachThirdPersonControls(
  app: ThreeApp,
  actor: Object3D,
  options: ThirdPersonControlsOptions = {},
): ThirdPersonControlsHandle {
  return attach(app, actor, options) as ThirdPersonControlsHandle;
}

function attach(
  app: ThreeApp,
  actor: Object3D | null,
  options: ThirdPersonControlsOptions,
): FirstPersonControlsHandle | ThirdPersonControlsHandle {
  const camera = app.camera;
  if (!(camera instanceof PerspectiveCamera))
    throw new TypeError("Character controls require a perspective host");
  if (owners.has(camera))
    throw new Error(
      "Character controls already own this camera; dispose them before switching modes",
    );
  const release = beginCameraWrite(camera);
  let rollback: (() => void) | undefined;
  try {
    const { world, scope, keyboard = true } = options;
    const radius = positive(options.radius ?? 0.3, "radius"),
      height = positive(options.height ?? 1.8, "height");
    const eyeHeight = positive(options.eyeHeight ?? 1.6, "eyeHeight"),
      speed = positive(options.speed ?? 4, "speed");
    const sprint = positive(options.sprintMultiplier ?? 2, "sprintMultiplier"),
      gravity = positive(options.gravity ?? (world ? 20 : 0), "gravity", true);
    const jumpSpeed = positive(options.jumpSpeed ?? 6, "jumpSpeed", true),
      terminalSpeed = positive(options.terminalSpeed ?? 20, "terminalSpeed");
    const maxSubsteps = options.maxSubsteps ?? 32,
      maxSlopeAngle = options.maxSlopeAngle ?? Math.PI / 4;
    const distance = positive(options.distance ?? 4, "distance"),
      padding = positive(options.cameraPadding ?? 0.15, "cameraPadding", true);
    if (
      height < radius * 2 ||
      eyeHeight > height ||
      !Number.isInteger(maxSubsteps) ||
      maxSubsteps < 1 ||
      maxSubsteps > 128 ||
      !Number.isFinite(maxSlopeAngle) ||
      maxSlopeAngle < 0 ||
      maxSlopeAngle >= Math.PI / 2 ||
      typeof keyboard !== "boolean"
    )
      throw new RangeError("Invalid character dimensions, slope, keyboard or substep budget");
    const canvas = app.renderer.domElement,
      document = canvas.ownerDocument,
      window = document.defaultView;
    if (!window) throw new Error("Navigation requires a browser window");
    let disposed = false,
      requested = true,
      writing = false,
      jumpRequested = false,
      locking = false;
    let manual: Required<CharacterInput> | null = null;
    const keys = new Set<string>();
    const alive = (): boolean =>
      !disposed &&
      app.state !== "disposed" &&
      !app.resources.disposed &&
      !scope?.disposed &&
      !app.signal.aborted;
    const active = (): void => {
      if (!alive()) throw new Error("Character controls have been disposed");
      if (
        app.camera !== camera ||
        camera.parent ||
        !camera.up.equals(up) ||
        !camera.scale.equals(new Vector3(1, 1, 1)) ||
        !camera.matrixAutoUpdate ||
        !camera.matrixWorldAutoUpdate
      )
        throw new Error("Character controls require an unparented automatic Y-up camera");
      if (
        app.scene.position.lengthSq() !== 0 ||
        !app.scene.quaternion.equals(new Quaternion()) ||
        !app.scene.scale.equals(new Vector3(1, 1, 1))
      )
        throw new Error("Character controls require an untransformed scene");
      if (actor && (actor.parent !== app.scene || !actor.matrixAutoUpdate))
        throw new Error("Character actor must remain directly attached to this scene");
      if (world?.disposed) throw new Error("Collision world has been disposed");
    };
    active();
    const initial =
      options.position?.clone() ??
      (actor ? actor.position.clone() : camera.position.clone().addScaledVector(up, -eyeHeight));
    if (!initial.toArray().every(Number.isFinite))
      throw new RangeError("Character position must be finite");
    const body = createCharacterBody({
      position: initial,
      world,
      radius,
      height,
      gravity,
      jumpSpeed,
      terminalSpeed,
      maxSubsteps,
      groundCosine: Math.cos(maxSlopeAngle),
    });
    if (!body.teleport(initial, alive))
      throw new Error("Navigation owner ended during preparation");
    cancelCameraMotion(camera);
    active();
    owners.add(camera);
    const cleanups: Array<() => void> = [];
    let handle!: FirstPersonControlsHandle | ThirdPersonControlsHandle;
    const lease = { cancel: (): void => handle.dispose() };
    const oldTouch = canvas.style.touchAction,
      oldTabIndex = canvas.getAttribute("tabindex");
    const controls = actor
      ? new OrbitControls(camera, canvas)
      : new PointerLockControls(camera, canvas);
    const target = body.position.clone().addScaledVector(up, eyeHeight),
      lastActor = actor?.position.clone();
    const nativeOrbit = controls instanceof OrbitControls ? controls : null;
    const nativeFirst = controls instanceof PointerLockControls ? controls : null;
    if (nativeOrbit) {
      nativeOrbit.enablePan = false;
      nativeOrbit.enableDamping = true;
      nativeOrbit.autoRotate = false;
      nativeOrbit.minDistance = 0.1;
      nativeOrbit.maxDistance = Math.max(10, distance);
      nativeOrbit.maxPolarAngle = Math.PI * 0.49;
      const offset = camera.getWorldDirection(new Vector3()).negate().multiplyScalar(distance);
      camera.position.copy(target).add(offset);
      nativeOrbit.target.copy(target);
      nativeOrbit.update(0);
    }
    const runnable = (): boolean =>
      alive() &&
      app.state === "running" &&
      !document.hidden &&
      app.size.width > 0 &&
      app.size.height > 0;
    const clearInput = (): void => {
      keys.clear();
      manual = null;
      jumpRequested = false;
    };
    const unlock = (): void => {
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
    const ownedInput = (): boolean =>
      runnable() &&
      requested &&
      (nativeFirst
        ? document.pointerLockElement === canvas
        : document.pointerLockElement === null && document.activeElement === canvas);
    const applyView = (delta: number): boolean => {
      active();
      const nextTarget = body.position.clone().addScaledVector(up, eyeHeight);
      if (nativeOrbit) {
        camera.position.add(nextTarget.clone().sub(target));
        nativeOrbit.target.copy(nextTarget);
        target.copy(nextTarget);
        if (actor) {
          actor.position.copy(body.position);
          lastActor!.copy(actor.position);
        }
        nativeOrbit.update(delta);
        if (!alive()) return false;
        if (world) {
          const offset = camera.position.clone().sub(nativeOrbit.target),
            length = offset.length();
          if (length > 0) {
            const hit = world.raycast(
              new Ray(nativeOrbit.target.clone(), offset.divideScalar(length)),
              length,
            );
            if (!alive()) return false;
            if (hit)
              camera.position
                .copy(nativeOrbit.target)
                .addScaledVector(offset, Math.max(0.01, hit.distance - padding));
          }
        }
      } else camera.position.copy(nextTarget);
      if (!alive()) return false;
      camera.updateWorldMatrix(true, false);
      return true;
    };
    const base: CharacterControlsHandle = {
      get disposed() {
        return disposed;
      },
      get enabled() {
        return requested;
      },
      get position() {
        return body.position.clone();
      },
      get velocity() {
        return body.velocity.clone();
      },
      get grounded() {
        return body.grounded;
      },
      setEnabled(value): void {
        active();
        if (typeof value !== "boolean") throw new TypeError("enabled must be boolean");
        requested = value;
        if (!value) {
          clearInput();
          unlock();
        }
      },
      setInput(input): void {
        active();
        const { forward = 0, right = 0, sprint = false } = input;
        if (
          ![forward, right].every(Number.isFinite) ||
          Math.abs(forward) > 1 ||
          Math.abs(right) > 1 ||
          typeof sprint !== "boolean"
        )
          throw new RangeError("Character input must be normalized finite axes and boolean sprint");
        manual = { forward, right, sprint };
      },
      clearInput,
      jump(): void {
        active();
        jumpRequested = true;
      },
      teleport(position): void {
        active();
        if (writing) throw new Error("A character update is already in progress");
        const end = beginCameraWrite(camera);
        writing = true;
        try {
          if (body.teleport(position, alive)) applyView(0);
        } finally {
          writing = false;
          end();
        }
      },
      dispose(): void {
        if (disposed) return;
        disposed = true;
        requested = false;
        clearInput();
        owners.delete(camera);
        removeCameraMotion(camera, lease);
        const errors: unknown[] = [];
        for (const cleanup of [
          () => app.resources.untrack(handle),
          () => scope?.untrack(handle),
          unlock,
          ...cleanups.splice(0).reverse(),
          () => {
            const touch = canvas.style.touchAction;
            try {
              controls.dispose();
            } finally {
              canvas.style.touchAction = touch === "none" ? oldTouch : touch;
            }
          },
          () => {
            if (oldTabIndex === null && canvas.getAttribute("tabindex") === "0")
              canvas.removeAttribute("tabindex");
          },
        ]) {
          try {
            cleanup();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length) throw new AggregateError(errors, "Character controls cleanup failed");
      },
    };
    handle = nativeFirst
      ? Object.assign(base, {
          controls: nativeFirst,
          get locked(): boolean {
            return !disposed && document.pointerLockElement === canvas;
          },
          async lock(): Promise<void> {
            active();
            if (!requested || !runnable())
              throw new Error("Start and enable the host before locking the pointer");
            if (locking || pendingLocks.has(canvas))
              throw new Error("Pointer lock request is already in progress");
            locking = true;
            pendingLocks.set(canvas, lease);
            try {
              await canvas.requestPointerLock();
              if (!alive() || !requested) {
                unlock();
                throw new Error("Character controls ended while pointer lock was pending");
              }
              if (document.pointerLockElement !== canvas)
                throw new Error("Pointer lock was not granted");
            } finally {
              locking = false;
              if (pendingLocks.get(canvas) === lease) pendingLocks.delete(canvas);
            }
          },
          unlock,
        })
      : Object.assign(base, { controls: nativeOrbit! });
    // Object.assign copies getters on source objects; install this diagnostic as a live getter.
    if (nativeFirst)
      Object.defineProperty(handle, "locked", {
        get: () => !disposed && document.pointerLockElement === canvas,
        configurable: true,
      });
    rollback = handle.dispose;
    Object.defineProperty(controls, "enabled", {
      configurable: true,
      get: () => requested && runnable(),
      set: (value: boolean) => {
        base.setEnabled(value);
      },
    });
    if (oldTabIndex === null) canvas.setAttribute("tabindex", "0");
    const listen = (owner: EventTarget, type: string, callback: EventListener): void => {
      owner.addEventListener(type, callback);
      cleanups.push(() => owner.removeEventListener(type, callback));
    };
    const codeSet = new Set([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ShiftLeft",
      "ShiftRight",
      "Space",
    ]);
    listen(document, "keydown", (event) => {
      const key = event as KeyboardEvent;
      if (key.code === "Escape") {
        unlock();
        clearInput();
        return;
      }
      if (!keyboard || !ownedInput()) {
        keys.clear();
        return;
      }
      if (!codeSet.has(key.code) || key.ctrlKey || key.metaKey || key.altKey) return;
      key.preventDefault();
      keys.add(key.code);
      if (key.code === "Space" && !key.repeat) jumpRequested = true;
    });
    listen(document, "keyup", (event) => {
      keys.delete((event as KeyboardEvent).code);
    });
    listen(window, "blur", () => {
      clearInput();
      unlock();
    });
    listen(document, "visibilitychange", () => {
      if (document.hidden) {
        clearInput();
        unlock();
      }
    });
    listen(document, "pointerlockchange", () => {
      if (nativeFirst && document.pointerLockElement !== canvas) clearInput();
    });
    listen(canvas, "pointerdown", () => {
      if (runnable() && requested) canvas.focus({ preventScroll: true });
    });
    app.resources.track(handle);
    if (scope && scope !== app.resources) scope.track(handle);
    registerCameraMotion(camera, lease);
    const unsubscribe = app.onUpdate(({ delta }) => {
      if (disposed) return;
      try {
        active();
        if (!requested) return;
        if (actor && !actor.position.equals(lastActor!))
          throw new Error("Character position was changed externally; use teleport");
        if (delta === 0 || !ownedInput()) keys.clear();
        const input = manual ?? {
          forward:
            Number(keys.has("KeyW") || keys.has("ArrowUp")) -
            Number(keys.has("KeyS") || keys.has("ArrowDown")),
          right:
            Number(keys.has("KeyD") || keys.has("ArrowRight")) -
            Number(keys.has("KeyA") || keys.has("ArrowLeft")),
          sprint: keys.has("ShiftLeft") || keys.has("ShiftRight"),
        };
        const forward = camera.getWorldDirection(new Vector3());
        forward.y = 0;
        if (forward.lengthSq() === 0) forward.set(0, 0, -1);
        forward.normalize();
        const right = forward.clone().cross(up),
          movement = forward.multiplyScalar(input.forward).addScaledVector(right, input.right);
        if (movement.lengthSq() > 1) movement.normalize();
        movement.multiplyScalar(speed * (input.sprint ? sprint : 1));
        const end = beginCameraWrite(camera);
        writing = true;
        try {
          const jump = jumpRequested;
          jumpRequested = false;
          if (body.step(delta, movement, jump, alive)) applyView(delta);
        } finally {
          writing = false;
          end();
        }
      } catch (error) {
        try {
          handle.dispose();
        } catch (cleanup) {
          throw new AggregateError([error, cleanup], "Navigation update and cleanup failed");
        }
        throw error;
      }
    });
    if (disposed) unsubscribe();
    else cleanups.push(unsubscribe);
    if (alive()) applyView(0);
    active();
    return handle;
  } catch (error) {
    owners.delete(camera);
    try {
      rollback?.();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Navigation preparation and cleanup failed");
    }
    throw error;
  } finally {
    release();
  }
}
