// Real-audio safety gate for isolated-ayah recognition. Unlike the alignment
// matrix, this checks every source MP3 independently so ambiguity and false
// auto-application cannot hide inside a longer, distinctive passage.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TSX = join(ROOT, "node_modules/.bin/tsx");
const EVALUATOR = join(ROOT, "scripts/evaluate-recognition-corpus.ts");
const FIXTURES = join(ROOT, "tmp/alignment-benchmark");

const fixtures = [
  "alafasy",
  "minshawi",
  "sudais",
  "husary",
  "basit-murattal",
  "holdout-ghamadi",
  "holdout-hudhaify",
  "holdout-ayyoub",
  "alafasy-baqarah-opening",
  "alafasy-long-ayah",
  "alafasy-mid-surah",
  "alafasy-repeated",
];

const totals = {
  cases: 0,
  exact: 0,
  top3: 0,
  candidates: 0,
  autoApplied: 0,
  falseAuto: 0,
};

for (const fixture of fixtures) {
  const source = join(FIXTURES, fixture);
  if (!existsSync(source)) {
    throw new Error(`Missing ${source}. Run npm run benchmark:fixtures first.`);
  }
  const output = execFileSync(TSX, [EVALUATOR, source], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  const result = JSON.parse(output);
  const { summary } = result;
  totals.cases += summary.cases;
  totals.exact += result.results.filter((item) => item.exact).length;
  totals.top3 += result.results.filter((item) => item.expectedInTop3).length;
  totals.candidates += result.results.filter((item) => item.expectedInCandidateSet).length;
  totals.autoApplied += summary.autoAppliedCases;
  totals.falseAuto += summary.falseAutoApplies;
  console.log(
    `${summary.falseAutoApplies === 0 ? "✓" : "✗"} ${fixture}: ` +
    `${summary.autoAppliedCases} auto-applied, ${summary.falseAutoApplies} false, ` +
    `${summary.candidateRangeRecall.toFixed(3)} candidate recall`,
  );
}

const aggregate = {
  cases: totals.cases,
  exactRangeAccuracy: totals.exact / totals.cases,
  top3RangeRecall: totals.top3 / totals.cases,
  candidateRangeRecall: totals.candidates / totals.cases,
  autoAppliedCases: totals.autoApplied,
  autoApplyPrecision: (totals.autoApplied - totals.falseAuto) / Math.max(1, totals.autoApplied),
  falseAutoApplies: totals.falseAuto,
};

console.log(
  `\n${aggregate.cases} isolated-ayah cases: ` +
  `${aggregate.autoAppliedCases} safe auto-applies, ` +
  `${aggregate.autoApplyPrecision.toFixed(3)} precision, ` +
  `${aggregate.candidateRangeRecall.toFixed(3)} candidate recall.`,
);

const failures = [
  aggregate.falseAutoApplies > 0
    ? `${aggregate.falseAutoApplies} false auto-applies`
    : null,
  aggregate.autoAppliedCases < 40
    ? `safe auto-apply coverage fell below 40 cases (${aggregate.autoAppliedCases})`
    : null,
  aggregate.candidateRangeRecall < 0.84
    ? `candidate recall fell below 0.840 (${aggregate.candidateRangeRecall.toFixed(3)})`
    : null,
].filter(Boolean);

if (failures.length > 0) {
  console.error(`Recognition matrix failed: ${failures.join("; ")}.`);
  process.exitCode = 1;
}
