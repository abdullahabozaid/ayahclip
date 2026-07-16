import type { Metadata, Viewport } from "next";
import {
  Amiri_Quran,
  Cinzel,
  Cormorant_Garamond,
  Lora,
  Marcellus,
  Outfit,
  Playfair_Display,
  Scheherazade_New,
} from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const marcellus = Marcellus({ weight: "400", subsets: ["latin"], variable: "--font-marcellus", display: "swap" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-cormorant", display: "swap" });
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel", display: "swap" });
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", display: "swap" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair", display: "swap" });
const amiriQuran = Amiri_Quran({
  weight: "400",
  subsets: ["arabic", "latin"],
  variable: "--font-amiri-quran",
  display: "swap",
});
const scheherazade = Scheherazade_New({
  weight: ["400", "500", "600", "700"],
  subsets: ["arabic", "latin"],
  variable: "--font-scheherazade",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://ayahclip.vercel.app"),
  applicationName: "AyahClip",
  title: {
    default: "AyahClip — Luminous Quran recitation clips",
    template: "%s · AyahClip",
  },
  description:
    "Craft polished Quran recitation clips for TikTok, Reels, and YouTube Shorts—entirely in your browser.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "AyahClip",
    title: "AyahClip — Luminous Quran recitation clips",
    description:
      "Select verses, shape the typography, arrange B-roll, and export a polished social video.",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "AyahClip — Luminous Quran recitation clips",
    description:
      "Select verses, shape the typography, arrange B-roll, and export a polished social video.",
  },
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
      className={`dark ${outfit.variable} ${marcellus.variable} ${cormorant.variable} ${cinzel.variable} ${lora.variable} ${playfair.variable} ${amiriQuran.variable} ${scheherazade.variable}`}
    >
      <body className="grain min-h-dvh text-parchment antialiased">
        <SiteNav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
