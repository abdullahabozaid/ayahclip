import type { Metadata } from "next";
import Link from "next/link";
import { NewClipLink } from "@/components/NewClipLink";

export const metadata: Metadata = {
  title: "Thank you — AyahClip",
  description: "Thank you for supporting AyahClip.",
  alternates: { canonical: "/support/thanks" },
  robots: { index: false, follow: false },
};

export default function ThanksPage() {
  return (
    <main className="bg-mihrab-still flex min-h-[70vh] items-center justify-center px-5 py-20">
      <div className="rise mx-auto max-w-lg text-center">
        <p
          dir="rtl"
          lang="ar"
          className="font-arabic text-[clamp(2.25rem,7vw,3.5rem)] leading-tight text-gold-soft"
        >
          جَزَاكَ اللهُ خَيْرًا
        </p>
        <h1 className="font-display mt-6 text-3xl text-parchment sm:text-4xl">
          Thank you for your support
        </h1>
        <p className="mx-auto mt-5 max-w-[44ch] text-base leading-relaxed text-[var(--muted)]">
          Your generosity keeps AyahClip free and funds what comes next,
          insha&rsquo;Allah. May Allah accept it from you and reward you abundantly.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <NewClipLink href="/browse" className="btn-gold rounded-full px-6 py-3 text-sm">
            Make a clip
          </NewClipLink>
          <Link href="/" className="btn-ghost rounded-full px-6 py-3 text-sm">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
