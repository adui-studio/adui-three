import { writeFile } from "node:fs/promises";

// Original single-part, uncompressed RGB OpenEXR. Channel samples are little-endian FLOAT.
// Layout reference: https://openexr.com/en/latest/OpenEXRFileLayout.html
export async function generateEXRFixture(directory) {
  const width = 64,
    height = 32;
  const integer = (value) => {
    const bytes = Buffer.alloc(4);
    bytes.writeInt32LE(value);
    return bytes;
  };
  const scalar = (value) => {
    const bytes = Buffer.alloc(4);
    bytes.writeFloatLE(value);
    return bytes;
  };
  const string = (value) => Buffer.from(`${value}\0`);
  const attribute = (name, type, data) =>
    Buffer.concat([string(name), string(type), integer(data.length), data]);
  const names = ["B", "G", "R"];
  const channels = Buffer.concat([
    ...names.map((name) =>
      Buffer.concat([string(name), integer(2), Buffer.alloc(4), integer(1), integer(1)]),
    ),
    Buffer.alloc(1),
  ]);
  const window = Buffer.concat([integer(0), integer(0), integer(width - 1), integer(height - 1)]);
  const header = Buffer.concat([
    integer(20000630),
    integer(2),
    attribute("channels", "chlist", channels),
    attribute("compression", "compression", Buffer.from([0])),
    attribute("dataWindow", "box2i", window),
    attribute("displayWindow", "box2i", window),
    attribute("lineOrder", "lineOrder", Buffer.from([0])),
    attribute("pixelAspectRatio", "float", scalar(1)),
    attribute("screenWindowCenter", "v2f", Buffer.alloc(8)),
    attribute("screenWindowWidth", "float", scalar(1)),
    Buffer.alloc(1),
  ]);
  const rowBytes = width * names.length * 4,
    chunks = [],
    offsets = Buffer.alloc(height * 8);
  for (let y = 0; y < height; y++) {
    const pixels = Buffer.alloc(rowBytes);
    for (let channel = 0; channel < names.length; channel++) {
      for (let x = 0; x < width; x++) {
        const light = Math.exp(-((x - 20) ** 2 / 70 + (y - 9) ** 2 / 25));
        const value =
          names[channel] === "R"
            ? 0.2 + 4 * light + (x / width) * 0.2
            : names[channel] === "G"
              ? 0.3 + 2.8 * light
              : 0.6 + 1.6 * light + (y / height) * 0.2;
        pixels.writeFloatLE(value, (channel * width + x) * 4);
      }
    }
    offsets.writeBigUInt64LE(BigInt(header.length + offsets.length + y * (rowBytes + 8)), y * 8);
    chunks.push(Buffer.concat([integer(y), integer(rowBytes), pixels]));
  }
  const data = Buffer.concat([header, offsets, ...chunks]);
  await writeFile(new URL("studio.exr", directory), data);
  await writeFile(new URL("invalid.exr", directory), "Intentionally invalid OpenEXR fixture.\n");
  console.log(`Generated original ${width}×${height} studio.exr (${data.length} bytes)`);
}
