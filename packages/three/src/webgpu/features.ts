import { isNodeRenderer } from "../core/webgpu-features.ts";
import { Color, DoubleSide, AdditiveBlending } from "three";
import {
  MeshBasicNodeMaterial,
  PointsNodeMaterial,
  PMREMGenerator,
  RendererUtils,
} from "three/webgpu";
import {
  uniform,
  uv,
  float,
  vec2,
  fract,
  smoothstep,
  abs,
  pow,
  length,
  atan,
  cos,
  min,
  max,
  normalView,
  positionViewDirection,
  dot,
  attribute,
  varying,
  screenDPR,
} from "three/tsl";
import type { Node, CubeRenderTarget } from "three/webgpu";
import type { EffectKind, EffectUniforms, WebGPUFeatures } from "../core/webgpu-features.ts";
import { attachNodePostprocessing } from "./postprocessing.ts";

function effectMaterial(
  kind: EffectKind,
  values: EffectUniforms,
): MeshBasicNodeMaterial | PointsNodeMaterial {
  const number = (name: string) => {
    const source = values[name];
    if (!source || typeof source.value !== "number")
      throw new TypeError("Missing effect uniform: " + name);
    return uniform(source.value).onRenderUpdate(() => source.value as number);
  };
  const phase = number("uPhase"),
    p = uv();
  const oneMinusSmooth = (
    low: number | Node<"float">,
    high: number | Node<"float">,
    value: Node<"float">,
  ) => smoothstep(low, high, value).oneMinus();
  const trail = (progress: Node<"float">) =>
    pow(oneMinusSmooth(0, number("uTail"), fract(phase.sub(progress).add(1))), 2);
  let alpha: Node<"float">;
  switch (kind) {
    case "fly":
      alpha = trail(p.x.div(number("uSpan")));
      break;
    case "flow":
      alpha = trail(p.x.div(number("uSpan")).mul(number("uPulses")))
        .mul(0.96)
        .add(0.04)
        .mul(oneMinusSmooth(0.3, 0.5, abs(p.y.sub(0.5))));
      break;
    case "wall": {
      const band = pow(abs(fract(p.y.sub(phase)).mul(2).sub(1)).oneMinus(), 5);
      alpha = band.mul(0.85).add(0.15).mul(pow(p.y.oneMinus(), 1.5));
      break;
    }
    case "radar": {
      const point = p.sub(0.5).mul(2),
        radius = length(point);
      const angle = radius.lessThan(0.00001).select(
        float(0),
        atan(point.y, point.x)
          .div(Math.PI * 2)
          .add(0.5),
      );
      const sweep = oneMinusSmooth(0, number("uTail"), fract(phase.sub(angle).add(1)));
      const grid = oneMinusSmooth(0.015, 0.035, abs(fract(radius.mul(number("uRings"))).sub(0.5)));
      const rim = oneMinusSmooth(0.015, 0.035, abs(radius.sub(0.96)));
      alpha = grid
        .mul(0.08)
        .add(rim.mul(0.2))
        .add(sweep.mul(0.8))
        .mul(oneMinusSmooth(0.98, 1, radius));
      break;
    }
    case "ripple": {
      const radius = length(p.sub(0.5).mul(2)),
        width = number("uWidth");
      const wave = oneMinusSmooth(
        width.mul(0.25),
        width.mul(0.5),
        abs(fract(radius.mul(number("uRings")).sub(phase)).sub(0.5)),
      );
      alpha = wave.mul(max(radius.oneMinus(), 0)).mul(oneMinusSmooth(0.98, 1, radius));
      break;
    }
    case "pillar": {
      const streak = pow(
        cos(p.x.mul(Math.PI * 16))
          .mul(0.5)
          .add(0.5),
        6,
      )
        .mul(0.65)
        .add(0.35);
      const pulse = pow(
        cos(p.y.sub(phase).mul(Math.PI * 4))
          .mul(0.5)
          .add(0.5),
        4,
      )
        .mul(0.65)
        .add(0.35);
      alpha = streak.mul(pulse).mul(pow(p.y.oneMinus(), 1.5));
      break;
    }
    case "shield": {
      const rim = pow(
        abs(dot(normalView.normalize(), positionViewDirection)).clamp(0, 1).oneMinus(),
        number("uFresnel"),
      );
      const gridSize = number("uGrid"),
        cell = abs(fract(p.mul(vec2(gridSize, gridSize.mul(0.5)))).sub(0.5));
      const grid = oneMinusSmooth(0.015, 0.045, min(cell.x, cell.y));
      const pulse = cos(p.y.sub(phase).mul(Math.PI * 2))
        .mul(0.5)
        .add(0.5)
        .mul(0.35)
        .add(0.65);
      alpha = rim.mul(0.8).add(0.04).add(grid.mul(0.12)).mul(pulse);
      break;
    }
    case "points": {
      const disc = oneMinusSmooth(0.18, 0.5, length(p.sub(0.5)));
      alpha = disc.mul(varying(trail(attribute("aProgress", "float"))));
      break;
    }
  }
  const material =
    kind === "points"
      ? new PointsNodeMaterial({ sizeAttenuation: false })
      : new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.side = DoubleSide;
  material.blending = AdditiveBlending;
  const color = values.uColor!;
  if (!(color.value instanceof Color)) throw new TypeError("Effect color is required");
  material.colorNode = uniform(color.value).onRenderUpdate(() => color.value as Color);
  material.opacityNode = alpha.mul(number("uOpacity")).clamp(0, 1);
  if (material instanceof PointsNodeMaterial) {
    material.positionNode = attribute("aCenter", "vec3");
    material.sizeNode = number("uSize").div(screenDPR);
    material.alphaToCoverage = false;
  }
  return material;
}

export const webGPUFeatures: WebGPUFeatures = {
  effectMaterial,
  postprocessing: attachNodePostprocessing,
  room(app, scene, sigma, size) {
    const renderer = app.renderer;
    if (!isNodeRenderer(renderer)) throw new TypeError("A node renderer is required");
    const state = RendererUtils.saveRendererState(renderer);
    const generator = new PMREMGenerator(renderer);
    let target: CubeRenderTarget | undefined;
    const errors: unknown[] = [];
    try {
      target = generator.fromScene(scene, sigma, 0.1, 100, { size });
    } catch (error) {
      errors.push(error);
    } finally {
      if (app.state !== "disposed") {
        try {
          RendererUtils.restoreRendererState(renderer, state);
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        generator.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      try {
        target?.dispose();
      } catch (error) {
        errors.push(error);
      }
      throw new AggregateError(errors, "Node Room preparation or cleanup failed");
    }
    return target!;
  },
};
