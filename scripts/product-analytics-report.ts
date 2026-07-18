import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  analyzeProductEventJsonl,
  formatProductAnalyticsMarkdown,
} from "../src/lib/product-analytics";

interface Options {
  since: string;
  limit: number;
  format: "markdown" | "json";
  input?: string;
  output?: string;
}

function optionValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseOptions(): Options {
  const since = optionValue("--since") ?? "7d";
  const limit = Number(optionValue("--limit") ?? "10000");
  const format = optionValue("--format") ?? "markdown";
  if (!/^\d+[mhdw]$/.test(since)) {
    throw new Error("--since must be a relative duration such as 30m, 24h, or 7d");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100_000) {
    throw new Error("--limit must be an integer from 1 to 100000");
  }
  if (format !== "markdown" && format !== "json") {
    throw new Error("--format must be markdown or json");
  }
  return {
    since,
    limit,
    format,
    input: optionValue("--input"),
    output: optionValue("--output"),
  };
}

function fetchProductionLogs(options: Options): string {
  const result = spawnSync("vercel", [
    "logs",
    "--environment", "production",
    "--since", options.since,
    "--limit", String(options.limit),
    "--query", "ayahclip_product_event",
    "--json",
    "--no-branch",
  ], { encoding: "utf8", maxBuffer: 50 * 1_024 * 1_024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `vercel logs exited with ${result.status}`);
  }
  return result.stdout;
}

function main(): void {
  const options = parseOptions();
  const jsonl = options.input
    ? readFileSync(options.input, "utf8")
    : fetchProductionLogs(options);
  const report = analyzeProductEventJsonl(jsonl);
  const output = options.format === "json"
    ? `${JSON.stringify(report, null, 2)}\n`
    : formatProductAnalyticsMarkdown(report);
  if (options.output) writeFileSync(options.output, output, "utf8");
  else process.stdout.write(output);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
