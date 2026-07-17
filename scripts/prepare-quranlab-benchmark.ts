import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  convertQuranLabBenchmark,
  type QuranCorpusReference,
  type QuranLabBenchmarkRow,
} from "./lib/quranlab-benchmark";

function flag(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith("--") ? value : null;
}

const datasetRoot = process.argv[2] && !process.argv[2].startsWith("--")
  ? resolve(process.argv[2])
  : null;
if (!datasetRoot) {
  throw new Error(
    "Usage: npm run benchmark:prepare-quranlab -- <downloaded-dataset-directory> [--source tlog_holdout] [--output ayahclip-manifest.jsonl]",
  );
}

const benchmarkPath = join(datasetRoot, "benchmark.jsonl");
if (!existsSync(benchmarkPath)) {
  throw new Error(`Missing ${benchmarkPath}. Download the gated Quran-Lab benchmark first.`);
}

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const corpus = JSON.parse(
  readFileSync(join(projectRoot, "public/quran-corpus.json"), "utf8"),
) as QuranCorpusReference[];
const input = readFileSync(benchmarkPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line) as QuranLabBenchmarkRow);
const source = flag("--source") ?? undefined;
const converted = convertQuranLabBenchmark(input, corpus, source);
if (converted.rows.length === 0) {
  throw new Error("No uniquely identifiable Quran cases were produced from the benchmark.");
}
for (const row of converted.rows) {
  const audioPath = resolve(datasetRoot, row.audio);
  if (!existsSync(audioPath)) throw new Error(`Referenced audio is missing: ${audioPath}`);
}

const outputPath = resolve(datasetRoot, flag("--output") ?? "ayahclip-manifest.jsonl");
writeFileSync(outputPath, `${converted.rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
console.log(JSON.stringify({
  input: benchmarkPath,
  output: outputPath,
  source: source ?? "all",
  cases: converted.rows.length,
  skippedAmbiguous: converted.skippedAmbiguous,
  skippedUnmatched: converted.skippedUnmatched,
  skippedInvalid: converted.skippedInvalid,
}, null, 2));
