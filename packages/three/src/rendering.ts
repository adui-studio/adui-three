import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  CineonToneMapping,
  LinearToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  ReinhardToneMapping,
} from "three";
import type { SceneApp } from "./core/three-app.ts";
import type { ResourceScope } from "./core/resources.ts";
import { isRendererDrawing, retireAfterRender } from "./core/render-retirement.ts";
export { captureRenderStats, attachRenderMonitor } from "./rendering/render-stats.ts";
export type {
  RenderStats,
  RenderMonitorSample,
  RenderMonitorOptions,
  RenderMonitorHandle,
} from "./rendering/render-stats.ts";
export type ToneMappingMode =
  | "none"
  | "linear"
  | "reinhard"
  | "cineon"
  | "aces-filmic"
  | "agx"
  | "neutral";
export interface RendererColorSettings {
  toneMapping: ToneMappingMode;
  exposure: number;
}
export interface RendererSettingsOptions extends Partial<RendererColorSettings> {
  scope?: ResourceScope;
}
export interface RendererSettingsHandle {
  readonly disposed: boolean;
  /** Last applied values; a fresh numeric/string snapshot. Writes during drawing apply afterward. */
  readonly settings: Readonly<RendererColorSettings>;
  configure(this: void, options: Partial<RendererColorSettings>): void;
  dispose(this: void): void;
}
export interface EditorRenderPreset {
  renderer: { antialias: boolean; reversedDepthBuffer: boolean };
  color: RendererColorSettings;
  shadows: { enabled: boolean; type: "basic" | "pcf" | "vsm" };
}
/** Clean Editor defaults verified against the served Config.js and r187; no user localStorage. */
export function createEditorRenderPreset(): EditorRenderPreset {
  return {
    renderer: { antialias: true, reversedDepthBuffer: true },
    color: { toneMapping: "neutral", exposure: 1 },
    shadows: { enabled: true, type: "pcf" },
  };
}
const modes = {
  none: NoToneMapping,
  linear: LinearToneMapping,
  reinhard: ReinhardToneMapping,
  cineon: CineonToneMapping,
  "aces-filmic": ACESFilmicToneMapping,
  agx: AgXToneMapping,
  neutral: NeutralToneMapping,
};
const owners = new WeakSet<object>();
function snapshot(
  options: Partial<RendererColorSettings>,
  current: RendererColorSettings,
): RendererColorSettings {
  const { toneMapping = current.toneMapping, exposure = current.exposure } = options;
  if (
    typeof toneMapping !== "string" ||
    !Object.hasOwn(modes, toneMapping) ||
    !Number.isFinite(exposure) ||
    exposure < 0 ||
    exposure > 10
  )
    throw new RangeError("Invalid Editor tone mapping or exposure (0..10)");
  return { toneMapping, exposure };
}
export function attachRendererSettings(
  app: SceneApp,
  options: RendererSettingsOptions = {},
): RendererSettingsHandle {
  const renderer = app.renderer;
  if (isRendererDrawing(renderer)) throw new Error("Attach renderer settings outside a draw");
  const { scope } = options;
  let disposed = false,
    current = snapshot(options, { toneMapping: "neutral", exposure: 1 }),
    desired = current;
  const active = (): void => {
    if (disposed || app.state === "disposed" || app.resources.disposed || scope?.disposed)
      throw new Error("Renderer settings owner has been disposed");
  };
  active();
  if (owners.has(renderer)) throw new Error("Renderer color settings already have an owner");
  const previous = { toneMapping: renderer.toneMapping, exposure: renderer.toneMappingExposure };
  const apply = (value: RendererColorSettings): void => {
    renderer.toneMapping = modes[value.toneMapping];
    renderer.toneMappingExposure = value.exposure;
    current = value;
  };
  let handle!: RendererSettingsHandle;
  handle = {
    get disposed() {
      return disposed;
    },
    get settings() {
      return { ...current };
    },
    configure(value) {
      active();
      const next = snapshot(value, desired);
      desired = next;
      retireAfterRender(renderer, () => {
        if (!disposed) {
          active();
          apply(next);
        }
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      app.resources.untrack(handle);
      scope?.untrack(handle);
      retireAfterRender(renderer, () => {
        owners.delete(renderer);
        if (renderer.toneMapping === modes[current.toneMapping])
          renderer.toneMapping = previous.toneMapping;
        if (renderer.toneMappingExposure === current.exposure)
          renderer.toneMappingExposure = previous.exposure;
      });
    },
  };
  owners.add(renderer);
  try {
    apply(current);
    app.resources.track(handle);
    if (scope && scope !== app.resources) scope.track(handle);
    active();
    return handle;
  } catch (error) {
    try {
      handle.dispose();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Renderer settings preparation and cleanup failed",
      );
    }
    throw error;
  }
}
