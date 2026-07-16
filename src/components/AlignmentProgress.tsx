"use client";

const ALIGNMENT_STAGES = [
  { id: "prepare", label: "Prepare" },
  { id: "listen", label: "Listen" },
  { id: "align", label: "Place cuts" },
] as const;

export type AlignmentStage = (typeof ALIGNMENT_STAGES)[number]["id"];

export interface LocalAlignmentProgress {
  stage: AlignmentStage;
  detail: string;
  percent?: number;
}

export function AlignmentProgress({
  progress,
  onCancel,
}: {
  progress: LocalAlignmentProgress;
  onCancel: () => void;
}) {
  const activeIndex = ALIGNMENT_STAGES.findIndex((stage) => stage.id === progress.stage);

  return (
    <div className="rounded-xl border border-[var(--hairline-soft)] bg-[var(--ink-deep)] px-4 py-3" aria-live="polite">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <ol className="grid grid-cols-3 gap-2" aria-label="Alignment stages">
            {ALIGNMENT_STAGES.map((stage, index) => {
              const complete = index < activeIndex;
              const active = index === activeIndex;
              return (
                <li key={stage.id} aria-current={active ? "step" : undefined}>
                  <span className={`block truncate text-[9px] font-semibold uppercase tracking-[0.12em] ${
                    complete
                      ? "text-emerald-soft"
                      : active
                        ? "text-gold-soft"
                        : "text-[var(--muted-deep)]"
                  }`}>
                    {index + 1}. {stage.label}
                  </span>
                  <span className={`mt-1.5 block h-1 rounded-full ${
                    complete ? "bg-emerald-soft" : active ? "bg-gold" : "bg-white/[0.08]"
                  }`} />
                </li>
              );
            })}
          </ol>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-[11px] text-parchment">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold motion-reduce:animate-none" aria-hidden="true" />
              {progress.detail}
            </p>
            {progress.percent !== undefined && (
              <span className="text-[10px] tabular-nums text-gold-soft">{progress.percent}%</span>
            )}
          </div>
          {progress.percent !== undefined && (
            <div
              role="progressbar"
              aria-label="Alignment model download"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percent}
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
            >
              <div
                className="h-full rounded-full bg-gold transition-[width] duration-200 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-[10px] text-[var(--muted-deep)]">
            Existing timeline edits stay unchanged until alignment completes.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost min-h-11 shrink-0 rounded-full px-3 text-[11px] sm:min-h-9"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
