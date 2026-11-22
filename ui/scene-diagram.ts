/** Original SVG scene study; decorative geometry, no canvas or animation loop. */
export function sceneDiagram(id: string): string {
  const point = (u: number, v: number): string => {
    const radius = 113 + 47 * Math.cos(v);
    const x = radius * Math.cos(u);
    const y = radius * Math.sin(u);
    const z = 47 * Math.sin(v);
    return `${(300 + x * 1.16 + y * 0.24).toFixed(1)},${(224 + y * 0.57 - z * 1.12 - x * 0.25).toFixed(1)}`;
  };
  const rings = (count: number, meridian: boolean): string =>
    Array.from({ length: count }, (_, i) => {
      const path = Array.from({ length: 65 }, (_, j) => {
        const a = (i / count) * Math.PI * 2;
        const b = (j / 64) * Math.PI * 2;
        return `${j ? "L" : "M"}${meridian ? point(a, b) : point(b, a)}`;
      }).join("");
      return `<path d="${path}"/>`;
    }).join("");
  return `<svg viewBox="0 0 600 460" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="${id}-mesh" x1="170" y1="80" x2="420" y2="360" gradientUnits="userSpaceOnUse"><stop stop-color="#e5cdff"/><stop offset=".5" stop-color="#ac82e4"/><stop offset="1" stop-color="#655084"/></linearGradient><radialGradient id="${id}-glow"><stop stop-color="#9f6bd1" stop-opacity=".18"/><stop offset="1" stop-color="#9f6bd1" stop-opacity="0"/></radialGradient></defs><ellipse cx="300" cy="235" rx="240" ry="190" fill="url(#${id}-glow)"/><g stroke="#d5c5e7" stroke-opacity=".12"><path d="M50 345 300 200 550 345 300 490Z M100 316 350 461 M150 287 400 432 M200 258 450 403 M250 229 500 374 M100 374 350 229 M150 403 400 258 M200 432 450 287 M250 461 500 316"/><path d="M300 44V412M70 224H530" stroke-dasharray="3 8"/></g><ellipse cx="300" cy="350" rx="115" ry="15" fill="#08070c" opacity=".3"/><g stroke="url(#${id}-mesh)" stroke-width=".8" stroke-opacity=".82">${rings(24, true)}${rings(12, false)}</g><ellipse cx="300" cy="224" rx="244" ry="128" transform="rotate(-28 300 224)" stroke="#d4baf2" stroke-opacity=".25" stroke-dasharray="3 7"/><circle cx="489" cy="112" r="6" fill="#6cff00"/><circle cx="489" cy="112" r="13" stroke="#6cff00" stroke-opacity=".25"/></svg>`;
}
