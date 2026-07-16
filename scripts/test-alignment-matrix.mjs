// Slow, real-audio release gate for hold-out voices and deterministic capture
// stressors. Run after `npm run benchmark:fixtures`; fixture audio stays ignored.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TSX = join(ROOT, "node_modules/.bin/tsx");
const EVALUATOR = join(ROOT, "scripts/evaluate-alignment.ts");
const FIXTURES = join(ROOT, "tmp/alignment-benchmark");

const cases = [
  { name: "Ghamadi natural", dir: "holdout-ghamadi", args: [], mean: 0.4, max: 0.8 },
  { name: "Ghamadi run-on", dir: "holdout-ghamadi", args: ["--trim-silence"], mean: 0.4, max: 0.8 },
  { name: "Hudhaify natural", dir: "holdout-hudhaify", args: [], mean: 0.4, max: 0.8 },
  { name: "Hudhaify run-on", dir: "holdout-hudhaify", args: ["--trim-silence"], mean: 0.4, max: 0.8 },
  { name: "Ayyoub natural", dir: "holdout-ayyoub", args: [], mean: 0.4, max: 0.8 },
  { name: "Ayyoub run-on", dir: "holdout-ayyoub", args: ["--trim-silence"], mean: 0.4, max: 0.8 },
  {
    name: "Hudhaify phone + background audio",
    dir: "holdout-hudhaify",
    args: ["--phone", "--music-snr", "12"],
    mean: 0.45,
    max: 0.9,
  },
  {
    name: "Ayyoub two-second intro retry",
    dir: "holdout-ayyoub",
    args: ["--intro-seconds", "2", "--recognition-offset", "2.289"],
    mean: 0.4,
    max: 0.8,
  },
];

let failed = 0;
for (const testCase of cases) {
  const source = join(FIXTURES, testCase.dir);
  if (!existsSync(source)) {
    throw new Error(`Missing ${source}. Run npm run benchmark:fixtures first.`);
  }
  const output = execFileSync(TSX, [EVALUATOR, source, ...testCase.args], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const result = JSON.parse(output);
  const passed =
    result.recognition.detectedRange === "1:1-7" &&
    result.recognition.detectionConfidence === "high" &&
    result.cutMeanAbsoluteErrorSeconds <= testCase.mean &&
    result.cutMaxAbsoluteErrorSeconds <= testCase.max;
  console.log(
    `${passed ? "✓" : "✗"} ${testCase.name}: ` +
    `mean ${result.cutMeanAbsoluteErrorSeconds.toFixed(3)}s, ` +
    `max ${result.cutMaxAbsoluteErrorSeconds.toFixed(3)}s, ` +
    `${result.recognition.detectedRange ?? "no detection"} ` +
    `(${result.recognition.detectionConfidence})`,
  );
  if (!passed) failed += 1;
}

if (failed) {
  console.error(`\n${failed} alignment matrix ${failed === 1 ? "case" : "cases"} failed.`);
  process.exitCode = 1;
} else {
  console.log(`\n${cases.length} real-audio alignment cases passed.`);
}
