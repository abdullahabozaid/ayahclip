export type MediaKind = "photo" | "video";

export interface ReviewEntry {
  kind: MediaKind;
  runtimeId: string;
  sourceId: number;
  reviewedAt: string;
  reviewMethod: "full-frame" | "sampled-frames";
  peopleVisible: boolean;
}

export interface RejectedEntry {
  kind: MediaKind;
  runtimeId: string;
  reason: string;
}

export interface ReviewManifest {
  policyVersion: number;
  reviewer: string;
  photoReviewMethod: string;
  videoReviewMethod: string;
  videoSampleFractions: number[];
  maximumVideoBytes: number;
  requiredVideoTags: string[];
  approved: ReviewEntry[];
  rejected: RejectedEntry[];
}

export interface RuntimeMedia {
  kind: MediaKind;
  runtimeId: string;
  sourceId: number;
  sourcePageUrl: string;
  peopleFree: true;
  fileSizeBytes?: number;
  tags?: readonly string[];
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function key(kind: MediaKind, runtimeId: string) {
  return `${kind}:${runtimeId}`;
}

export function validateStockMedia(manifest: ReviewManifest, runtime: RuntimeMedia[]) {
  invariant(manifest.policyVersion === 1, "Unsupported stock review policy version.");
  invariant(manifest.reviewer === "manual-editorial", "Stock review must remain an explicit manual editorial decision.");
  invariant(manifest.photoReviewMethod === "full-frame", "Photos must be reviewed as complete frames.");
  invariant(manifest.videoReviewMethod === "sampled-frames", "Videos must use sampled-frame review.");
  invariant(manifest.videoSampleFractions.length >= 6, "Video review must sample at least six positions.");
  invariant(manifest.videoSampleFractions[0] === 0, "Video review must include the opening frame.");
  invariant(manifest.videoSampleFractions.at(-1) === 1, "Video review must include the closing frame.");
  invariant(manifest.videoSampleFractions.every((value, index, values) =>
    value >= 0 && value <= 1 && (index === 0 || value > values[index - 1])
  ), "Video sample fractions must be unique, ordered, and bounded from zero to one.");
  invariant(manifest.maximumVideoBytes > 0, "A positive browser video-size ceiling is required.");
  invariant(Array.isArray(manifest.approved) && Array.isArray(manifest.rejected), "Review manifest lists are required.");

  const runtimeByKey = new Map(runtime.map((item) => [key(item.kind, item.runtimeId), item]));
  const approvedByKey = new Map(manifest.approved.map((item) => [key(item.kind, item.runtimeId), item]));
  invariant(runtimeByKey.size === runtime.length, "Runtime stock IDs must be unique within each media kind.");
  invariant(approvedByKey.size === manifest.approved.length, "Approved review records must be unique.");

  for (const item of runtime) {
    const itemKey = key(item.kind, item.runtimeId);
    const review = approvedByKey.get(itemKey);
    invariant(review, `${itemKey} is public but has no approved review record.`);
    invariant(review.sourceId === item.sourceId, `${itemKey} review source ID does not match runtime provenance.`);
    invariant(review.peopleVisible === false, `${itemKey} cannot ship because people were visible during review.`);
    invariant(/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt), `${itemKey} needs an ISO review date.`);
    invariant(review.reviewMethod === (item.kind === "photo" ? manifest.photoReviewMethod : manifest.videoReviewMethod), `${itemKey} used the wrong review method.`);
    invariant(item.peopleFree === true, `${itemKey} must retain the runtime people-free contract.`);
    const expectedPage = item.kind === "photo"
      ? `https://www.pexels.com/photo/${item.sourceId}/`
      : `https://www.pexels.com/video/${item.sourceId}/`;
    invariant(item.sourcePageUrl === expectedPage, `${itemKey} does not link to its exact Pexels source page.`);
  }

  for (const review of manifest.approved) {
    invariant(runtimeByKey.has(key(review.kind, review.runtimeId)), `${key(review.kind, review.runtimeId)} is approved but absent from the runtime catalog.`);
  }

  for (const rejected of manifest.rejected) {
    invariant(rejected.reason.trim().length >= 20, `${key(rejected.kind, rejected.runtimeId)} needs a specific rejection reason.`);
    invariant(!runtimeByKey.has(key(rejected.kind, rejected.runtimeId)), `${key(rejected.kind, rejected.runtimeId)} was rejected but is public.`);
  }

  const videos = runtime.filter((item) => item.kind === "video");
  invariant(videos.every((item) => typeof item.fileSizeBytes === "number" && item.fileSizeBytes <= manifest.maximumVideoBytes), "A public video exceeds the browser-size ceiling.");
  const videoTags = new Set(videos.flatMap((item) => item.tags ?? []));
  for (const requiredTag of manifest.requiredVideoTags) {
    invariant(videoTags.has(requiredTag), `The curated video catalog no longer covers ${requiredTag}.`);
  }

  return { coveredVideoTags: [...videoTags].sort() };
}
