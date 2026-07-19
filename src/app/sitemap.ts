import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ayahclip.com";

const pages = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/browse", changeFrequency: "monthly", priority: 0.8 },
  { path: "/import", changeFrequency: "monthly", priority: 0.9 },
  { path: "/bulk", changeFrequency: "monthly", priority: 0.9 },
  { path: "/styles", changeFrequency: "monthly", priority: 0.8 },
  { path: "/support", changeFrequency: "yearly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return pages.map(({ path, changeFrequency, priority }) => ({
    url: `${siteUrl}${path}`,
    changeFrequency,
    priority,
  }));
}
