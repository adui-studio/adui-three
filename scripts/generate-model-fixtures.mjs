import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import draco from "draco3dgltf";
import { MeshoptEncoder } from "meshoptimizer";
import { encodeKTX2 } from "./basis-encoder.mjs";

// Original tiny, textured tetrahedron. No third-party model or image input.
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
function writeGLB(name, asset, bytes) {
  const json = padded(Buffer.from(JSON.stringify(asset)), 0x20);
  const bin = padded(bytes, 0);
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
  writeFileSync(resolve(output, name), Buffer.concat([header, jsonHeader, json, binHeader, bin]));
}
writeGLB("sample.glb", gltf, binary);
// Two original node-translation clips; all FLOAT views begin on 4-byte boundaries.
const base = padded(binary, 0);
const times = floats([0, 1, 2]);
const lift = floats([0, 0, 0, 0, 0.6, 0, 0, 0, 0]);
const slide = floats([0, 0, 0, 0.6, 0, 0, 0, 0, 0]);
const animatedBytes = Buffer.concat([base, times, lift, slide]);
const animated = {
  ...gltf,
  buffers: [{ byteLength: animatedBytes.length }],
  bufferViews: [
    ...gltf.bufferViews,
    { buffer: 0, byteOffset: base.length, byteLength: times.length },
    { buffer: 0, byteOffset: base.length + times.length, byteLength: lift.length },
    { buffer: 0, byteOffset: base.length + times.length + lift.length, byteLength: slide.length },
  ],
  accessors: [
    ...gltf.accessors,
    { bufferView: 3, componentType: 5126, count: 3, type: "SCALAR", min: [0], max: [2] },
    { bufferView: 4, componentType: 5126, count: 3, type: "VEC3" },
    { bufferView: 5, componentType: 5126, count: 3, type: "VEC3" },
  ],
  animations: [
    {
      name: "Lift",
      samplers: [{ input: 2, output: 3, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
    },
    {
      name: "Slide",
      samplers: [{ input: 2, output: 4, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
    },
  ],
};
writeGLB("animated.glb", animated, animatedBytes);
// Two-joint skin plus one morph target, authored from the same original tetrahedron.
// Joint 2 deliberately has no name so its animation exercises UUID track bindings.
const joints = Buffer.alloc((positions.length / 3) * 4 * 2);
const jointWeights = [];
const morphPositions = [];
for (let vertex = 0; vertex < positions.length / 3; vertex++) {
  joints.writeUInt16LE(1, vertex * 8 + 2);
  const topWeight = positions[vertex * 3 + 1] / 1.8;
  jointWeights.push(1 - topWeight, topWeight, 0, 0);
  morphPositions.push(topWeight, 0, 0);
}
const skinViews = [...gltf.bufferViews];
const skinAccessors = [...gltf.accessors];
const skinChunks = [base];
let skinOffset = base.length;
function skinAccessor(bytes, componentType, count, type, bounds = {}, target) {
  const bufferView = skinViews.length;
  skinViews.push({
    buffer: 0,
    byteOffset: skinOffset,
    byteLength: bytes.length,
    ...(target ? { target } : {}),
  });
  skinChunks.push(padded(bytes, 0));
  skinOffset += (bytes.length + 3) & ~3;
  const index = skinAccessors.length;
  skinAccessors.push({ bufferView, componentType, count, type, ...bounds });
  return index;
}
const skinJoints = skinAccessor(joints, 5123, 12, "VEC4", {}, 34962);
const skinWeights = skinAccessor(floats(jointWeights), 5126, 12, "VEC4", {}, 34962);
const morphPosition = skinAccessor(
  floats(morphPositions),
  5126,
  12,
  "VEC3",
  { min: [0, 0, 0], max: [1, 0, 0] },
  34962,
);
const inverseBinds = skinAccessor(
  floats([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, 0, 1,
  ]),
  5126,
  2,
  "MAT4",
);
const skinTimes = skinAccessor(times, 5126, 3, "SCALAR", { min: [0], max: [2] });
const skinRotations = skinAccessor(
  floats([0, 0, 0, 1, 0, 0, Math.sin(0.5), Math.cos(0.5), 0, 0, 0, 1]),
  5126,
  3,
  "VEC4",
);
const morphWeights = skinAccessor(floats([0, 1, 0]), 5126, 3, "SCALAR");
writeGLB(
  "skin-morph.glb",
  {
    ...gltf,
    scenes: [{ name: "ADuiSkinMorph", nodes: [0, 1] }],
    nodes: [
      { name: "SkinMorphTetrahedron", mesh: 0, skin: 0 },
      { name: "RootJoint", children: [2] },
      { translation: [0, 1, 0] },
    ],
    skins: [{ inverseBindMatrices: inverseBinds, skeleton: 1, joints: [1, 2] }],
    meshes: [
      {
        weights: [0],
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: skinJoints, WEIGHTS_0: skinWeights },
            material: 0,
            targets: [{ POSITION: morphPosition }],
          },
        ],
      },
    ],
    buffers: [{ byteLength: skinOffset }],
    bufferViews: skinViews,
    accessors: skinAccessors,
    animations: [
      {
        name: "Bend",
        samplers: [{ input: skinTimes, output: skinRotations, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 2, path: "rotation" } }],
      },
      {
        name: "Morph",
        samplers: [{ input: skinTimes, output: morphWeights, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "weights" } }],
      },
    ],
  },
  Buffer.concat(skinChunks),
);
// Compress only project-authored attributes; no third-party input assets.
const encoderModule = await draco.createEncoderModule({});
const encoder = new encoderModule.Encoder();
const builder = new encoderModule.MeshBuilder();
const mesh = new encoderModule.Mesh();
const encoded = new encoderModule.DracoInt8Array();
try {
  builder.AddFacesToMesh(mesh, 4, new Uint32Array(Array.from({ length: 12 }, (_, i) => i)));
  const positionId = builder.AddFloatAttributeToMesh(
    mesh,
    encoderModule.POSITION,
    12,
    3,
    new Float32Array(positions),
  );
  const normalId = builder.AddFloatAttributeToMesh(
    mesh,
    encoderModule.NORMAL,
    12,
    3,
    new Float32Array(normals),
  );
  encoder.SetSpeedOptions(5, 5);
  encoder.SetAttributeQuantization(encoderModule.POSITION, 14);
  encoder.SetAttributeQuantization(encoderModule.NORMAL, 10);
  encoder.SetEncodingMethod(encoderModule.MESH_EDGEBREAKER_ENCODING);
  const length = encoder.EncodeMeshToDracoBuffer(mesh, encoded);
  if (length <= 0) throw new Error("Draco fixture encoding failed");
  const geometryBytes = Buffer.from(Array.from({ length }, (_, i) => encoded.GetValue(i) & 255));
  const aligned = padded(geometryBytes, 0);
  const bytes = Buffer.concat([aligned, png]);
  writeGLB(
    "draco.glb",
    {
      ...gltf,
      extensionsUsed: ["KHR_draco_mesh_compression"],
      extensionsRequired: ["KHR_draco_mesh_compression"],
      meshes: [
        {
          primitives: [
            {
              attributes: { POSITION: 0, NORMAL: 1 },
              material: 0,
              extensions: {
                KHR_draco_mesh_compression: {
                  bufferView: 0,
                  attributes: { POSITION: positionId, NORMAL: normalId },
                },
              },
            },
          ],
        },
      ],
      accessors: gltf.accessors.map(({ bufferView: _view, ...accessor }) => accessor),
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: geometryBytes.length },
        { buffer: 0, byteOffset: aligned.length, byteLength: png.length },
      ],
      buffers: [{ byteLength: bytes.length }],
      images: [{ bufferView: 1, mimeType: "image/png" }],
    },
    bytes,
  );
} finally {
  for (const value of [encoded, mesh, builder, encoder]) encoderModule.destroy(value);
}
await MeshoptEncoder.ready;
const compressedPositions = Buffer.from(MeshoptEncoder.encodeVertexBuffer(positionBytes, 12, 12));
const compressedNormals = Buffer.from(MeshoptEncoder.encodeVertexBuffer(normalBytes, 12, 12));
const positionBlock = padded(compressedPositions, 0);
const normalBlock = padded(compressedNormals, 0);
const meshoptBytes = Buffer.concat([positionBlock, normalBlock, png]);
const compressedView = (byteOffset, compressedLength, fallbackOffset, decodedLength) => ({
  buffer: 1,
  byteOffset: fallbackOffset,
  byteLength: decodedLength,
  byteStride: 12,
  target: 34962,
  extensions: {
    EXT_meshopt_compression: {
      buffer: 0,
      byteOffset,
      byteLength: compressedLength,
      byteStride: 12,
      count: 12,
      mode: "ATTRIBUTES",
      filter: "NONE",
    },
  },
});
writeGLB(
  "meshopt.glb",
  {
    ...gltf,
    extensionsUsed: ["EXT_meshopt_compression"],
    extensionsRequired: ["EXT_meshopt_compression"],
    buffers: [
      { byteLength: meshoptBytes.length },
      {
        byteLength: positionBytes.length + normalBytes.length,
        extensions: { EXT_meshopt_compression: { fallback: true } },
      },
    ],
    bufferViews: [
      compressedView(0, compressedPositions.length, 0, positionBytes.length),
      compressedView(
        positionBlock.length,
        compressedNormals.length,
        positionBytes.length,
        normalBytes.length,
      ),
      { buffer: 0, byteOffset: positionBlock.length + normalBlock.length, byteLength: png.length },
    ],
  },
  meshoptBytes,
);
// Original 16×16 checker, explicit UVs and full mip chain; no copyrighted input image.
const pixels = new Uint8Array(16 * 16 * 4);
for (let y = 0; y < 16; y++)
  for (let x = 0; x < 16; x++) {
    const light = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
    pixels.set(light ? [240, 210, 90, 255] : [30, 95, 160, 255], (y * 16 + x) * 4);
  }
