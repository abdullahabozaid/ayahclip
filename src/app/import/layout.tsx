import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Import a recitation",
  description:
    "Import audio or video, detect the recited Quran verses locally, confirm the ayahs, and create a vertical clip.",
  alternates: { canonical: "/import" },
};

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
