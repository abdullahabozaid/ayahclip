"use client";

import Link from "next/link";
import { useEffect } from "react";
import { telemetryErrorCode, trackProductEvent } from "@/lib/telemetry";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    trackProductEvent("client_error", { errorCode: telemetryErrorCode(error) });
  }, [error]);

  return (
    <main className="bg-mihrab flex min-h-[70vh] items-center justify-center px-5 py-20">
      <section className="max-w-lg text-center">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-gold-soft">AyahClip paused safely</p>
        <h1 className="font-display mt-4 text-3xl text-parchment sm:text-4xl">This view could not finish loading</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--muted)]">Your browser-stored projects and source media have not been sent anywhere. Retry this view, or copy a privacy-safe diagnostics report if the problem returns.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className="btn-gold min-h-11 rounded-full px-6 text-sm">Try again</button>
          <Link href="/diagnostics" className="btn-ghost flex min-h-11 items-center rounded-full px-6 text-sm">Open diagnostics</Link>
        </div>
      </section>
    </main>
  );
}
