import type { Metadata } from "next";
import { TemplateGallery } from "@/components/templates/TemplateGallery";

export const metadata: Metadata = {
  title: "Clip library",
  description: "Download ready-made Quran clips or open one in the studio to change the reciter, verses, B-roll, and more.",
  alternates: { canonical: "/styles" },
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[]; filter?: string | string[] }>;
}) {
  const params = await searchParams;
  return <TemplateGallery fromImport={params.from === "import"} initialFilter={params.filter === "mine" ? "mine" : "featured"} />;
}
