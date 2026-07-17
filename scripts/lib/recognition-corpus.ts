export interface RecognitionCorpusResult {
  exact: boolean;
  expectedInTop3: boolean;
  expectedInCandidateSet: boolean;
  autoApplied: boolean;
  falseAutoApply: boolean;
  confidence: "high" | "medium" | "low";
  characterErrorRate: number;
  tags: string[];
  license: string | null;
}

export interface RecognitionMetrics {
  cases: number;
  exactRangeAccuracy: number;
  top3RangeRecall: number;
  candidateRangeRecall: number;
  autoAppliedCases: number;
  autoApplyPrecision: number;
  falseAutoApplies: number;
  lowConfidenceCases: number;
  meanCharacterErrorRate: number;
}

export interface RecognitionCorpusSummary extends RecognitionMetrics {
  casesWithLicenseMetadata: number;
  tagCoverage: Record<string, RecognitionMetrics>;
}

export interface RecognitionGateOptions {
  minCases?: number;
  minExact?: number;
  minTop3?: number;
  minCandidateRecall?: number;
  minAutoApplies?: number;
  minAutoPrecision?: number;
  maxFalseAuto?: number;
  requiredTags?: string[];
  minCasesPerRequiredTag?: number;
  minRequiredTagCandidateRecall?: number;
  maxRequiredTagFalseAuto?: number;
  requireLicenseMetadata?: boolean;
}

const rounded = (value: number) => Number(value.toFixed(3));

export function parseRecognitionTags(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [...new Set(raw
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase().replace(/[\s_]+/g, "-"))
    .filter(Boolean))].sort();
}

function metrics(results: readonly RecognitionCorpusResult[]): RecognitionMetrics {
  const autoApplied = results.filter((result) => result.autoApplied);
  const falseAuto = results.filter((result) => result.falseAutoApply).length;
  return {
    cases: results.length,
    exactRangeAccuracy: rounded(results.filter((result) => result.exact).length / Math.max(1, results.length)),
    top3RangeRecall: rounded(results.filter((result) => result.expectedInTop3).length / Math.max(1, results.length)),
    candidateRangeRecall: rounded(results.filter((result) => result.expectedInCandidateSet).length / Math.max(1, results.length)),
    autoAppliedCases: autoApplied.length,
    autoApplyPrecision: rounded((autoApplied.length - falseAuto) / Math.max(1, autoApplied.length)),
    falseAutoApplies: falseAuto,
    lowConfidenceCases: results.filter((result) => result.confidence === "low").length,
    meanCharacterErrorRate: rounded(
      results.reduce((sum, result) => sum + result.characterErrorRate, 0) / Math.max(1, results.length),
    ),
  };
}

export function summarizeRecognitionCorpus(
  results: readonly RecognitionCorpusResult[],
): RecognitionCorpusSummary {
  const tags = [...new Set(results.flatMap((result) => result.tags))].sort();
  return {
    ...metrics(results),
    casesWithLicenseMetadata: results.filter((result) => Boolean(result.license)).length,
    tagCoverage: Object.fromEntries(tags.map((tag) => [
      tag,
      metrics(results.filter((result) => result.tags.includes(tag))),
    ])),
  };
}

export function recognitionGateFailures(
  summary: RecognitionCorpusSummary,
  options: RecognitionGateOptions,
): string[] {
  const failures: string[] = [];
  if (options.minCases !== undefined && summary.cases < options.minCases) {
    failures.push(`cases ${summary.cases} < ${options.minCases}`);
  }
  if (options.minExact !== undefined && summary.exactRangeAccuracy < options.minExact) {
    failures.push(`exact range accuracy ${summary.exactRangeAccuracy} < ${options.minExact}`);
  }
  if (options.minTop3 !== undefined && summary.top3RangeRecall < options.minTop3) {
    failures.push(`top-3 recall ${summary.top3RangeRecall} < ${options.minTop3}`);
  }
  if (options.minCandidateRecall !== undefined && summary.candidateRangeRecall < options.minCandidateRecall) {
    failures.push(`candidate recall ${summary.candidateRangeRecall} < ${options.minCandidateRecall}`);
  }
  if (options.minAutoApplies !== undefined && summary.autoAppliedCases < options.minAutoApplies) {
    failures.push(`auto-applied cases ${summary.autoAppliedCases} < ${options.minAutoApplies}`);
  }
  if (options.minAutoPrecision !== undefined && summary.autoApplyPrecision < options.minAutoPrecision) {
    failures.push(`auto-apply precision ${summary.autoApplyPrecision} < ${options.minAutoPrecision}`);
  }
  if (options.maxFalseAuto !== undefined && summary.falseAutoApplies > options.maxFalseAuto) {
    failures.push(`false auto-applies ${summary.falseAutoApplies} > ${options.maxFalseAuto}`);
  }
  for (const tag of options.requiredTags ?? []) {
    const tagMetrics = summary.tagCoverage[tag];
    if (!tagMetrics?.cases) {
      failures.push(`required tag “${tag}” has no cases`);
      continue;
    }
    if (options.minCasesPerRequiredTag !== undefined && tagMetrics.cases < options.minCasesPerRequiredTag) {
      failures.push(`tag “${tag}” cases ${tagMetrics.cases} < ${options.minCasesPerRequiredTag}`);
    }
    if (
      options.minRequiredTagCandidateRecall !== undefined &&
      tagMetrics.candidateRangeRecall < options.minRequiredTagCandidateRecall
    ) {
      failures.push(`tag “${tag}” candidate recall ${tagMetrics.candidateRangeRecall} < ${options.minRequiredTagCandidateRecall}`);
    }
    if (
      options.maxRequiredTagFalseAuto !== undefined &&
      tagMetrics.falseAutoApplies > options.maxRequiredTagFalseAuto
    ) {
      failures.push(`tag “${tag}” false auto-applies ${tagMetrics.falseAutoApplies} > ${options.maxRequiredTagFalseAuto}`);
    }
  }
  if (options.requireLicenseMetadata && summary.casesWithLicenseMetadata !== summary.cases) {
    failures.push(`license metadata present for ${summary.casesWithLicenseMetadata}/${summary.cases} cases`);
  }
  return failures;
}
