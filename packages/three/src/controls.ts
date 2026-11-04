import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { ThreeApp } from "./three-app.ts";

export interface OrbitControlsHandle {
  readonly controls: OrbitControls;
  dispose(): void;
}

/** Optional addon; no second render loop. Configure the returned native controls directly. */
export function attachOrbitControls(app: ThreeApp): OrbitControlsHandle {
  if (app.state === "disposed") throw new Error("ThreeApp has been disposed");
  if (app.resources.disposed) throw new Error("ThreeApp resource scope has been disposed");
  const controls = new OrbitControls(app.camera, app.renderer.domElement);
  const unsubscribe = app.onUpdate(({ delta }) => controls.update(delta));
  let disposed = false;
  const handle: OrbitControlsHandle = {
    controls,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      app.resources.untrack(handle);
      controls.dispose();
    },
  };
  app.resources.track(handle);
  return handle;
}
