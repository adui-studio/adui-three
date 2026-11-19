import type { SceneApp } from "@adui/three";
import { ThreeApp } from "@adui/three";
import type { ThreeAppCreateOptions, ThreeAppInstance } from "@adui/three";
import { attachOrbitControls } from "@adui/three/controls";
import { attachRendererSettings, createEditorRenderPreset } from "@adui/three/rendering";
import {
  BoxGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
export type ExampleRenderer = "webgl" | "webgpu" | "webgpu-strict";
export interface ExampleContext {
  renderer: ExampleRenderer;
  container: HTMLElement;
  signal: AbortSignal;
  tools: HTMLElement;
  status(message: string): void;
}
export async function createScene(
  context: ExampleContext,
  options: { orbit?: boolean; lights?: boolean } = {},
): Promise<ThreeAppInstance> {
  const preset = createEditorRenderPreset();
  const creation: ThreeAppCreateOptions =
    context.renderer === "webgl"
      ? { renderer: { type: "webgl", ...preset.renderer }, signal: context.signal }
      : {
          renderer: {
            type: "webgpu",
            allowFallback: context.renderer !== "webgpu-strict",
            ...preset.renderer,
          },
          signal: context.signal,
        };
  const app = await ThreeApp.create(context.container, creation);
  attachRendererSettings(app, preset.color);
  app.scene.background = new Color(0x0d1920);
  app.camera.position.set(6, 4, 7);
  app.camera.lookAt(0, 1, 0);
  if (options.orbit !== false) {
    const orbit = attachOrbitControls(app);
    orbit.controls.target.set(0, 1, 0);
    orbit.controls.update();
  }
  if (options.lights !== false) {
    const sun = new DirectionalLight(0xffffff, 3);
    sun.position.set(5, 8, 4);
    app.scene.add(sun, new HemisphereLight(0xc7dfff, 0x364438, 1.4));
  }
  return app;
}
export function addBox(
  app: SceneApp,
  position = new Vector3(0, 0.75, 0),
  color = 0x65b8a0,
): Mesh<BoxGeometry, MeshStandardMaterial> {
  const mesh = new Mesh(
    app.resources.track(new BoxGeometry(1.5, 1.5, 1.5)),
    app.resources.track(new MeshStandardMaterial({ color, roughness: 0.5 })),
  );
  mesh.position.copy(position);
  app.scene.add(mesh);
  return mesh;
}
export function addGround(app: SceneApp): Mesh<PlaneGeometry, MeshStandardMaterial> {
  const floor = new Mesh(
    app.resources.track(new PlaneGeometry(16, 16)),
    app.resources.track(new MeshStandardMaterial({ color: 0x263c45, roughness: 0.9 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.02;
  const grid = new GridHelper(16, 16, 0x49626b, 0x304951);
  app.resources.track(grid.geometry);
  for (const material of Array.isArray(grid.material) ? grid.material : [grid.material])
    app.resources.track(material);
  app.scene.add(floor, grid);
  return floor;
}
export function button(
  app: SceneApp,
  tools: HTMLElement,
  title: string,
  action: () => void,
): HTMLButtonElement {
  const element = document.createElement("button");
  element.textContent = title;
  element.addEventListener("click", action, { signal: app.signal });
  tools.append(element);
  return element;
}
export function select(
  app: SceneApp,
  tools: HTMLElement,
  title: string,
  values: ReadonlyArray<readonly [string, string]>,
  action: (value: string) => void,
): void {
  const label = document.createElement("label"),
    element = document.createElement("select");
  label.textContent = title;
  element.setAttribute("aria-label", title);
  for (const [value, text] of values) element.add(new Option(text, value));
  element.addEventListener("change", () => action(element.value), { signal: app.signal });
  label.append(element);
  tools.append(label);
}
