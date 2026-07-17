import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description: "Plain-language terms for using AyahClip to create Quran recitation clips.",
};

const terms = [
  {
    number: "01",
    title: "Use content you are allowed to use",
    body: "You are responsible for the audio, video, images, fonts and other material you import or publish. Use your own work, public-domain material, or content whose licence and creator permission allow your intended use. Stock assets and reciter recordings may carry their own terms and attribution requirements.",
  },
  {
    number: "02",
    title: "Confirm every Quran range and final clip",
    body: "Recognition and alignment are editing assistance, not an authority on Quran text or recitation. AyahClip requires creator confirmation because similar passages, speech, noise and recording conditions can produce uncertain suggestions. Listen to the source, review the Arabic, translation, timings and final MP4 before publishing.",
  },
  {
    number: "03",
    title: "Respect the Quran and other people",
    body: "Do not use AyahClip to create deceptive, abusive, unlawful or disrespectful material. Do not impersonate a reciter, misattribute a voice, remove required attribution, or use another person’s recording for cloning, re-identification or synthetic voice generation without a lawful basis and clear permission.",
  },
  {
    number: "04",
    title: "The tool is provided as available",
    body: "Browser media support varies. Recognition, third-party sources, local storage and export can fail or become unavailable. Keep your original files and review exported files. AyahClip does not promise uninterrupted availability, perfect recognition, exact alignment, or compatibility with every device and social platform.",
  },
  {
    number: "05",
    title: "Your work remains yours",
    body: "AyahClip does not claim ownership of your imported media or finished clips. You remain responsible for the rights, accuracy and distribution of anything you create. Application code, branding and bundled assets remain subject to their respective licences.",
  },
  {
    number: "06",
    title: "Changes and responsible access",
    body: "These terms may change as the public product develops. Material changes will be reflected by the updated date on this page. Access may be limited where necessary to protect the service, its data sources, reciters, users or applicable rights.",
  },
] as const;

export default function TermsPage() {
  return (
    <main className="bg-mihrab-still min-h-[75vh]">
      <div className="mx-auto max-w-4xl px-5 pb-24 pt-14 sm:pt-20">
        <header className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-gold-soft">Terms</p>
          <h1 className="font-display mt-4 text-4xl leading-tight text-parchment sm:text-6xl">Create carefully. Publish responsibly.</h1>
          <p className="mt-5 max-w-[65ch] text-base leading-7 text-[var(--muted)]">These terms set the practical boundaries for using AyahClip. They are written to be read, especially where Quran accuracy and recording rights are concerned.</p>
          <p className="mt-3 text-xs text-[var(--muted-deep)]">Effective 17 July 2026</p>
        </header>

        <ol className="mt-14 divide-y divide-[var(--hairline-soft)] border-y border-[var(--hairline-soft)]">
          {terms.map((term) => (
            <li key={term.number} className="grid gap-3 py-8 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-6">
              <span className="pt-1 text-xs tabular-nums text-gold-soft/70">{term.number}</span>
              <div>
                <h2 className="font-display text-2xl text-parchment">{term.title}</h2>
                <p className="mt-3 max-w-[70ch] text-sm leading-7 text-[var(--muted)]">{term.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
          <Link href="/privacy" className="text-gold-soft underline-offset-4 hover:underline">Read the privacy policy</Link>
          <Link href="/diagnostics" className="text-[var(--muted)] underline-offset-4 hover:text-parchment hover:underline">Open troubleshooting diagnostics</Link>
        </div>
      </div>
    </main>
  );
}
