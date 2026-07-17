import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "Choose Quran verses",
    description: "Select the Quran verses to include in a private AyahClip editing project.",
    alternates: { canonical: `/surah/${id}` },
    robots: { index: false, follow: true },
  };
}

export default function SurahLayout({ children }: { children: React.ReactNode }) {
  return children;
}
