"use client";

type InlineActionPromptProps = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  busy?: boolean;
};

/**
 * A deliberately non-modal safeguard for destructive actions. It keeps the
 * affected content visible, preserves context, and avoids browser-native UI.
 */
export function InlineActionPrompt({
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
}: InlineActionPromptProps) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-4 rounded-2xl border border-red-400/25 bg-red-500/[0.075] px-4 py-4 sm:flex-row sm:items-center"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-100">{title}</p>
        <p className="mt-1 text-xs leading-5 text-red-100/65">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded-full border border-white/10 px-4 text-sm text-parchment transition-colors hover:border-white/20 hover:bg-white/[0.04] disabled:opacity-50"
        >
          Keep it
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="min-h-11 rounded-full border border-red-300/30 bg-red-500/15 px-4 text-sm font-medium text-red-100 transition-colors hover:bg-red-500/25 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "Removing…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

