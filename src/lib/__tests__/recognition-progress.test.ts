import { describe, expect, it } from "vitest";
import { recognitionActionLabel, type RecognitionProgress } from "../recognition-progress";

const progress = (stage: RecognitionProgress["stage"], detail = "Working") => ({ stage, detail });

describe("recognition action labels", () => {
  it("names every real recognition stage", () => {
    expect(recognitionActionLabel(true, progress("prepare"), false)).toBe("Preparing…");
    expect(recognitionActionLabel(true, progress("listen"), false)).toBe("Listening…");
    expect(recognitionActionLabel(true, progress("match"), false)).toBe("Matching…");
    expect(recognitionActionLabel(true, progress("align"), false)).toBe("Aligning…");
  });

  it("keeps cancellation and idle actions explicit", () => {
    expect(recognitionActionLabel(true, progress("listen", "Cancelling recognition"), false)).toBe("Cancelling…");
    expect(recognitionActionLabel(false, null, false)).toBe("Recognise verses");
    expect(recognitionActionLabel(false, null, true)).toBe("Run again");
  });
});
