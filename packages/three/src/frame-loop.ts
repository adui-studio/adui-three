export interface FrameInfo {
  /** Seconds; the first frame after each start has delta 0. */
  readonly delta: number;
  /** Accumulated, clamped active seconds across starts. */
  readonly elapsed: number;
}

export interface FrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
}

/** Internal WebGL-only scheduler. Epochs invalidate callbacks from older runs. */
export class FrameLoop {
  #scheduler: FrameScheduler;
  #update: (frame: FrameInfo) => void;
  #maxDelta: number;
  #running = false;
  #epoch = 0;
  #pending: number | null = null;
  #lastTime: number | null = null;
  #elapsed = 0;

  constructor(scheduler: FrameScheduler, update: (frame: FrameInfo) => void, maxDelta: number) {
    this.#scheduler = scheduler;
    this.#update = update;
    this.#maxDelta = maxDelta;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#lastTime = null;
    const epoch = ++this.#epoch;
    this.#schedule(epoch);
  }

  stop(): void {
    this.#running = false;
    this.#epoch++;
    this.#lastTime = null;
    if (this.#pending !== null) {
      this.#scheduler.cancel(this.#pending);
      this.#pending = null;
    }
  }

  #schedule(epoch: number): void {
    this.#pending = this.#scheduler.request((time) => this.#tick(time, epoch));
  }

  #tick(time: number, epoch: number): void {
    if (!this.#running || epoch !== this.#epoch) return;
    this.#pending = null;
    const delta =
      this.#lastTime === null
        ? 0
        : Math.min(Math.max((time - this.#lastTime) / 1000, 0), this.#maxDelta);
    this.#lastTime = time;
    this.#elapsed += delta;
    try {
      this.#update({ delta, elapsed: this.#elapsed });
    } catch (error) {
      this.stop();
      throw error;
    }
    if (this.#running && epoch === this.#epoch) this.#schedule(epoch);
  }
}
