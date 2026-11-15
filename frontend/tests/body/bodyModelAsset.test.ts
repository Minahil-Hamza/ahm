import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BODY_PARTS } from "@/config/bodyParts";

/** Node names stored in a binary glTF file (its JSON chunk). */
function readGlbNodeNames(file: string): string[] {
  const buffer = readFileSync(file);
  expect(buffer.toString("ascii", 0, 4)).toBe("glTF");
  const jsonLength = buffer.readUInt32LE(12);
  expect(buffer.toString("ascii", 16, 20)).toBe("JSON");
  const json = JSON.parse(buffer.toString("utf8", 20, 20 + jsonLength)) as {
    nodes?: { name?: string }[];
  };
  return (json.nodes ?? []).map((n) => n.name ?? "");
}

describe("public/models/body.glb", () => {
  const names = readGlbNodeNames(
    path.join(__dirname, "..", "..", "public", "models", "body.glb"),
  );

  it("has a separate mesh for every organ in config/bodyParts.ts", () => {
    for (const region of BODY_PARTS) {
      for (const organ of region.organs) {
        expect(names, `${region.id} -> ${organ.meshName}`).toContain(
          organ.meshName,
        );
      }
    }
  });

  it("has a body shell and no organ mesh the config doesn't know", () => {
    expect(names).toContain("body_skin");
    const known = new Set(
      BODY_PARTS.flatMap((r) => r.organs.map((o) => o.meshName)),
    );
    for (const name of names.filter((n) => n.startsWith("organ_"))) {
      expect(known.has(name), name).toBe(true);
    }
  });

  it("stays small enough to precache for offline use", () => {
    const size = readFileSync(
      path.join(__dirname, "..", "..", "public", "models", "body.glb"),
    ).length;
    expect(size).toBeLessThan(2 * 1024 * 1024);
  });
});
