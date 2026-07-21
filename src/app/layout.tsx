import type { Metadata, Viewport } from "next";
import {
  Amiri_Quran,
  Cinzel,
  Cormorant_Garamond,
  Lora,
  Marcellus,
  Noto_Naskh_Arabic,
  Outfit,
  Playfair_Display,
  Scheherazade_New,
} from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { ClientOperations } from "@/components/ClientOperations";
import { PreloadResources } from "@/components/PreloadResources";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const marcellus = Marcellus({ weight: "400", subsets: ["latin"], variable: "--font-marcellus", display: "swap" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-cormorant", display: "swap", preload: false });
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel", display: "swap", preload: false });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap", preload: false });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap", preload: false });
const amiriQuran = Amiri_Quran({
  weight: "400",
  subsets: ["arabic", "latin"],
  variable: "--font-amiri-quran",
  display: "swap",
  preload: false,
});
const scheherazade = Scheherazade_New({
  weight: ["400", "500", "600", "700"],
  subsets: ["arabic", "latin"],
  variable: "--font-scheherazade",
  display: "swap",
  preload: false,
});
const notoNaskh = Noto_Naskh_Arabic({
  weight: "variable",
  subsets: ["arabic", "latin"],
  variable: "--font-noto-naskh",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://ayahclip.com"),
  applicationName: "AyahClip",
  title: {
    default: "AyahClip — Make beautiful Quran clips",
    template: "%s · AyahClip",
  },
  description:
    "Make Quran recitation clips for TikTok, Reels, and YouTube Shorts—all in your browser.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "AyahClip",
    title: "AyahClip — Make beautiful Quran clips",
    description:
      "Select verses, shape the typography, arrange B-roll, and export a social video.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "AyahClip — Make beautiful Quran clips",
    description:
      "Select verses, shape the typography, arrange B-roll, and export a social video.",
  },
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

// viewport-fit=cover lets us pad around the notch / Dynamic Island via the
// env(safe-area-inset-*) values. themeColor blends the mobile browser chrome
// into the app's dark background.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08090d",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${outfit.variable} ${marcellus.variable} ${cormorant.variable} ${cinzel.variable} ${lora.variable} ${playfair.variable} ${amiriQuran.variable} ${scheherazade.variable} ${notoNaskh.variable}`}
    >
      <body className="grain min-h-dvh text-parchment antialiased">
        <a
          href="#main-content"
          className="sr-only z-[100] rounded-full bg-[var(--parchment)] px-5 py-3 text-sm font-medium text-[var(--ink)] focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-soft focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ink)]"
        >
          Skip to main content
        </a>
        <PreloadResources />
        <ClientOperations />
        <SiteNav />
        <div id="main-content" tabIndex={-1}>
          {children}
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
