import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AyahClip — Quran recitation clip editor",
    short_name: "AyahClip",
    description:
      "Craft polished Quran recitation clips for TikTok, Reels, and YouTube Shorts in your browser.",
    start_url: "/",
    display: "standalone",
    background_color: "#08090d",
    theme_color: "#08090d",
    categories: ["photo", "video", "utilities"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "16x16 32x32 48x48 256x256",
        type: "image/x-icon",
      },
    ],
  };
}
