import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AyahClip",
  description: "Create beautiful Quran recitation clips for social media",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Scheherazade+New:wght@400;700&family=Noto+Naskh+Arabic:wght@400;700&family=Reem+Kufi:wght@400;700&family=Aref+Ruqaa:wght@400;700&family=Lateef:wght@400;700&family=Cinzel:wght@400;700&family=Lora:wght@400;700&family=Playfair+Display:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-[#0a0a0a] text-white antialiased">
        <nav className="border-b border-white/10 px-4 py-3">
          <div className="mx-auto flex max-w-5xl items-center justify-between">
            <a href="/" className="text-lg font-bold">
              AyahClip
            </a>
            <div className="flex gap-4">
              <a
                href="/browse"
                className="text-sm text-gray-400 transition-colors hover:text-white"
              >
                Browse Surahs
              </a>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
