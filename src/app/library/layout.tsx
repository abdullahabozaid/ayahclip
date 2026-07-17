import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your clip library",
  description: "Manage Quran clips stored in this browser.",
  alternates: { canonical: "/library" },
  robots: { index: false, follow: false },
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
