import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

// Original tiny, textured tetrahedron. No third-party models or network downloads.
const output = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/website/public/models");
mkdirSync(output, { recursive: true });
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const name = Buffer.from(type);
  const result = Buffer.alloc(bytes.length + 12);
  result.writeUInt32BE(bytes.length);
  name.copy(result, 4);
  bytes.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, bytes])), result.length - 4);
  return result;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(1, 0);
ihdr.writeUInt32BE(1, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(Buffer.from([0, 255, 255, 255, 255]))),
  chunk("IEND", Buffer.alloc(0)),
]);
const vertices = [
  [0, 1.8, 0],
  [-1, 0, 0.8],
  [1, 0, 0.8],
  [0, 0, -1],
];
const positions = [];
const normals = [];
for (const face of [
  [0, 1, 2],
  [0, 2, 3],
  [0, 3, 1],
  [1, 3, 2],
]) {
  const [a, b, c] = face.map((index) => vertices[index]);
  const u = b.map((value, index) => value - a[index]);
  const v = c.map((value, index) => value - a[index]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n);
  for (const vertex of [a, b, c]) {
    positions.push(...vertex);
    normals.push(...n.map((value) => value / length));
  }
}
function floats(values) {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes;
}
const positionBytes = floats(positions);
const normalBytes = floats(normals);
const binary = Buffer.concat([positionBytes, normalBytes, png]);
const gltf = {
  asset: {
    version: "2.0",
    generator: "ADui Studio model fixture generator",
    copyright: "2026 ADui Studio, MIT",
  },
  scene: 0,
  scenes: [{ name: "ADuiFixture", nodes: [0] }],
  nodes: [{ name: "TexturedTetrahedron", mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: 12,
      type: "VEC3",
      min: [-1, 0, -1],
      max: [1, Math.fround(1.8), Math.fround(0.8)],
    },
    { bufferView: 1, componentType: 5126, count: 12, type: "VEC3" },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: positionBytes.length, target: 34962 },
    { buffer: 0, byteOffset: positionBytes.length, byteLength: normalBytes.length, target: 34962 },
    { buffer: 0, byteOffset: positionBytes.length + normalBytes.length, byteLength: png.length },
  ],
  buffers: [{ byteLength: binary.length }],
  images: [{ bufferView: 2, mimeType: "image/png" }],
  textures: [{ source: 0 }],
  materials: [
    {
      pbrMetallicRoughness: {
        baseColorFactor: [0.86, 0.62, 0.32, 1],
        baseColorTexture: { index: 0 },
        metallicFactor: 0,
        roughnessFactor: 0.65,
      },
    },
  ],
};
writeFileSync(
  resolve(output, "sample.gltf"),
  `${JSON.stringify({ ...gltf, buffers: [{ byteLength: binary.length, uri: `data:application/octet-stream;base64,${binary.toString("base64")}` }] }, null, 2)}\n`,
);
function padded(bytes, padding) {
  return Buffer.concat([bytes, Buffer.alloc((4 - (bytes.length % 4)) % 4, padding)]);
}
const json = padded(Buffer.from(JSON.stringify(gltf)), 0x20);
const bin = padded(binary, 0);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(json.length);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(bin.length);
binHeader.writeUInt32LE(0x004e4942, 4);
writeFileSync(
  resolve(output, "sample.glb"),
  Buffer.concat([header, jsonHeader, json, binHeader, bin]),
);
writeFileSync(resolve(output, "invalid.gltf"), '{"asset":{"version":"1.0"}}\n');
console.log("Generated original GLTF/GLB fixtures and one intentionally invalid glTF.");
