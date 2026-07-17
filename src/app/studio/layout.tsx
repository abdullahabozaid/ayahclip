import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clip Studio",
  description: "Edit and export a private Quran recitation clip project.",
  alternates: { canonical: "/studio" },
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
