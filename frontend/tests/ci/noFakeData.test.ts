import { describe, expect, it } from "vitest";
import { scanRepo, scanText } from "../../scripts/check-no-fake-data.mjs";

interface Hit {
  rule: string;
  line: number;
}

function rules(text: string, file = "frontend/lib/x.ts"): string[] {
  return (scanText(text, file).findings as Hit[]).map((h) => h.rule);
}

describe("no-fake-data CI check (SPEC §16 item 4)", () => {
  it("flags Math.random, faker and Python random", () => {
    expect(rules("const v = Math.random() * 40 + 60;")).toEqual([
      "math-random",
    ]);
    expect(rules('import { faker } from "@faker-js/faker";')).toContain(
      "faker",
    );
    expect(rules("import random", "backend/app/x.py")).toEqual([
      "python-random",
    ]);
    expect(rules("from random import randint", "backend/app/x.py")).toEqual([
      "python-random",
    ]);
  });

  it("flags literal health values and health arrays", () => {
    expect(rules("const log = { heart_rate: 72 };")).toEqual([
      "health-literal",
    ]);
    expect(rules('payload = {"spo2": 97}', "backend/app/x.py")).toEqual([
      "health-literal",
    ]);
    expect(rules("sleep_hours = 7.5", "backend/app/x.py")).toEqual([
      "health-literal",
    ]);
    expect(rules("const heartRates = [72, 75];")).toEqual(["health-array"]);
    expect(rules("const xs = [1, 2, 3, 4, 5, 6];")).toEqual(["number-series"]);
  });

  it("does not flag ordinary code", () => {
    expect(rules("if (log.heart_rate === 0) return;")).toEqual([]);
    expect(rules("heart_rate: z.number().min(r.min)")).toEqual([]);
    expect(rules("const position = [0, 1.6, 0];")).toEqual([]);
    expect(rules("<Canvas dpr={[1, 2]} />", "frontend/components/a.tsx")).toEqual([]);
    expect(rules("const pick = (heart_rate) => heart_rate;")).toEqual([]);
  });

  it("honours a reviewed exception on the same or previous line", () => {
    const same = "const d = [1, 2, 3, 4, 5, 6, 7]; // no-fake-data-ok: weekdays";
    const above = "// no-fake-data-ok: weekdays\nconst d = [1, 2, 3, 4, 5, 6, 7];";
    expect(scanText(same, "a.ts").findings).toHaveLength(0);
    expect(scanText(above, "a.ts").findings).toHaveLength(0);
    expect(scanText(above, "a.ts").allowed).toHaveLength(1);
    // A bare marker without a reason is not enough.
    expect(
      scanText("const d = [1, 2, 3, 4, 5, 6]; // no-fake-data-ok:", "a.ts")
        .findings,
    ).toHaveLength(1);
  });

  it("the real app code passes", () => {
    const { files, findings } = scanRepo() as {
      files: number;
      findings: Hit[];
    };
    expect(files).toBeGreaterThan(50);
    expect(findings).toEqual([]);
  }, 60_000); // walks ~160 files; slow on a Windows-mounted drive
});
