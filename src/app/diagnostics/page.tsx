import type { Metadata } from "next";
import Link from "next/link";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";

export const metadata: Metadata = {
  title: "Troubleshooting | AyahClip",
  description: "Copy a privacy-safe AyahClip diagnostics report for troubleshooting imports, editing, and exports.",
  alternates: { canonical: "/diagnostics" },
  robots: { index: false, follow: false },
};

export default function DiagnosticsPage() {
  return (
    <main className="bg-mihrab-still min-h-[70vh]">
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-16 sm:pt-24">
        <header className="rise text-center">
          <p className="text-xs uppercase tracking-[0.32em] text-gold">Troubleshooting</p>
          <h1 className="font-display mt-5 text-[clamp(2.5rem,8vw,4.5rem)] leading-[1.05] text-parchment">A useful report, without your content</h1>
          <p className="mx-auto mt-6 max-w-[54ch] text-pretty text-base leading-relaxed text-[var(--muted)] sm:text-lg">
            AyahClip processes your media in the browser. This report helps identify compatibility problems while keeping the recitation and project itself private.
          </p>
        </header>

        <div className="rise mt-10" style={{ animationDelay: "80ms" }}>
          <DiagnosticsPanel />
        </div>

        <p className="mt-8 text-center text-sm text-[var(--muted)]">
          Need to restart cleanly?{" "}
          <Link href="/import" className="text-gold-soft underline-offset-4 hover:underline">Import another file</Link>
        </p>
      </div>
    </main>
  );
}
