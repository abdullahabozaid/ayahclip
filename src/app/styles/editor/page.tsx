import type { Metadata } from "next";
import { TemplateStudio } from "@/components/templates/TemplateStudio";

export const metadata: Metadata = {
  title: "Template Studio",
  description: "Create a reusable Quran clip composition on a focused phone canvas.",
};

export default async function TemplateEditorPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[] }>;
}) {
  const params = await searchParams;
  const template = typeof params.template === "string" ? params.template : "new";
  return <TemplateStudio initialTemplateId={template} />;
}
