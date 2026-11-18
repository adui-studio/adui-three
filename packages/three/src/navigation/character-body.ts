import { Line3, Vector3 } from "three";
import type { CollisionWorld } from "../collision.ts";

export interface CharacterBodyOptions {
  position: Vector3;
  world?: CollisionWorld;
  radius: number;
  height: number;
  gravity: number;
  jumpSpeed: number;
  terminalSpeed: number;
  maxSubsteps: number;
  groundCosine: number;
}
export interface CharacterBody {
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly grounded: boolean;
  step(delta: number, movement: Vector3, jump: boolean, alive: () => boolean): boolean;
  teleport(position: Vector3, alive: () => boolean): boolean;
}

/** Internal bounded kinematic motor. BVH queries provide the surface correction; no independent clock. */
export function createCharacterBody(options: CharacterBodyOptions): CharacterBody {
  const { world, radius, height, gravity, jumpSpeed, terminalSpeed, maxSubsteps, groundCosine } =
    options;
  const position = options.position.clone(),
    velocity = new Vector3();
  let grounded = false;
  const segment = new Line3(),
    candidate = new Vector3(),
    nextVelocity = new Vector3();
  const collide = (point: Vector3, speed: Vector3, alive: () => boolean): boolean | null => {
    if (!world) return false;
    if (world.disposed) throw new Error("Collision world has been disposed");
    segment.start.copy(point).y += radius;
    segment.end.copy(point).y += height - radius;
    const hit = world.resolveCapsule(segment, radius);
    if (!alive()) return null;
    if (!hit.converged) throw new Error("Character collision did not converge");
    point.copy(hit.segment.start).y -= radius;
    let supported = false;
    for (const contact of hit.contacts) {
      if (contact.normal.y >= groundCosine && speed.y <= 0) supported = true;
      const into = speed.dot(contact.normal);
      if (into < 0) speed.addScaledVector(contact.normal, -into);
    }
    // The depenetration skin intentionally leaves a gap. Probe only downwards so
    // tiny frame deltas retain support without climbing steps or snapping an ascent.
    if (!supported && speed.y <= 0) {
      const distance = radius * 0.02;
      const tolerance = radius * 1e-6;
      segment.start.copy(point).y += radius - distance;
      segment.end.copy(point).y += height - radius - distance;
      const ground = world.resolveCapsule(segment, radius);
      if (!alive()) return null;
      const foot = ground.segment.start.clone();
      foot.y -= radius;
      const drop = point.y - foot.y;
      if (
        ground.converged &&
        drop >= -tolerance &&
        drop <= distance + tolerance &&
        Math.hypot(foot.x - point.x, foot.z - point.z) <= distance &&
        ground.contacts.some((contact) => contact.normal.y >= groundCosine)
      ) {
        point.copy(foot);
        for (const contact of ground.contacts) {
          const into = speed.dot(contact.normal);
          if (into < 0) speed.addScaledVector(contact.normal, -into);
        }
        supported = true;
      }
    }
    return supported;
  };
  return {
    position,
    velocity,
    get grounded() {
      return grounded;
    },
    step(delta, movement, jump, alive): boolean {
      if (!Number.isFinite(delta) || delta < 0 || !movement.toArray().every(Number.isFinite))
        throw new RangeError("Invalid character delta or movement");
      if (delta === 0) return alive();
      const verticalBound = Math.max(
        Math.abs(velocity.y),
        Math.min(terminalSpeed, Math.abs(velocity.y) + gravity * delta),
        jump && grounded ? jumpSpeed : 0,
      );
      const travel = Math.hypot(movement.x, verticalBound, movement.z) * delta;
      const steps = Math.max(1, Math.ceil(delta * 60), Math.ceil(travel / (radius * 0.5)));
      if (!Number.isFinite(steps) || steps > maxSubsteps)
        throw new RangeError("Character movement exceeds the substep budget");
      candidate.copy(position);
      nextVelocity.copy(velocity);
      if (jump && grounded) nextVelocity.y = jumpSpeed;
      let nextGrounded = grounded;
      const step = delta / steps;
      for (let i = 0; i < steps; i++) {
        nextVelocity.x = movement.x;
        nextVelocity.z = movement.z;
        nextVelocity.y = Math.max(-terminalSpeed, nextVelocity.y - gravity * step);
        candidate.addScaledVector(nextVelocity, step);
        if (!candidate.toArray().every(Number.isFinite))
          throw new RangeError("Character position exceeds the numeric range");
        const support = collide(candidate, nextVelocity, alive);
        if (support === null || !alive()) return false;
        nextGrounded = support;
      }
      position.copy(candidate);
      velocity.copy(nextVelocity);
      grounded = nextGrounded;
      return true;
    },
    teleport(value, alive): boolean {
      if (!value?.isVector3 || !value.toArray().every(Number.isFinite))
        throw new RangeError("A finite character position is required");
      candidate.copy(value);
      nextVelocity.set(0, 0, 0);
      const supported = collide(candidate, nextVelocity, alive);
      if (supported === null || !alive()) return false;
      position.copy(candidate);
      velocity.set(0, 0, 0);
      grounded = supported;
      return true;
    },
  };
}
