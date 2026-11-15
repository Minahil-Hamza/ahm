#!/usr/bin/env node
// SPEC §16 policy item 4: fail the build if app code uses Math.random(),
// faker, or literal health values outside tests/ and config/.
//
// Scans the frontend app code and the backend app code. Thresholds are
// configuration, not patient data, so `frontend/config/` and the server's
// `thresholds.json` are not scanned; neither are tests, generated files
// (public/sw.js, .next) or vendored third-party code (public/draco).
//
// A line that is a deliberate, reviewed exception can carry the comment
// `no-fake-data-ok: <reason>` on the same line or the line above. Every
// such exception is printed so it stays visible in CI output.
//
// Usage: node scripts/check-no-fake-data.mjs   (exit 1 on any finding)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

/** Directories scanned, relative to the repo root. */
export const SCAN_ROOTS = [
  "frontend/app",
  "frontend/components",
  "frontend/lib",
  "frontend/content",
  "frontend/worker",
  "backend/app",
  "backend/alembic",
];

/** Path segments that are never scanned (tests, config, generated). */
const SKIP_SEGMENTS = new Set([
  "tests",
  "config",
  "node_modules",
  ".next",
  "__pycache__",
  ".venv",
  ".pytest_tmp",
]);

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py"]);

/** Every per-log health field (frontend `DailyLog`, server `daily_logs`). */
const HEALTH_FIELDS = [
  "heart_rate",
  "bp_systolic",
  "bp_diastolic",
  "glucose_mgdl",
  "temperature_c",
  "spo2",
  "sleep_hours",
  "sleep_quality",
  "exercise_resistance_min",
  "exercise_cardio_min",
  "water_ml",
  "weight_kg",
  "radiation_msv",
  "team_relations",
  "mood",
  "stress",
];
const FIELD_ALT = HEALTH_FIELDS.join("|");
const NUM = String.raw`-?\d+(?:\.\d+)?`;

export const RULES = [
  {
    id: "math-random",
    message: "Math.random() in app code (no generated data)",
    test: (line, ext) => ext !== ".py" && /\bMath\s*\.\s*random\s*\(/.test(line),
  },
  {
    id: "python-random",
    message: "Python `random` module in app code (no generated data)",
    test: (line, ext) =>
      ext === ".py" &&
      /^\s*(?:import\s+random\b|from\s+random\s+import\b)/.test(line),
  },
  {
    id: "faker",
    message: "faker in app code (no generated data)",
    test: (line) => /\bfaker\b/i.test(line) || /@faker-js/.test(line),
  },
  {
    // `heart_rate: 72`, `"spo2": 97`, `sleep_hours = 7.5`, `mood=3`
    id: "health-literal",
    message: "literal health value assigned to a health field",
    test: (line) =>
      new RegExp(
        String.raw`["']?\b(?:${FIELD_ALT})\b["']?\s*(?::|=(?!=|>))\s*${NUM}\b`,
      ).test(line),
  },
  {
    // `heartRates = [72, 75, 80]`, `"spo2": [97, 98, 96]`
    id: "health-array",
    message: "literal number array named after a health measure",
    test: (line) =>
      new RegExp(
        String.raw`\w*(?:${FIELD_ALT}|heart|bpm|pulse|systolic|diastolic|glucose|temperature|sleep|weight|oxygen)\w*["']?\s*[:=]\s*\[\s*${NUM}\s*,`,
        "i",
      ).test(line),
  },
  {
    // Any long run of numbers in one literal array looks like a data series.
    id: "number-series",
    message: "literal array of 6 or more numbers (looks like a data series)",
    test: (line) =>
      new RegExp(String.raw`\[\s*${NUM}(?:\s*,\s*${NUM}){5,}\s*,?\s*\]`).test(
        line,
      ),
  },
];

const ALLOW = /no-fake-data-ok:\s*\S/;

/** Scan one file's text. Returns findings and the allowed exceptions. */
export function scanText(text, filePath) {
  const ext = extname(filePath);
  const lines = text.split(/\r?\n/);
  const findings = [];
  const allowed = [];
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (!rule.test(line, ext)) continue;
      const hit = { file: filePath, line: index + 1, rule: rule.id, message: rule.message, text: line.trim() };
      if (ALLOW.test(line) || (index > 0 && ALLOW.test(lines[index - 1]))) {
        allowed.push(hit);
      } else {
        findings.push(hit);
      }
    }
  });
  return { findings, allowed };
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_SEGMENTS.has(name)) continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) yield* walk(full);
    else if (CODE_EXT.has(extname(name))) yield full;
  }
}

export function scanRepo(repo = REPO) {
  const findings = [];
  const allowed = [];
  let files = 0;
  for (const root of SCAN_ROOTS) {
    for (const file of walk(join(repo, root))) {
      files += 1;
      const rel = relative(repo, file).split(sep).join("/");
      const result = scanText(readFileSync(file, "utf8"), rel);
      findings.push(...result.findings);
      allowed.push(...result.allowed);
    }
  }
  return { files, findings, allowed };
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]);

if (invokedDirectly) {
  const { files, findings, allowed } = scanRepo();
  for (const hit of allowed) {
    console.log(`allowed  ${hit.file}:${hit.line}  [${hit.rule}]  ${hit.text}`);
  }
  for (const hit of findings) {
    console.error(`FAIL     ${hit.file}:${hit.line}  [${hit.rule}] ${hit.message}\n         ${hit.text}`);
  }
  console.log(
    `no-fake-data check: ${files} files scanned, ${findings.length} finding(s), ${allowed.length} allowed exception(s).`,
  );
  process.exit(findings.length > 0 ? 1 : 0);
}
