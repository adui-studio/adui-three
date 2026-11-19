import type { Object3D } from "three";
import type {
  OutlineOptions,
  ColorAdjustmentOptions,
  PostprocessingOptions,
} from "../postprocessing.ts";
type OutlineConfiguration = Required<
  Omit<OutlineOptions, "selectedObjects" | "visibleEdgeColor" | "hiddenEdgeColor">
> & {
  selectedObjects: Object3D[];
  visibleEdgeColor: number | undefined;
  hiddenEdgeColor: number | undefined;
};

function outlineOptions(options: OutlineOptions): OutlineConfiguration {
  const {
    selectedObjects = [],
    edgeStrength = 3,
    edgeThickness = 1,
    edgeGlow = 0,
    enabled = true,
    visibleEdgeColor,
    hiddenEdgeColor,
  } = options;
  if (!Array.isArray(selectedObjects) || selectedObjects.some((object) => !object?.isObject3D))
    throw new TypeError("Outline selection requires Object3D objects");
  if (
    ![edgeStrength, edgeThickness, edgeGlow].every(Number.isFinite) ||
    edgeStrength < 0 ||
    edgeThickness < 1 ||
    edgeThickness > 4 ||
    edgeGlow < 0 ||
    typeof enabled !== "boolean"
  )
    throw new RangeError("Invalid outline options");
  for (const color of [visibleEdgeColor, hiddenEdgeColor])
    if (color !== undefined && (!Number.isInteger(color) || color < 0 || color > 0xffffff))
      throw new RangeError("Outline colors must be RGB hex integers");
  return {
    selectedObjects: [...selectedObjects],
    edgeStrength,
    edgeThickness,
    edgeGlow,
    enabled,
    visibleEdgeColor,
    hiddenEdgeColor,
  };
}

export function normalizePostprocessing(options: PostprocessingOptions) {
  if (!options || typeof options !== "object")
    throw new TypeError("Postprocessing options are required");
  const {
    bloom: requestedBloom,
    outline: requestedOutline,
    colorAdjustment: requestedColor,
  } = options;
  if (!options || (!requestedBloom && !requestedOutline && !requestedColor))
    throw new RangeError("At least one effect is required");
  for (const value of [requestedBloom, requestedOutline, requestedColor])
    if (value !== undefined && (typeof value !== "object" || value === null))
      throw new TypeError("Effect options must be objects");
  const { strength = 1, radius = 0.4, threshold = 0.85, enabled = true } = requestedBloom ?? {};
  if (
    !Number.isFinite(strength) ||
    strength < 0 ||
    !Number.isFinite(threshold) ||
    threshold < 0 ||
    !Number.isFinite(radius) ||
    radius < 0 ||
    radius > 1 ||
    typeof enabled !== "boolean"
  )
    throw new RangeError("Invalid bloom options");
  const outlineConfig = requestedOutline ? outlineOptions(requestedOutline) : undefined;
  let grade: Required<ColorAdjustmentOptions> | undefined;
  if (requestedColor) {
    const {
      brightness = 0,
      contrast = 0,
      hue = 0,
      saturation = 0,
      enabled = true,
    } = requestedColor;
    if (
      ![brightness, contrast, hue, saturation].every(Number.isFinite) ||
      brightness < -1 ||
      brightness > 1 ||
      hue < -1 ||
      hue > 1 ||
      contrast < -1 ||
      Math.fround(contrast) >= 1 ||
      saturation < -1 ||
      Math.fround(saturation) >= 1 ||
      typeof enabled !== "boolean"
    )
      throw new RangeError("Invalid color adjustment options");
    grade = { brightness, contrast, hue, saturation, enabled };
  }
  return { requestedBloom, outlineConfig, grade, strength, radius, threshold, enabled };
}
