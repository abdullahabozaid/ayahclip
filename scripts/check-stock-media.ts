import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { STOCK_IMAGES } from "../src/lib/stock-library";
import { VIDEO_PRESETS } from "../src/lib/video-presets";
import {
  type ReviewManifest,
  type RuntimeMedia,
  validateStockMedia,
} from "./stock-media-review-validation";

interface NetworkProbe {
  key: string;
  url: string;
  status: number;
  contentType: string | null;
  contentLength: number | null;
  cors: string | null;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function key(kind: "photo" | "video", runtimeId: string) {
  return `${kind}:${runtimeId}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  return {
    network: args.includes("--network"),
    output: outputIndex >= 0 ? args[outputIndex + 1] : undefined,
  };
}

function loadManifest(): ReviewManifest {
  const path = resolve(process.cwd(), "data/stock-media-review.json");
  return JSON.parse(readFileSync(path, "utf8")) as ReviewManifest;
}

async function probeMedia(
  mediaKey: string,
  url: string,
  expectedType: "image/" | "video/",
  expectedBytes?: number,
): Promise<NetworkProbe> {
  const response = await fetch(url, { method: "HEAD", redirect: "follow" });
  const contentType = response.headers.get("content-type");
  const length = Number(response.headers.get("content-length"));
  const cors = response.headers.get("access-control-allow-origin");
  invariant(response.ok, `${mediaKey} returned HTTP ${response.status}.`);
  invariant(contentType?.startsWith(expectedType), `${mediaKey} returned unexpected content type ${contentType ?? "none"}.`);
  invariant(cors === "*", `${mediaKey} no longer allows browser-safe cross-origin loading.`);
  if (expectedBytes != null) {
    invariant(length === expectedBytes, `${mediaKey} byte size changed from ${expectedBytes} to ${Number.isFinite(length) ? length : "unknown"}; review the new rendition before admission.`);
  }
  return {
    key: mediaKey,
    url,
    status: response.status,
    contentType,
    contentLength: Number.isFinite(length) && length > 0 ? length : null,
    cors,
  };
}

async function runNetworkChecks(): Promise<NetworkProbe[]> {
  const jobs = [
    ...STOCK_IMAGES.map((item) => () => probeMedia(key("photo", item.id), item.thumbUrl, "image/")),
    ...VIDEO_PRESETS.map((item) => () => probeMedia(key("video", item.id), item.videoUrl, "video/", item.fileSizeBytes)),
  ];
  const results: NetworkProbe[] = [];
  for (let index = 0; index < jobs.length; index += 6) {
    results.push(...await Promise.all(jobs.slice(index, index + 6).map((job) => job())));
  }
  return results;
}

async function main() {
  const options = parseArgs();
  const manifest = loadManifest();
  const runtime: RuntimeMedia[] = [
    ...STOCK_IMAGES.map((item) => ({
      kind: "photo" as const,
      runtimeId: item.id,
      sourceId: item.sourceId,
      sourcePageUrl: item.sourcePageUrl,
      peopleFree: item.peopleFree,
    })),
    ...VIDEO_PRESETS.map((item) => ({
      kind: "video" as const,
      runtimeId: item.id,
      sourceId: item.sourceId,
      sourcePageUrl: item.sourcePageUrl,
      peopleFree: item.peopleFree,
      fileSizeBytes: item.fileSizeBytes,
      tags: item.tags,
    })),
  ];

  const validation = validateStockMedia(manifest, runtime);

  const network = options.network ? await runNetworkChecks() : [];
  const report = {
    status: "ok",
    policyVersion: manifest.policyVersion,
    reviewedPhotos: STOCK_IMAGES.length,
    reviewedVideos: VIDEO_PRESETS.length,
    rejectedCandidates: manifest.rejected.length,
    sampleFractions: manifest.videoSampleFractions,
    maximumVideoBytes: manifest.maximumVideoBytes,
    largestVideoBytes: Math.max(...VIDEO_PRESETS.map((item) => item.fileSizeBytes)),
    coveredVideoTags: validation.coveredVideoTags,
    networkChecked: options.network,
    network,
  };

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) writeFileSync(resolve(process.cwd(), options.output), serialized);
  process.stdout.write(serialized);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
