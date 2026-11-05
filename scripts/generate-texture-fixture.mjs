import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";

// Original 32×32 RGBA orientation checker. PNG uses only built-in Node compression.
function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, content, checksum]);
}
const size = 32;
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
const data = Buffer.alloc(size * (size * 4 + 1));
const colors = [
  [240, 65, 45],
  [255, 210, 55],
  [40, 80, 245],
  [235, 245, 255],
];
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const color = colors[(y >= size / 2 ? 2 : 0) + (x >= size / 2 ? 1 : 0)];
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    for (let channel = 0; channel < 3; channel++) data[offset + channel] = color[channel];
    data[offset + 3] = 255;
  }
}
const image = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(data)),
  chunk("IEND", Buffer.alloc(0)),
]);
const directory = new URL("../apps/website/public/textures/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("quadrants.png", directory), image);
await writeFile(new URL("invalid.png", directory), "Invalid image fixture.\n");
console.log(`Generated original ${size}×${size} quadrants.png (${image.length} bytes)`);
