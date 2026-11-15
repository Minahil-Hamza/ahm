// Builds frontend/public/models/body.glb from BodyParts3D source meshes.
//
// Source: BodyParts3D, (c) The Database Center for Life Science, licensed
// under CC Attribution-Share Alike 2.1 Japan (release 3.0 / 20110915),
// fetched as binary STL from the public mirror
// https://github.com/Kevin-Mattheus-Moerman/BodyParts3D
// The resulting body.glb is a derivative work under the same licence.
//
// Usage (needs internet once; the app itself never does):
//   cd frontend/scripts/body-model && npm install && npm run build
//
// Each entry below becomes ONE named mesh in the GLB. `organ_*` names are
// what `config/bodyParts.ts` maps to regions; `body_skin` is the shell.
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import { weld, normals, draco, prune } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import draco3d from "draco3dgltf";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = process.env.BP3D_CACHE ?? path.join(HERE, ".cache");
const OUT = path.join(HERE, "..", "..", "public", "models", "body.glb");
const BASE =
  "https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/main/assets/BodyParts3D_data";

/** name -> FMA concept (a single part, or a composite expanded through
 * composite_parts.txt) and the triangle budget after simplification. */
const PARTS = [
  { name: "body_skin", fma: ["FMA7163"], tris: 26000 },
  { name: "organ_brain", fma: ["FMA50801"], tris: 22000 },
  { name: "organ_eyes", fma: ["FMA12513"], tris: 1200 },
  { name: "organ_heart", fma: ["FMA7088"], tris: 12000 },
  { name: "organ_lung_left", fma: ["FMA7310"], tris: 6000 },
  { name: "organ_lung_right", fma: ["FMA7309"], tris: 6000 },
  { name: "organ_trachea", fma: ["FMA7394"], tris: 2500 },
  { name: "organ_thymus", fma: ["FMA9607"], tris: 1200 },
  { name: "organ_spleen", fma: ["FMA7196"], tris: 2000 },
  { name: "organ_liver", fma: ["FMA7197"], tris: 6000 },
  { name: "organ_stomach", fma: ["FMA7148"], tris: 3500 },
  { name: "organ_pancreas", fma: ["FMA7198"], tris: 2000 },
  { name: "organ_small_intestine", fma: ["FMA7200"], tris: 10000 },
  { name: "organ_large_intestine", fma: ["FMA7201"], tris: 9000 },
  { name: "organ_kidney_left", fma: ["FMA7205"], tris: 2500 },
  { name: "organ_kidney_right", fma: ["FMA7204"], tris: 2500 },
  { name: "organ_spine", fma: ["FMA13478"], tris: 14000 },
];

async function fetchCached(rel) {
  const file = path.join(CACHE, rel);
  try {
    await stat(file);
  } catch {
    const res = await fetch(`${BASE}/${rel}`);
    if (!res.ok) return null;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  return readFile(file);
}

function parseTable(buf) {
  return buf
    .toString("utf8")
    .split("\n")
    .slice(1)
    .map((l) => l.replace(/\r$/, "").split("\t"));
}

/** Binary STL -> flat Float32Array of triangle-soup positions. */
function parseStl(buf) {
  const n = buf.readUInt32LE(80);
  const out = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    for (let k = 0; k < 9; k++) out[i * 9 + k] = buf.readFloatLE(o + k * 4);
  }
  return out;
}

const composites = new Map();
for (const [cid, , pid] of parseTable(
  await fetchCached("composite_parts.txt"),
)) {
  if (!cid) continue;
  if (!composites.has(cid)) composites.set(cid, []);
  composites.get(cid).push(pid);
}

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene("body");
const report = [];

for (const part of PARTS) {
  const chunks = [];
  const used = [];
  for (const id of part.fma) {
    // A concept with its own STL is used as is; otherwise its primitives.
    const own = await fetchCached(`stl/${id}.stl`);
    const ids = own ? [id] : (composites.get(id) ?? []);
    for (const pid of ids) {
      const buf = pid === id ? own : await fetchCached(`stl/${pid}.stl`);
      if (!buf) continue;
      chunks.push(parseStl(buf));
      used.push(pid);
    }
  }
  if (chunks.length === 0) {
    console.warn(`!! ${part.name}: no source mesh found, skipped`);
    continue;
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const positions = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    // BodyParts3D: millimetres, x = left(+)/right, y = back(+)/front,
    // z = up. glTF: metres, y up, facing +z.
    for (let i = 0; i < c.length; i += 3) {
      positions[off + i] = c[i] / 1000;
      positions[off + i + 1] = c[i + 2] / 1000;
      positions[off + i + 2] = -c[i + 1] / 1000;
    }
    off += c.length;
  }
  const prim = doc
    .createPrimitive()
    .setAttribute(
      "POSITION",
      doc
        .createAccessor()
        .setType("VEC3")
        .setArray(positions)
        .setBuffer(buffer),
    );
  const mesh = doc.createMesh(part.name).addPrimitive(prim);
  scene.addChild(doc.createNode(part.name).setMesh(mesh));
  report.push({ ...part, sourceTris: total / 9, used });
}

await MeshoptSimplifier.ready;
await doc.transform(weld());
for (const mesh of doc.getRoot().listMeshes()) {
  const part = report.find((r) => r.name === mesh.getName());
  const ratio = Math.min(1, part.tris / part.sourceTris);
  // gltf-transform's simplify() uses one ratio for the whole document;
  // each organ has its own budget, so call meshoptimizer directly.
  const prim = mesh.listPrimitives()[0];
  const pos = prim.getAttribute("POSITION").getArray();
  const idx = prim.getIndices().getArray();
  const target = Math.floor((idx.length / 3) * ratio) * 3;
  const [next] = MeshoptSimplifier.simplify(
    new Uint32Array(idx),
    pos,
    3,
    target,
    0.02,
    [],
  );
  prim.getIndices().setArray(next);
  part.outTris = next.length / 3;
}
await doc.transform(prune(), weld(), normals({ overwrite: true }));

doc.createExtension(KHRDracoMeshCompression).setRequired(true);
await doc.transform(draco({ quantizePosition: 14, quantizeNormal: 10 }));

const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({
    "draco3d.encoder": await draco3d.createEncoderModule(),
    "draco3d.decoder": await draco3d.createDecoderModule(),
  });
await mkdir(path.dirname(OUT), { recursive: true });
await io.write(OUT, doc);
for (const r of report)
  console.log(
    `${r.name.padEnd(24)} ${String(r.sourceTris).padStart(8)} -> ${String(r.outTris).padStart(6)} tris  (${r.used.length} source parts: ${r.fma.join(",")})`,
  );
console.log(`wrote ${OUT} (${((await stat(OUT)).size / 1024).toFixed(0)} KB)`);
