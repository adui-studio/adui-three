/** Original, static SVG studies. No renderer, network, or animation required. */
export function spatialGraphic(kind: string, id: string): string {
  const gradient = `spatial-${id}`;
  const grid =
    '<path d="M0 230 300 55 600 230 300 405Z M0 190 300 365 600 190 M0 150 300 325 600 150 M60 265 360 90 M120 300 420 125 M180 335 480 160 M240 370 540 195" fill="none" stroke="#b8abc8" stroke-opacity=".2"/>';
  let shape: string;
  if (kind === "instances") {
    shape = Array.from({ length: 16 }, (_, i) => {
      const x = 170 + (i % 4) * 55 + Math.floor(i / 4) * 22;
      const y = 130 + Math.floor(i / 4) * 35 - (i % 4) * 14;
      return `<g transform="translate(${x} ${y})"><path d="M0 0 24-14 48 0 24 14Z" fill="#d9ccff"/><path d="M0 0v40l24 14V14Z" fill="#8572cf"/><path d="m24 14 24-14v40L24 54Z" fill="#504578"/></g>`;
    }).join("");
  } else if (kind === "labels") {
    shape = `<circle cx="300" cy="210" r="65" fill="url(#${gradient})"/><g stroke="#ae95d7" stroke-width="2"><path d="m275 180-60-50H150M325 200l70-60h60M300 250v60h80"/></g><g fill="#e4d9f6" stroke="#ac97c9"><rect x="100" y="90" width="115" height="64" rx="7"/><rect x="395" y="112" width="110" height="60" rx="7"/><rect x="350" y="287" width="110" height="56" rx="7"/></g><g stroke="#9478bb" stroke-width="5" stroke-linecap="round"><path d="M118 111h42m-42 18h72M414 132h38m-38 17h68M369 308h57m-57 16h30"/></g>`;
  } else if (kind === "navigation") {
    shape = `<path d="M110 290c150-100 60-170 200-150s70 170 180 60" stroke="url(#${gradient})" stroke-width="5" stroke-linecap="round" stroke-dasharray="4 12"/><g fill="#b8a0e2" stroke="#eee6fc" stroke-width="3"><circle cx="110" cy="290" r="10"/><circle cx="310" cy="140" r="10"/><circle cx="490" cy="200" r="10"/></g><path d="m300 210 42 75-42-14-42 14Z" fill="url(#${gradient})" stroke="#e6ddff" stroke-width="2"/>`;
  } else if (kind === "camera") {
    shape = `<g stroke="#a58bc8" stroke-width="2" fill="none"><path d="m170 210 230-100v200ZM170 210l230-30M170 210l230 70M400 110l60 35v200l-60-35"/><ellipse cx="400" cy="210" rx="55" ry="100"/></g><circle cx="365" cy="210" r="40" fill="url(#${gradient})"/><path d="m140 180 50 0 15 30-15 30h-50Z" fill="#c6b2e7" stroke="#e8ddfb" stroke-width="2"/>`;
  } else if (kind === "webgpu") {
    shape = `<g stroke="#e6ddff" stroke-opacity=".6"><path d="m210 120 70 40v80l-70 40-70-40v-80Z" fill="url(#${gradient})"/><path d="m210 200-70-40m70 40 70-40m-70 40v80"/><path d="m390 120 70 40v80l-70 40-70-40v-80Z" fill="url(#${gradient})"/><path d="m390 200-70-40m70 40 70-40m-70 40v80"/></g><path d="M270 310h65m-12-12 12 12-12 12" stroke="#ae93d4" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  } else if (kind === "effects") {
    shape = `<g fill="none" stroke="url(#${gradient})" stroke-width="3">${[0, 1, 2, 3, 4, 5].map((i) => `<ellipse cx="300" cy="210" rx="${85 + i * 16}" ry="${38 + i * 8}" transform="rotate(${i * 16 - 40} 300 210)"/>`).join("")}</g><circle cx="300" cy="210" r="32" fill="url(#${gradient})"/><circle cx="433" cy="175" r="7" fill="#6cff00"/>`;
  } else if (kind === "model" || kind === "shadows") {
    shape = `<ellipse cx="300" cy="305" rx="140" ry="25" fill="#000" opacity=".2"/><path d="m300 75 100 58 0 116-100 58-100-58V133Z" fill="url(#${gradient})"/><path d="m300 75 0 116 100 58M200 133l100 58v116" fill="none" stroke="#e6ddff" stroke-opacity=".6"/><path d="m200 133 100 58 100-58" fill="none" stroke="#e6ddff" stroke-opacity=".6"/>`;
  } else {
    shape = `<ellipse cx="300" cy="310" rx="140" ry="24" fill="#000" opacity=".25"/><g stroke="#e6ddff" stroke-opacity=".65" stroke-width="1.2"><path d="m300 65 112 64 0 130-112 65-112-65V129Z" fill="url(#${gradient})"/><path d="m300 65 0 130 112 64M188 129l112 66v129M188 259l112-64 112-66" fill="none"/><path d="m244 97 112 65v130M356 97 244 162v130M188 194l112 65 112-65" fill="none"/></g><circle cx="300" cy="65" r="5" fill="#6cff00"/>`;
  }
  return `<svg viewBox="0 0 600 400" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="${gradient}" x1="180" y1="80" x2="410" y2="320" gradientUnits="userSpaceOnUse"><stop stop-color="#e9ddff"/><stop offset=".46" stop-color="#ac91eb"/><stop offset="1" stop-color="#45365f"/></linearGradient></defs>${grid}${shape}</svg>`;
}
