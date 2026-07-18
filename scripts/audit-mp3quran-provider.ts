import { writeFile } from "node:fs/promises";

const API_BASE = "https://mp3quran.net/api/v3";
const DEFAULT_READ_ID = 245; // Mansour Al-Salemi, complete Hafs Murattal.
const EXPECTED_SURAH_COUNT = 114;

const SAMPLE_AYAHS = [
  { surah: 1, ayah: 1, expectedAyahs: 7 },
  { surah: 2, ayah: 255, expectedAyahs: 286 },
  { surah: 55, ayah: 13, expectedAyahs: 78 },
  { surah: 114, ayah: 6, expectedAyahs: 6 },
] as const;

interface TimedRead {
  id: number;
  name: string;
  rewaya: string;
  folder_url: string;
  soar_count: number;
}

interface CatalogMoshaf {
  id: number;
  name: string;
  server: string;
  surah_total: number;
  surah_list: string;
}

interface CatalogReciter {
  id: number;
  name: string;
  moshaf: CatalogMoshaf[];
}

interface Cue {
  ayah: number;
  start_time: number;
  end_time: number;
}

interface TimedSurah {
  id: number;
  name: string;
  timing_link: string;
}

const outputIndex = process.argv.indexOf("--output");
const outputPath = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
const readIndex = process.argv.indexOf("--read");
const requestedReadId = Number(readIndex >= 0 ? process.argv[readIndex + 1] : DEFAULT_READ_ID);
const timeoutMs = Number(process.env.RECITER_HEALTH_TIMEOUT_MS ?? 10_000);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function chapterUrl(server: string, surah: number): string {
  return `${server}${String(surah).padStart(3, "0")}.mp3`;
}

async function probeAudio(url: string) {
  const started = performance.now();
  const response = await fetch(url, {
    headers: { Range: "bytes=0-0" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  const contentRange = response.headers.get("content-range");
  const rangeSupported =
    response.status === 206 && contentRange?.startsWith("bytes 0-0/") === true;
  const result = {
    url,
    ok:
      rangeSupported &&
      response.headers.get("content-type")?.startsWith("audio/") === true &&
      response.headers.get("access-control-allow-origin") === "*",
    status: response.status,
    contentType: response.headers.get("content-type"),
    cors: response.headers.get("access-control-allow-origin"),
    acceptRanges: response.headers.get("accept-ranges"),
    contentRange,
    rangeSupported,
    elapsedMs: Math.round(performance.now() - started),
  };
  await response.body?.cancel();
  return result;
}

async function main(): Promise<void> {
  invariant(Number.isInteger(requestedReadId) && requestedReadId > 0, "--read must be a positive integer");

  const [timedReads, catalog] = await Promise.all([
    fetchJson<TimedRead[]>(`${API_BASE}/ayat_timing/reads`),
    fetchJson<{ reciters: CatalogReciter[] }>(`${API_BASE}/reciters?language=eng`),
  ]);
  const timedIds = new Set(timedReads.map((read) => read.id));
  const completeTimedHafs = catalog.reciters.flatMap((reciter) =>
    reciter.moshaf
      .filter(
        (moshaf) =>
          moshaf.surah_total === EXPECTED_SURAH_COUNT &&
          /Hafs/i.test(moshaf.name) &&
          timedIds.has(moshaf.id)
      )
      .map((moshaf) => ({ reciterId: reciter.id, reciterName: reciter.name, ...moshaf }))
  );

  const timedRead = timedReads.find((read) => read.id === requestedReadId);
  const catalogRead = completeTimedHafs.find((read) => read.id === requestedReadId);
  invariant(timedRead, `Read ${requestedReadId} is absent from the timing catalog`);
  invariant(catalogRead, `Read ${requestedReadId} is not a complete 114-Surah Hafs recording`);

  const timedSurahs = await fetchJson<TimedSurah[]>(
    `${API_BASE}/ayat_timing/soar?read=${requestedReadId}`
  );
  const timedSurahIds = new Set(timedSurahs.map((surah) => surah.id));
  const missingSurahs = Array.from({ length: EXPECTED_SURAH_COUNT }, (_, index) => index + 1)
    .filter((surah) => !timedSurahIds.has(surah));

  const samples = await Promise.all(
    SAMPLE_AYAHS.map(async ({ surah, ayah, expectedAyahs }) => {
      const cues = await fetchJson<Cue[]>(
        `${API_BASE}/ayat_timing?surah=${surah}&read=${requestedReadId}`
      );
      const cue = cues.find((item) => item.ayah === ayah);
      const numberedCues = cues.filter((item) => item.ayah >= 1);
      const audio = await probeAudio(chapterUrl(catalogRead.server, surah));
      const cueCoverageOk =
        numberedCues.length === expectedAyahs &&
        Math.min(...numberedCues.map((item) => item.ayah)) === 1 &&
        Math.max(...numberedCues.map((item) => item.ayah)) === expectedAyahs;
      return {
        reference: `${surah}:${ayah}`,
        cue: cue ? { startMs: cue.start_time, endMs: cue.end_time } : null,
        cueCount: numberedCues.length,
        expectedCueCount: expectedAyahs,
        cueCoverageOk,
        audio,
        ok:
          cueCoverageOk &&
          cue != null &&
          cue.start_time >= 0 &&
          cue.end_time > cue.start_time &&
          audio.ok,
      };
    })
  );

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    provider: "MP3Quran",
    authoritativeSources: {
      developerApi: "https://www.mp3quran.net/ar/api",
      usagePolicy: "https://www.mp3quran.net/privacy-en.html",
    },
    catalog: {
      timedReads: timedReads.length,
      completeTimedHafsReads: completeTimedHafs.length,
    },
    candidate: {
      readId: requestedReadId,
      name: catalogRead.reciterName,
      arabicName: timedRead.name,
      rewaya: timedRead.rewaya,
      server: catalogRead.server,
      advertisedSurahs: catalogRead.surah_total,
      timedSurahs: timedSurahIds.size,
      missingSurahs,
    },
    samples,
    gates: {
      completeChapterCoverage:
        catalogRead.surah_total === EXPECTED_SURAH_COUNT && missingSurahs.length === 0,
      representativeCueCoverage: samples.every((sample) => sample.cueCoverageOk),
      representativeCorsAndRanges: samples.every((sample) => sample.audio.ok),
      browserPreviewAndExport: false,
    },
    admission: {
      status: "provider-gates-passed",
      blockingReason:
        "This provider audit does not run a browser. Production admission additionally requires the exact-duration preview/export matrix.",
    },
  };
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, json, "utf8");
  else process.stdout.write(json);

  if (
    !report.gates.completeChapterCoverage ||
    !report.gates.representativeCueCoverage ||
    !report.gates.representativeCorsAndRanges
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
