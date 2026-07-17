import type { BoundaryDiagnostic } from "./forced-align";
import type { VerseTiming } from "./audio-import";

export type AlignmentMethod = "transcript" | "ctc" | "hybrid" | "pause";

export interface AlignmentReview {
  methodLabel: string;
  message: string;
  reviewVerseNumbers: number[];
}

function methodLabel(method: AlignmentMethod): string {
  return method === "transcript"
    ? "Transcript alignment"
    : method === "hybrid"
      ? "Hybrid transcript + acoustic alignment"
      : method === "ctc"
        ? "Acoustic alignment"
        : "Pause-based fallback";
}

/** Reconstruct the creator's pending review queue from saved timing metadata.
 * This keeps the safe-review workflow available after a project reload instead
 * of leaving only unexplained amber marks on the track. */
export function buildPersistedAlignmentReview(
  timings: readonly VerseTiming[],
): AlignmentReview | null {
  const pending = timings.filter((timing, index) =>
    index > 0 &&
    timing.alignmentReviewed !== true &&
    (timing.alignmentConfidence === "medium" || timing.alignmentConfidence === "low"),
  );
  if (pending.length === 0) return null;

  const methods = [...new Set(pending.map((timing) => timing.alignmentMethod).filter(Boolean))];
  const label = methods.length === 1
    ? methodLabel(methods[0]!)
    : "Saved alignment";
  const reviewVerseNumbers = [...new Set(pending.map((timing) => timing.verseNumber))];
  const count = reviewVerseNumbers.length;
  return {
    methodLabel: label,
    message: `${label}. Review ${count} saved ${count === 1 ? "boundary" : "boundaries"} marked in amber before export.`,
    reviewVerseNumbers,
  };
}

/** Reconcile a just-produced review report with durable creator corrections. */
export function alignmentReviewProgress(
  review: AlignmentReview,
  timings: readonly VerseTiming[],
): AlignmentReview {
  if (review.reviewVerseNumbers.length === 0) return review;
  const remaining = review.reviewVerseNumbers.filter((verseNumber) =>
    timings.some((timing) =>
      timing.verseNumber === verseNumber &&
      (timing.alignmentConfidence === "medium" || timing.alignmentConfidence === "low") &&
      timing.alignmentReviewed !== true,
    ),
  );
  if (remaining.length === 0) {
    return {
      ...review,
      message: `${review.methodLabel}. All flagged internal boundaries have been checked.`,
      reviewVerseNumbers: [],
    };
  }
  const count = remaining.length;
  return {
    ...review,
    message: `${review.methodLabel}. Review ${count} remaining ${count === 1 ? "boundary" : "boundaries"} marked in amber before export.`,
    reviewVerseNumbers: remaining,
  };
}

/** Turn low-level aligner diagnostics into honest, actionable editor copy. */
export function buildAlignmentReview(
  method: AlignmentMethod,
  diagnostics: readonly BoundaryDiagnostic[],
): AlignmentReview {
  const methodLabelText = methodLabel(method);
  // The first ayah start is the clip trim, not an internal verse boundary.
  const internal = diagnostics.slice(1);
  const reviewVerseNumbers = internal
    .filter((diagnostic) => diagnostic.confidence !== "high")
    .map((diagnostic) => diagnostic.verseNumber);

  if (method === "pause") {
    return {
      methodLabel: methodLabelText,
      message: `${methodLabelText}. Speech recognition could not produce a reliable path; review each cut by ear.`,
      reviewVerseNumbers: internal.map((diagnostic) => diagnostic.verseNumber),
    };
  }
  if (reviewVerseNumbers.length === 0) {
    return {
      methodLabel: methodLabelText,
      message: `${methodLabelText}. The independent timing methods agreed on every internal boundary.`,
      reviewVerseNumbers,
    };
  }
  const count = reviewVerseNumbers.length;
  return {
    methodLabel: methodLabelText,
    message: `${methodLabelText}. Review ${count} ${count === 1 ? "boundary" : "boundaries"} marked in amber before export.`,
    reviewVerseNumbers,
  };
}

/** Classify failures without blaming every ONNX, memory, or decode problem on networking. */
export function alignmentFailureMessage(error: unknown): string {
  const name = typeof error === "object" && error && "name" in error
    ? String((error as { name?: unknown }).name ?? "")
    : "";
  const raw = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");

  if (error instanceof Error && /Automatic Quran recognition is limited/i.test(error.message)) {
    return error.message;
  }
  if (name === "AbortError" || /abort|cancel/i.test(raw)) {
    return "Recognition was cancelled. No timing changes were applied.";
  }
  if (/out of memory|memory|allocation|array buffer|typed array|wasm memory/i.test(raw)) {
    return "This clip exceeded the browser's available memory while aligning. Trim it to a shorter passage, close memory-heavy tabs, and retry.";
  }
  if (/not supported|unsupported|webassembly|simd/i.test(raw)) {
    return "This browser could not run the local recognition engine. Try the latest Chrome or Edge, or use pause detection and adjust the cuts manually.";
  }
  if (/fetch|network|offline|404|403|model|onnx|runtime|session/i.test(raw)) {
    return "The recognition model could not load or run. Check your connection, retry once, or use pause detection while keeping your current edits.";
  }
  return "Alignment stopped unexpectedly. Your existing timing edits are unchanged; retry or use pause detection and fine-tune by ear.";
}
