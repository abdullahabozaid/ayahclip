import type { Metadata } from "next";
import { SupportForm } from "@/components/SupportForm";

export const metadata: Metadata = {
  title: "Support AyahClip",
  description:
    "AyahClip is free, with no ads or paywalls. If it has helped you, you can support its development and future projects.",
  alternates: { canonical: "/support" },
};

const SUPPORT_GOES: { title: string; body: string }[] = [
  {
    title: "Running costs",
    body: "Servers, fonts, and the audio and translation data the app relies on.",
  },
  {
    title: "Future projects",
    body: "New tools for the Muslim community, built and given freely, insha'Allah.",
  },
  {
    title: "The creator's time",
    body: "A direct thank-you for the nights spent building and maintaining AyahClip.",
  },
];

export default function SupportPage() {
  return (
    <main className="bg-mihrab-still">
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-16 sm:pt-24">
        {/* Hero */}
        <header className="rise text-center">
          <p className="text-xs uppercase tracking-[0.32em] text-gold">
            Free, and staying that way
          </p>
          <h1 className="font-display mt-5 text-[clamp(2.75rem,8vw,4.75rem)] leading-[1.05] text-parchment">
            Support AyahClip
          </h1>
          <p className="mx-auto mt-6 max-w-[52ch] text-pretty text-lg leading-relaxed text-[var(--muted)]">
            AyahClip is free to use. No ads, no paywalls, no account, no limit on
            what you make. If it has helped you share the words of the Quran, you
            can support the work behind it.
          </p>
        </header>

        {/* Donation form */}
        <div className="rise mx-auto mt-12 max-w-md" style={{ animationDelay: "80ms" }}>
          <SupportForm />
        </div>

        {/* Where it goes */}
        <section className="rise mt-16" style={{ animationDelay: "160ms" }}>
          <div className="gold-rule mx-auto max-w-xs" />
          <h2 className="font-display mt-10 text-center text-2xl text-parchment">
            Where your support goes
          </h2>
          <ul className="mt-8 space-y-6">
            {SUPPORT_GOES.map((item) => (
              <li key={item.title} className="flex gap-4">
                <span
                  aria-hidden="true"
                  className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--emerald-soft)]"
                />
                <div>
                  <h3 className="text-base font-medium text-parchment">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
                    {item.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-center text-xs leading-relaxed text-[var(--muted-deep)]">
            This is a personal gift to support the creator, not a zakat or charity
            collection.
          </p>
        </section>

        {/* Closing */}
        <section className="rise mt-20 text-center" style={{ animationDelay: "240ms" }}>
          <p
            dir="rtl"
            lang="ar"
            className="font-arabic text-[clamp(2rem,6vw,3rem)] leading-tight text-gold-soft"
          >
            جَزَاكَ اللهُ خَيْرًا
          </p>
          <p className="mt-4 text-sm text-[var(--muted)]">
            May Allah reward you with good.
          </p>
        </section>
      </div>
    </main>
  );
}
