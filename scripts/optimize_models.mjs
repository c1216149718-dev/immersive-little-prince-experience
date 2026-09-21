/**
 * Losslessly compress prepared models with the decoder already used by drei.
 * Run: node scripts/optimize_models.mjs
 * Originals remain in public/models; review output is verification/optimized-models.
 * No simplification, quantization, texture conversion, or vertex reordering.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptEncoder } from 'meshoptimizer/encoder';
import { MeshoptDecoder } from 'three-stdlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputDirectory = path.join(root, 'public', 'models');
const outputDirectory = path.join(root, 'verification', 'optimized-models');
const extension = 'EXT_meshopt_compression';
const decoder = typeof MeshoptDecoder === 'function' ? MeshoptDecoder() : MeshoptDecoder;
const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const align = (n) => Math.ceil(n / 4) * 4;
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function parseGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Expected GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'Expected GLB version 2');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'Invalid GLB length');
  let doc;
  let binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    assert.equal(length % 4, 0, 'Unaligned GLB chunk');
    assert.ok(offset + 8 + length <= bytes.length, 'Truncated GLB chunk');
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) doc = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) binary = data;
    else throw new Error('Unexpected GLB chunk; refusing to discard it');
    offset += 8 + length;
  }
  assert.ok(doc && binary, 'Expected JSON and embedded BIN chunks');
  return { doc, binary };
}

function serializeGlb(doc, binary) {
  // JSON.stringify normally normalizes -0; preserve metadata numbers exactly too.
  const json = Buffer.from(JSON.stringify(doc, (_key, value) =>
    Object.is(value, -0) ? JSON.rawJSON('-0') : value));
  const jsonLength = align(json.length);
  const binaryLength = align(binary.length);
  const result = Buffer.alloc(28 + jsonLength + binaryLength);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonLength, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  result.fill(0x20, 20, 20 + jsonLength);
  json.copy(result, 20);
  result.writeUInt32LE(binaryLength, 20 + jsonLength);
  result.writeUInt32LE(0x004e4942, 24 + jsonLength);
  binary.copy(result, 28 + jsonLength);
  return result;
}

function bytesForView(binary, view) {
  const offset = view.byteOffset ?? 0;
  assert.ok(offset + view.byteLength <= binary.length, 'Buffer view exceeds BIN chunk');
  return binary.subarray(offset, offset + view.byteLength);
}

function compressionLayout(doc, viewIndex, indexAccessors) {
  const view = doc.bufferViews[viewIndex];
  const accessors = doc.accessors
    .map((accessor, index) => ({ ...accessor, index }))
    .filter((accessor) => accessor.bufferView === viewIndex);
  // The adapter emits separate, packed accessor streams. Preserve other layouts.
  if (accessors.length !== 1) return null;
  const accessor = accessors[0];
  const stride = view.byteStride
    ?? componentBytes[accessor.componentType] * components[accessor.type];
  if ((accessor.byteOffset ?? 0) !== 0 || accessor.count * stride !== view.byteLength) return null;
  const mode = indexAccessors.has(accessor.index) ? 'INDICES' : 'ATTRIBUTES';
  if (mode === 'INDICES' && ![2, 4].includes(stride)) return null;
  if (mode === 'ATTRIBUTES' && (!stride || stride % 4 !== 0 || stride > 256)) return null;
  // INDICES preserves the exact sequence, including each triangle's first vertex.
  return { count: accessor.count, byteStride: stride, mode };
}

function verify(source, result) {
  const before = source.doc;
  const after = result.doc;
  for (const key of Object.keys(before)) {
    if (['buffers', 'bufferViews', 'extensionsUsed', 'extensionsRequired'].includes(key)) continue;
    assert.deepEqual(after[key], before[key], `Changed model metadata: ${key}`);
  }
  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    assert.deepEqual((after[key] ?? []).filter((item) => item !== extension), before[key] ?? []);
  }
  assert.equal(after.bufferViews.length, before.bufferViews.length);
  let compressedViews = 0;
  for (let i = 0; i < before.bufferViews.length; i++) {
    const original = before.bufferViews[i];
    const view = after.bufferViews[i];
    const encoded = view.extensions?.[extension];
    let decoded;
    if (encoded) {
      assert.equal(view.buffer, 1);
      assert.ok(view.byteOffset + view.byteLength <= after.buffers[1].byteLength);
      assert.equal(view.byteLength, encoded.count * encoded.byteStride);
      decoded = Buffer.alloc(view.byteLength);
      decoder.decodeGltfBuffer(
        decoded, encoded.count, encoded.byteStride,
        bytesForView(result.binary, encoded), encoded.mode, 'NONE',
      );
      compressedViews++;
    } else {
      assert.equal(view.buffer, 0);
      decoded = bytesForView(result.binary, view);
    }
    assert.deepEqual(decoded, bytesForView(source.binary, original), `Changed buffer view ${i}`);
    const restored = structuredClone(view);
    restored.buffer = original.buffer;
    if ('byteOffset' in original) restored.byteOffset = original.byteOffset;
    else delete restored.byteOffset;
    if (encoded) {
      delete restored.extensions[extension];
      if (!Object.keys(restored.extensions).length) delete restored.extensions;
    }
    assert.deepEqual(restored, original, `Changed buffer view metadata ${i}`);
  }
  return compressedViews;
}

function optimize(bytes) {
  const source = parseGlb(bytes);
  assert.equal(source.doc.buffers.length, 1, 'Only embedded, single-buffer inputs are supported');
  assert.ok(!source.doc.buffers[0].uri, 'External buffers are not supported');
  assert.ok(!(source.doc.extensionsUsed ?? []).includes(extension), 'Input is already compressed');
  const doc = structuredClone(source.doc);
  const indexAccessors = new Set(doc.meshes.flatMap((mesh) =>
    mesh.primitives.flatMap((primitive) => primitive.indices === undefined ? [] : [primitive.indices])));
  const parts = [];
  let binaryLength = 0;
  let fallbackLength = 0;
  let compressedViews = 0;
  function append(data) {
    const offset = align(binaryLength);
    if (offset > binaryLength) parts.push(Buffer.alloc(offset - binaryLength));
    parts.push(Buffer.from(data));
    binaryLength = offset + data.length;
    return offset;
  }
  for (let i = 0; i < doc.bufferViews.length; i++) {
    const view = doc.bufferViews[i];
    assert.equal(view.buffer, 0);
    const original = bytesForView(source.binary, view);
    const layout = compressionLayout(source.doc, i, indexAccessors);
    // Version 0 is required by EXT_meshopt_compression and the installed decoder.
    const encoded = layout
      ? MeshoptEncoder.encodeGltfBuffer(original, layout.count, layout.byteStride, layout.mode, 0)
      : null;
    if (encoded && encoded.length + 256 < original.length) {
      view.buffer = 1;
      view.byteOffset = align(fallbackLength);
      fallbackLength = view.byteOffset + view.byteLength;
      view.extensions = {
        ...view.extensions,
        [extension]: {
          buffer: 0, byteOffset: append(encoded), byteLength: encoded.length, ...layout,
        },
      };
      compressedViews++;
    } else {
      view.byteOffset = append(original);
    }
  }
  doc.buffers = [{ ...doc.buffers[0], byteLength: align(binaryLength) }];
  if (compressedViews) {
    doc.buffers.push({
      byteLength: fallbackLength,
      extensions: { [extension]: { fallback: true } },
    });
    for (const key of ['extensionsUsed', 'extensionsRequired']) {
      doc[key] = [...(doc[key] ?? []), extension];
    }
  }
  const result = serializeGlb(doc, Buffer.concat(parts));
  assert.equal(verify(source, parseGlb(result)), compressedViews);
  assert.ok(result.length <= bytes.length, 'Optimization increased file size');
  return { bytes: result, compressedViews };
}

assert.ok(MeshoptEncoder.supported && decoder.supported, 'WebAssembly meshopt support is required');
await Promise.all([MeshoptEncoder.ready, decoder.ready]);
await mkdir(outputDirectory, { recursive: true });
const requested = process.argv.slice(2).map(name => name.endsWith('.glb') ? name : `${name}.glb`);
const files = (await readdir(inputDirectory)).filter((name) => name.endsWith('.glb') && (!requested.length || requested.includes(name))).sort();
assert.ok(files.length, 'No prepared GLBs found');
const models = [];
for (const name of files) {
  const sourcePath = path.join(inputDirectory, name);
  const original = await readFile(sourcePath);
  const result = optimize(original);
  // Catch a simultaneous adapter run before writing a stale verification output.
  assert.equal(digest(await readFile(sourcePath)), digest(original), `${name} changed during optimization`);
  const outputPath = path.join(outputDirectory, name);
  await writeFile(outputPath, result.bytes);
  verify(parseGlb(original), parseGlb(await readFile(outputPath)));
  const report = {
    name, sourceBytes: original.length, optimizedBytes: result.bytes.length,
    savedPercent: Number((100 * (1 - result.bytes.length / original.length)).toFixed(2)),
    compressedViews: result.compressedViews,
    sourceSha256: digest(original), outputSha256: digest(result.bytes),
    byteExactRoundTrip: true, decoder: 'three-stdlib MeshoptDecoder (drei default)',
  };
  models.push(report);
  console.log(`${name}: ${report.sourceBytes} -> ${report.optimizedBytes} bytes (${report.savedPercent}% smaller); byte-exact round trip passed`);
}
const total = models.reduce((sum, model) => ({
  sourceBytes: sum.sourceBytes + model.sourceBytes,
  optimizedBytes: sum.optimizedBytes + model.optimizedBytes,
}), { sourceBytes: 0, optimizedBytes: 0 });
await writeFile(path.join(outputDirectory, requested.length ? 'report-selected.json' : 'report.json'), JSON.stringify({
  method: 'Lossless EXT_meshopt_compression; geometry, textures, rigs and animations unchanged',
  models, total,
}, null, 2) + '\n');
console.log(`Total: ${total.sourceBytes} -> ${total.optimizedBytes} bytes (${(100 * (1 - total.optimizedBytes / total.sourceBytes)).toFixed(2)}% smaller)`);

