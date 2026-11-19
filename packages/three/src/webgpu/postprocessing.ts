import type { Node } from "three/webgpu";
import { Color } from "three";
import type { Object3D } from "three";
import { RenderPipeline, RendererUtils } from "three/webgpu";
import { pass, uniform, vec3, vec4, cos, sin, dot, float } from "three/tsl";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { outline } from "three/addons/tsl/display/OutlineNode.js";
import type { SceneApp } from "../core/scene-host.ts";
import { isNodeRenderer } from "../core/webgpu-features.ts";
import { ResourceScope } from "../core/resources.ts";
import { retireAfterRender } from "../core/render-retirement.ts";
import { normalizePostprocessing } from "../postprocessing/options.ts";
import type { NodePostprocessingHandle } from "../postprocessing.ts";

/** Native pass graphs are owned individually: RenderPipeline.dispose only owns its quad material. */
export function attachNodePostprocessing(
  app: SceneApp,
  config: ReturnType<typeof normalizePostprocessing>,
): NodePostprocessingHandle {
  const renderer = app.renderer;
  if (!isNodeRenderer(renderer)) throw new TypeError("A node renderer is required");
  const owned = new ResourceScope();
  let disposed = false;
  let detach = () => {};
  let handle: NodePostprocessingHandle | undefined;
  try {
    const scenePass = owned.track(pass(app.scene, app.camera));
    const sceneColor = scenePass.getTextureNode("output");
    const nativeOutline = config.outlineConfig
      ? owned.track(outline(app.scene, app.camera, { selectedObjects: [] }))
      : undefined;
    const nativeBloom = config.requestedBloom ? owned.track(bloom(sceneColor)) : undefined;
    const edgeStrength = uniform(3),
      edgeThickness = uniform(1),
      edgeGlow = uniform(0);
    const visibleColor = uniform(new Color(0xffffff)),
      hiddenColor = uniform(new Color(0x190a05));
    if (nativeOutline) {
      nativeOutline.edgeThicknessNode = edgeThickness;
      nativeOutline.edgeGlowNode = edgeGlow;
    }
    const brightness = uniform(0),
      contrast = uniform(0),
      hue = uniform(0),
      saturation = uniform(0);
    const pipeline = owned.track(new RenderPipeline(renderer));
    let current = config;
    const apply = (next: ReturnType<typeof normalizePostprocessing>): void => {
      current = {
        ...current,
        ...(next.requestedBloom
          ? {
              requestedBloom: next.requestedBloom,
              strength: next.strength,
              radius: next.radius,
              threshold: next.threshold,
              enabled: next.enabled,
            }
          : {}),
        ...(next.outlineConfig ? { outlineConfig: next.outlineConfig } : {}),
        ...(next.grade ? { grade: next.grade } : {}),
      };
      let image: Node<"vec4"> = sceneColor;
      const o = current.outlineConfig;
      if (nativeOutline && o) {
        nativeOutline.selectedObjects = [...o.selectedObjects];
        edgeStrength.value = o.edgeStrength;
        edgeThickness.value = o.edgeThickness;
        edgeGlow.value = o.edgeGlow;
        if (o.visibleEdgeColor !== undefined) visibleColor.value.setHex(o.visibleEdgeColor);
        if (o.hiddenEdgeColor !== undefined) hiddenColor.value.setHex(o.hiddenEdgeColor);
        if (o.enabled)
          image = vec4(
            image.rgb.add(
              nativeOutline.visibleEdge
                .mul(visibleColor)
                .add(nativeOutline.hiddenEdge.mul(hiddenColor))
                .mul(edgeStrength),
            ),
            image.a,
          );
      }
      if (nativeBloom) {
        // Bloom follows outline, as in the WebGL chain.
        nativeBloom.inputNode = image;
        nativeBloom.strength.value = current.strength;
        nativeBloom.radius.value = current.radius;
        nativeBloom.threshold.value = current.threshold;
        if (current.enabled) image = image.add(nativeBloom);
      }
      const c = current.grade;
      if (c) {
        brightness.value = c.brightness;
        contrast.value = c.contrast;
        hue.value = c.hue;
        saturation.value = c.saturation;
        if (c.enabled) {
          let rgb = image.rgb.add(brightness);
          rgb = contrast
            .greaterThan(0)
            .select(
              rgb.sub(0.5).div(float(1).sub(contrast)).add(0.5),
              rgb.sub(0.5).mul(contrast.add(1)).add(0.5),
            );
          const angle = hue.mul(Math.PI),
            cs = cos(angle),
            sn = sin(angle);
          const weights = vec3(
            cs.mul(2),
            sn.mul(-Math.sqrt(3)).sub(cs),
            sn.mul(Math.sqrt(3)).sub(cs),
          )
            .add(1)
            .div(3);
          rgb = vec3(dot(rgb, weights.xyz), dot(rgb, weights.zxy), dot(rgb, weights.yzx));
          const average = rgb.r.add(rgb.g).add(rgb.b).div(3);
          const factor = saturation
            .greaterThan(0)
            .select(float(1).sub(float(1).div(float(1.001).sub(saturation))), saturation.negate());
          rgb = rgb.add(average.sub(rgb).mul(factor));
          image = vec4(rgb, image.a);
        }
      }
      pipeline.outputNode = image;
      pipeline.needsUpdate = true;
    };
    apply(config);
    handle = {
      bloom: nativeBloom,
      outline: nativeOutline,
      get disposed() {
        return disposed;
      },
      configure(value) {
        if (disposed || app.state === "disposed" || app.resources.disposed)
          throw new Error("Postprocessing has been disposed");
        const next = normalizePostprocessing(value);
        if (
          (next.requestedBloom && !nativeBloom) ||
          (next.outlineConfig && !nativeOutline) ||
          (next.grade && !config.grade)
        )
          throw new Error("Configure only effects requested at attachment");
        retireAfterRender(renderer, () => {
          if (!disposed) apply(next);
        });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        detach();
        app.resources.untrack(handle!);
        retireAfterRender(renderer, () => {
          if (nativeOutline) nativeOutline.selectedObjects = [];
          owned.dispose();
        });
      },
    };
    detach = app.setRenderPipeline({
      resize() {}, // Native pass nodes read current drawing-buffer dimensions at each draw.
      render() {
        if (disposed) return;
        const state = RendererUtils.saveRendererState(renderer);
        const sceneName = app.scene.name;
        const background = app.scene.background,
          override = app.scene.overrideMaterial;
        const visibility = new Map<Object3D, boolean>();
        if (current.outlineConfig?.enabled)
          app.scene.traverse((object) => visibility.set(object, object.visible));
        const errors: unknown[] = [];
        try {
          pipeline.render();
        } catch (error) {
          errors.push(error);
        } finally {
          app.scene.name = sceneName;
          app.scene.background = background;
          app.scene.overrideMaterial = override;
          for (const [object, value] of visibility) object.visible = value;
          if (app.state !== "disposed") {
            try {
              RendererUtils.restoreRendererState(renderer, state);
            } catch (error) {
              errors.push(error);
            }
          }
        }
        if (errors.length === 1) throw errors[0];
        if (errors.length)
          throw new AggregateError(errors, "Node postprocessing and restoration failed");
      },
    });
    app.resources.track(handle);
    return handle;
  } catch (error) {
    disposed = true;
    detach();
    try {
      owned.dispose();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Node postprocessing preparation failed");
    }
    throw error;
  }
}
