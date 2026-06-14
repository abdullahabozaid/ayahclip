import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "AyahClip — Luminous Quran recitation clips",
  description: "Craft beautiful Quran recitation clips for social media",
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
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Marcellus&family=Outfit:wght@300;400;500;600&family=Cormorant+Garamond:wght@400;500;600&family=Cinzel:wght@400;700&family=Lora:wght@400;700&family=Playfair+Display:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="grain min-h-dvh text-parchment antialiased">
        <SiteNav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
