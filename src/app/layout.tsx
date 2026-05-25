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
      <body className="min-h-screen bg-[#0a0a0a] text-white antialiased">
        {children}
      </body>
    </html>
  );
}
