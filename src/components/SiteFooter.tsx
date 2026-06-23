"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const CREDITS: { label: string; href: string }[] = [
  { label: "Quran text & translations: Quran.com", href: "https://quran.com" },
  { label: "Reciter audio: EveryAyah.com", href: "https://everyayah.com" },
  { label: "Stock media: Pexels", href: "https://www.pexels.com" },
  {
    label: "Arabic speech recognition: FastConformer (CC-BY-4.0)",
    href: "https://creativecommons.org/licenses/by/4.0/",
  },
];

export function SiteFooter() {
  const pathname = usePathname();
  // The studio is a focused, full-bleed editor — no footer chrome there.
  if (pathname?.startsWith("/studio")) return null;

  return (
    <footer className="mt-16 border-t border-[var(--hairline-soft)] px-5 py-8 text-center">
      <p className="text-sm text-[var(--muted)]">
        AyahClip is free.{" "}
        <Link
          href="/support"
          className="text-gold underline-offset-4 transition-colors hover:text-gold-soft hover:underline"
        >
          Support its development
        </Link>{" "}
        and help fund future projects, insha&rsquo;Allah.
      </p>
      <div className="gold-rule mx-auto my-6 max-w-[12rem]" />
      <p className="text-xs text-[var(--muted-deep)]">
        AyahClip is a personal tool for crafting Quran recitation clips. Please
        respect the source licenses below when sharing your clips.
      </p>
      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--muted)]">
        {CREDITS.map((c) => (
          <li key={c.href}>
            <a
              href={c.href}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-parchment"
            >
              {c.label}
            </a>
          </li>
        ))}
      </ul>
    </footer>
  );
}
