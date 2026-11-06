import { mkdir, writeFile } from "node:fs/promises";
import { generateEXRFixture } from "./generate-exr-fixture.mjs";

// Original, deterministic 2:1 Radiance RGBE studio gradient; no downloaded image or encoder.
const width = 64;
const height = 32;
const header = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`);
const pixels = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const light = Math.exp(-((x - 18) ** 2 / 60 + (y - 10) ** 2 / 20));
    const offset = (y * width + x) * 4;
    pixels[offset] = Math.round(30 + 200 * light + (x / width) * 20);
    pixels[offset + 1] = Math.round(40 + 155 * light);
    pixels[offset + 2] = Math.round(75 + 80 * light + (y / height) * 20);
    pixels[offset + 3] = 130; // Linear RGB ranges up to about 4; flat RGBE scanline encoding.
  }
}
const directory = new URL("../apps/website/public/environments/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("studio.hdr", directory), Buffer.concat([header, pixels]));
await generateEXRFixture(directory);
console.log(
  `Generated original ${width}×${height} studio.hdr (${header.length + pixels.length} bytes)`,
);
