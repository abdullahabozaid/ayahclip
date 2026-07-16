import type { Metadata } from "next";
import { TemplateGallery } from "@/components/templates/TemplateGallery";

export const metadata: Metadata = {
  title: "Templates",
  description: "Choose or create a reusable Quran clip composition.",
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const params = await searchParams;
  return <TemplateGallery fromImport={params.from === "import"} />;
}
