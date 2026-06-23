"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = { href: string; label: string; match: (p: string) => boolean };

const LINKS: NavItem[] = [
  { href: "/", label: "Home", match: (p) => p === "/" },
  {
    href: "/browse",
    label: "Browse",
    match: (p) => p.startsWith("/browse") || p.startsWith("/surah"),
  },
  { href: "/library", label: "Library", match: (p) => p.startsWith("/library") },
  { href: "/styles", label: "Styles", match: (p) => p.startsWith("/styles") },
  { href: "/support", label: "Support", match: (p) => p.startsWith("/support") },
];

export function SiteNav() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const closeMenu = () => setOpen(false);

  // The studio is a focused, full-bleed editor — it has its own chrome.
  if (pathname.startsWith("/studio")) return null;

  return (
    <nav className="sticky top-0 z-40 border-b border-[var(--hairline-soft)] bg-[var(--ink)]/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-4">
        <Link
          href="/"
          onClick={closeMenu}
          className="font-display shrink-0 text-xl tracking-[0.12em] text-parchment"
        >
          Ayah<span className="text-gold">Clip</span>
        </Link>

        {/* Desktop: full inline row */}
        <div className="hidden items-center gap-1 sm:flex">
          {LINKS.map((l) => (
            <NavLink key={l.href} href={l.href} label={l.label} active={l.match(pathname)} />
          ))}
          <Link href="/browse" className="btn-gold ml-2 shrink-0 rounded-full px-4 py-2 text-sm">
            New clip
          </Link>
        </div>

        {/* Mobile: keep the primary CTA visible, tuck the rest behind a menu */}
        <div className="flex items-center gap-2 sm:hidden">
          <Link
            href="/browse"
            onClick={closeMenu}
            className="btn-gold shrink-0 rounded-full px-3.5 py-2 text-sm"
          >
            New clip
          </Link>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="btn-ghost flex h-10 w-10 items-center justify-center rounded-full"
          >
            <MenuGlyph open={open} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown panel */}
      {open && (
        <div className="border-t border-[var(--hairline-soft)] bg-[var(--ink)]/95 px-4 pb-4 pt-2 backdrop-blur-xl sm:hidden">
          <div className="flex flex-col gap-0.5">
            {LINKS.map((l) => {
              const active = l.match(pathname);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={closeMenu}
                  className={`rounded-xl px-4 py-3 text-base transition-colors ${
                    active
                      ? "bg-[rgba(201,162,75,0.08)] text-parchment"
                      : "text-[var(--muted)] hover:text-parchment"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
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
      className={`shrink-0 rounded-full px-3 py-2 text-sm transition-colors ${
        active ? "text-parchment" : "text-[var(--muted)] hover:text-parchment"
      }`}
    >
      {label}
    </Link>
  );
}

function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M3 7h18" />
          <path d="M3 12h18" />
          <path d="M3 17h18" />
        </>
      )}
    </svg>
  );
}