const ktx2 = await encodeKTX2(pixels, 16, 16);
writeFileSync(resolve(output, "checker.ktx2"), ktx2);
const uvs = floats(Array.from({ length: 4 }, () => [0, 1, 0, 0, 1, 0]).flat());
const texturedGeometry = Buffer.concat([positionBytes, normalBytes, uvs]);
const ktxBytes = Buffer.concat([texturedGeometry, ktx2]);
const ktxAsset = {
  ...gltf,
  extensionsUsed: ["KHR_texture_basisu"],
  extensionsRequired: ["KHR_texture_basisu"],
  meshes: [
    { primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, material: 0 }] },
  ],
  accessors: [...gltf.accessors, { bufferView: 2, componentType: 5126, count: 12, type: "VEC2" }],
  bufferViews: [
    ...gltf.bufferViews.slice(0, 2),
    {
      buffer: 0,
      byteOffset: positionBytes.length + normalBytes.length,
      byteLength: uvs.length,
      target: 34962,
    },
    { buffer: 0, byteOffset: texturedGeometry.length, byteLength: ktx2.length },
  ],
  buffers: [{ byteLength: ktxBytes.length }],
  images: [{ bufferView: 3, mimeType: "image/ktx2" }],
  textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
  materials: [
    {
      pbrMetallicRoughness: {
        ...gltf.materials[0].pbrMetallicRoughness,
        baseColorFactor: [1, 1, 1, 1],
      },
    },
  ],
};
writeGLB("ktx2.glb", ktxAsset, ktxBytes);
writeFileSync(
  resolve(output, "ktx2.gltf"),
  `${JSON.stringify(
    {
      ...ktxAsset,
      buffers: [
        {
          byteLength: texturedGeometry.length,
          uri: `data:application/octet-stream;base64,${texturedGeometry.toString("base64")}`,
        },
      ],
      bufferViews: ktxAsset.bufferViews.slice(0, 3),
      images: [{ uri: "checker.ktx2", mimeType: "image/ktx2" }],
    },
    null,
    2,
  )}\n`,
);
writeFileSync(resolve(output, "invalid.gltf"), '{"asset":{"version":"1.0"}}\n');
console.log(
  "Generated original static/animated/skin-morph/Draco/Meshopt/KTX2 fixtures and one intentionally invalid glTF.",
);
