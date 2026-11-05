import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Official Basis Universal v1_60_snapshot_final, pinned to its commit and byte hashes.
// Development-only: these tools stay in an ignored cache and never enter either runtime bundle.
const revision = "c54f46f8aaa44eff1bc6e1d919e61e18b2b8f7d1";
const cache = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.cache/model-fixtures/basis-1.60",
);
const files = [
  [
    "basis_encoder.js",
    "basis_encoder.cjs",
    "c87e6677064b9c64a9a3dc15bb4f35d644f67e03e6bfa34c682df3382603c4ef",
  ],
  [
    "basis_encoder.wasm",
    "basis_encoder.wasm",
    "15f1c81e7804306cbfebc54e80fe44103c9530cfca00789929cb5c87a4fac897",
  ],
];

async function encoderModule() {
  await mkdir(cache, { recursive: true });
  const verified = [];
  for (const [remote, local, hash] of files) {
    const path = resolve(cache, local);
    let bytes;
    try {
      bytes = await readFile(path);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const url = `https://raw.githubusercontent.com/BinomialLLC/basis_universal/${revision}/webgl/encoder/build/${remote}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok)
        throw new Error(`Basis fixture encoder download failed: ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (createHash("sha256").update(bytes).digest("hex") !== hash)
      throw new Error(`Basis fixture encoder hash mismatch: ${local}`);
    await writeFile(path, bytes);
    verified.push(bytes);
  }
  const factory = createRequire(import.meta.url)(resolve(cache, "basis_encoder.cjs"));
  const module = await factory({ wasmBinary: verified[1] });
  module.initializeBasis();
  return module;
}

export async function encodeKTX2(pixels, width, height) {
  const module = await encoderModule();
  const encoder = new module.BasisEncoder();
  try {
    encoder.setCreateKTX2File(true);
    encoder.setKTX2SRGBTransferFunc(true);
    encoder.setPerceptual(true);
    encoder.setUASTC(false);
    encoder.setQualityLevel(128);
    encoder.setMipGen(true);
    encoder.setSliceSourceImage(0, pixels, width, height, false);
    const output = new Uint8Array(width * height * 4 + 16384);
    const length = encoder.encode(output);
    if (!length) throw new Error("Basis fixture encoding failed");
    return Buffer.from(output.slice(0, length));
  } finally {
    encoder.delete();
  }
}
