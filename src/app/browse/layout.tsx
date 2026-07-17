import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse the Quran",
  description: "Choose a surah and verses to begin a polished Quran recitation clip.",
  alternates: { canonical: "/browse" },
};

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
