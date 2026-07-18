import { writeFile } from "node:fs/promises";

import { resolveReciterVerseAudio } from "../src/lib/reciter-audio";
import { reciters } from "../src/lib/reciters";

const SAMPLE_AYAHS = [
  { surah: 1, ayah: 1 },
  { surah: 2, ayah: 255 },
  { surah: 55, ayah: 13 },
  { surah: 114, ayah: 6 },
] as const;

interface ProbeResult {
  reciterId: string;
  reciterName: string;
  sourceKey: string;
  reference: string;
  url: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  cors: string | null;
  elapsedMs: number;
  error?: string;
}

const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const timeoutMs = positiveInteger(process.env.RECITER_HEALTH_TIMEOUT_MS, 10_000);
const concurrency = positiveInteger(process.env.RECITER_HEALTH_CONCURRENCY, 8);

async function probe(reciter: (typeof reciters)[number], surah: number, ayah: number): Promise<ProbeResult> {
  const resolved = resolveReciterVerseAudio(reciter, surah, ayah);
  const started = performance.now();
  try {
    const response = await fetch(resolved.url, {
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type");
    const cors = response.headers.get("access-control-allow-origin");
    await response.body?.cancel();
    return {
      reciterId: reciter.id,
      reciterName: reciter.name,
      sourceKey: resolved.sourceKey,
      reference: `${surah}:${ayah}`,
      url: resolved.url,
      ok: response.ok && contentType?.startsWith("audio/") === true && cors === "*",
      status: response.status,
      contentType,
      cors,
      elapsedMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      reciterId: reciter.id,
      reciterName: reciter.name,
      sourceKey: resolved.sourceKey,
      reference: `${surah}:${ayah}`,
      url: resolved.url,
      ok: false,
      status: null,
      contentType: null,
      cors: null,
      elapsedMs: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const jobs = reciters.flatMap((reciter) =>
    SAMPLE_AYAHS.map(({ surah, ayah }) => () => probe(reciter, surah, ayah))
  );
  const results: ProbeResult[] = [];

  for (let index = 0; index < jobs.length; index += concurrency) {
    results.push(...(await Promise.all(jobs.slice(index, index + concurrency).map((job) => job()))));
  }

  const failures = results.filter((result) => !result.ok);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    catalogSize: reciters.length,
    samplesPerReciter: SAMPLE_AYAHS.length,
    checks: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    healthy: failures.length === 0,
    results,
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;

  if (outputPath) await writeFile(outputPath, json, "utf8");
  else process.stdout.write(json);

  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
