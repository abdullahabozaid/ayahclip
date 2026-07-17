"use client";

import { useEffect, useState } from "react";
import { setTelemetryEnabled, telemetryEnabled } from "@/lib/telemetry";

export function TelemetryPreference() {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => setEnabled(telemetryEnabled()), []);

  return (
    <div className="flex flex-col gap-4 border-y border-[var(--hairline-soft)] py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-[58ch]">
        <h2 className="text-base font-medium text-parchment">Anonymous product diagnostics</h2>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
          Share coarse workflow milestones and fixed error categories. Your media, Quran text, transcript, file names and project names are never included.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => {
          const next = !enabled;
          setTelemetryEnabled(next);
          setEnabled(next);
        }}
        className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium transition-colors ${
          enabled
            ? "border-gold/45 bg-gold/[0.09] text-gold-soft"
            : "border-[var(--hairline)] text-[var(--muted)] hover:text-parchment"
        }`}
      >
        {enabled ? "Sharing is on" : "Sharing is off"}
      </button>
    </div>
  );
}
