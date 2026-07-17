export const RECOGNITION_STAGES = [
  { id: "prepare", label: "Prepare" },
  { id: "listen", label: "Listen" },
  { id: "match", label: "Match" },
  { id: "align", label: "Align" },
] as const;

export type RecognitionStage = (typeof RECOGNITION_STAGES)[number]["id"];

export interface RecognitionProgress {
  stage: RecognitionStage;
  detail: string;
  percent?: number;
  loadedBytes?: number;
  totalBytes?: number;
}

/** Keep the primary action honest about the work currently happening. */
export function recognitionActionLabel(
  detecting: boolean,
  progress: RecognitionProgress | null,
  hasResult: boolean,
): string {
  if (!detecting) return hasResult ? "Run again" : "Recognise verses";
  if (/cancell?ing/i.test(progress?.detail ?? "")) return "Cancelling…";
  if (progress?.stage === "listen") return "Listening…";
  if (progress?.stage === "match") return "Matching…";
  if (progress?.stage === "align") return "Aligning…";
  return "Preparing…";
}
