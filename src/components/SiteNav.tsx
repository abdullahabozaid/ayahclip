"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNav() {
  const pathname = usePathname();

  // The studio is a focused, full-bleed editor — it has its own chrome.
  if (pathname?.startsWith("/studio")) return null;

  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--hairline-soft)] bg-[var(--ink)]/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="font-display text-xl tracking-[0.12em] text-parchment">
          Ayah<span className="text-gold">Clip</span>
        </Link>

        <div className="flex items-center gap-1">
          <NavLink href="/" label="Home" active={pathname === "/"} />
          <NavLink
            href="/browse"
            label="Browse"
            active={pathname?.startsWith("/browse") || pathname?.startsWith("/surah")}
          />
          <NavLink
            href="/library"
            label="Library"
            active={pathname?.startsWith("/library")}
          />
          <NavLink
            href="/styles"
            label="Styles"
            active={pathname?.startsWith("/styles")}
          />
          <Link
            href="/browse"
            className="btn-gold ml-2 rounded-full px-4 py-2 text-sm"
          >
            New clip
          </Link>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-2 text-sm transition-colors ${
        active
          ? "text-parchment"
          : "text-[var(--muted)] hover:text-parchment"
      }`}
    >
      {label}
    </Link>
  );
}
