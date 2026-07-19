import type { Metadata } from "next";
import { BulkCreateWorkspace } from "@/components/bulk/BulkCreateWorkspace";

export const metadata: Metadata = {
  title: "Bulk Create",
  description: "Turn a permitted long-form recitation into verse-complete Quran clip drafts.",
  alternates: { canonical: "/bulk" },
};

export default function BulkCreatePage() {
  return <BulkCreateWorkspace />;
}
