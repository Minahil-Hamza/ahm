// Prints each mesh's bounding box in body.glb (sanity check after a build).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO, getBounds } from "@gltf-transform/core";
import { KHRDracoMeshCompression } from "@gltf-transform/extensions";
import draco3d from "draco3dgltf";
const file = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "public",
  "models",
  "body.glb",
);
const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
  });
const doc = await io.read(file);
const f = (v) => v.map((n) => n.toFixed(3)).join(", ");
for (const node of doc.getRoot().listNodes()) {
  const { min, max } = getBounds(node);
  console.log(node.getName().padEnd(24), `min [${f(min)}]  max [${f(max)}]`);
}
