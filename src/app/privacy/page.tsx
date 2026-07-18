import type { Metadata } from "next";
import Link from "next/link";
import { TelemetryPreference } from "@/components/TelemetryPreference";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How AyahClip keeps imported recitation media local and limits anonymous product diagnostics.",
  alternates: { canonical: "/privacy" },
};

const sections = [
  ["local", "Your media stays local"],
  ["diagnostics", "Anonymous diagnostics"],
  ["services", "Services AyahClip contacts"],
  ["storage", "Storage and deletion"],
  ["choices", "Your choices"],
] as const;

export default function PrivacyPage() {
  return (
    <main className="bg-mihrab-still min-h-[75vh]">
      <div className="mx-auto max-w-5xl px-5 pb-24 pt-14 sm:pt-20">
        <header className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-gold-soft">Privacy</p>
          <h1 className="font-display mt-4 text-4xl leading-tight text-parchment sm:text-6xl">Your recitation is not our data</h1>
          <p className="mt-5 max-w-[65ch] text-base leading-7 text-[var(--muted)]">
            AyahClip is built around local processing. Imported audio, video, recognition output and editable projects remain in your browser unless you deliberately share or download them.
          </p>
          <p className="mt-3 text-xs text-[var(--muted-deep)]">Last updated 18 July 2026</p>
        </header>

        <div className="mt-12 grid gap-10 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-16">
          <nav aria-label="Privacy sections" className="md:sticky md:top-28 md:self-start">
            <ol className="space-y-2 text-sm text-[var(--muted)]">
              {sections.map(([id, label], index) => (
                <li key={id}>
                  <a href={`#${id}`} className="flex min-h-10 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-white/[0.025] hover:text-parchment">
                    <span className="text-[10px] tabular-nums text-gold-soft/70">0{index + 1}</span>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="min-w-0 space-y-12 text-sm leading-7 text-[var(--muted)]">
            <section id="local" className="scroll-mt-28">
              <h2 className="font-display text-2xl text-parchment">Your media stays local</h2>
              <p className="mt-4">Audio extraction, Quran passage recognition, timeline editing and video rendering run in your browser. AyahClip does not upload your imported media, detected transcript, Quran text, translations, project names or file names to its diagnostics endpoint.</p>
              <p className="mt-3">Saved projects and rendered clips use browser storage on your device. A local desktop installation may also offer an explicit save-to-folder action. Choosing a share sheet, download or third-party stock asset is an action you control.</p>
            </section>

            <section id="diagnostics" className="scroll-mt-28">
              <h2 className="font-display text-2xl text-parchment">Anonymous diagnostics</h2>
              <p className="mt-4">To understand whether creators reach a successful export, AyahClip can record a small set of milestones such as source loaded, Quran range confirmed, template chosen, Studio opened and export succeeded or failed.</p>
              <p className="mt-3">Each browser session receives a random temporary journey identifier. Reports include only a coarse device class, browser family, duration band and fixed error category. They do not contain account identifiers, advertising identifiers, precise device details or free-form error messages. Request addresses may be held briefly in memory to limit abusive request bursts, but AyahClip does not add them to product-event records. AyahClip honours the browser Do Not Track setting.</p>
              <div className="mt-6"><TelemetryPreference /></div>
            </section>

            <section id="services" className="scroll-mt-28">
              <h2 className="font-display text-2xl text-parchment">Services AyahClip contacts</h2>
              <p className="mt-4">The app may request Quran text and translation data from Quran.com, reciter audio and timing data from EveryAyah or MP3Quran, optional stock media from Pexels, and application assets or recognition-model files from AyahClip hosting. Those providers receive ordinary network information such as an IP address when your browser contacts them.</p>
              <p className="mt-3">If server-assisted caption writing is configured, AyahClip sends the platform, tone, Surah name, verse reference, exact translation excerpt and selected reciter name to OpenAI. It does not send imported media, files or detected transcripts. Starting a donation sends the chosen amount and frequency to Stripe so Stripe can host the checkout.</p>
              <p className="mt-3">AyahClip is hosted on Vercel. Like most hosting providers, Vercel may process request metadata needed to deliver and protect the service. AyahClip does not add request IP addresses, raw user-agent strings or referrers to its product-event records.</p>
            </section>

            <section id="storage" className="scroll-mt-28">
              <h2 className="font-display text-2xl text-parchment">Storage and deletion</h2>
              <p className="mt-4">Projects, source blobs, templates and local library clips remain in browser storage until you delete them or clear the site&rsquo;s data. Removing a project from AyahClip removes its associated local project data. Files you already downloaded or shared must be removed from their destination separately.</p>
            </section>

            <section id="choices" className="scroll-mt-28">
              <h2 className="font-display text-2xl text-parchment">Your choices</h2>
              <p className="mt-4">You can turn anonymous diagnostics off above, enable Do Not Track, delete individual projects, or clear AyahClip&rsquo;s site data in your browser. The <Link href="/diagnostics" className="text-gold-soft underline-offset-4 hover:underline">troubleshooting report</Link> is created locally and is copied only when you press its button.</p>
              <p className="mt-3">Questions about this policy can be raised through the project&rsquo;s public support channel. Do not include recitation recordings or private project content unless you intentionally choose to share them.</p>
            </section>
          </article>
        </div>
      </div>
    </main>
  );
}
