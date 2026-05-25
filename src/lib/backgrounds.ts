import { Background } from "@/types";

export const backgroundPresets: Background[] = [
  { type: "solid", value: "#0a0a0a", label: "Black" },
  { type: "solid", value: "#1a1a2e", label: "Dark Navy" },
  { type: "solid", value: "#16213e", label: "Deep Blue" },
  { type: "solid", value: "#1b2631", label: "Charcoal" },
  { type: "solid", value: "#0d1117", label: "GitHub Dark" },
  { type: "gradient", value: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)", label: "Night Sky" },
  { type: "gradient", value: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)", label: "Deep Ocean" },
  { type: "gradient", value: "linear-gradient(180deg, #0a0a0a 0%, #2d1b69 100%)", label: "Purple Night" },
  { type: "gradient", value: "linear-gradient(135deg, #0a3d0a 0%, #0a0a0a 100%)", label: "Forest Dark" },
  { type: "gradient", value: "linear-gradient(135deg, #1a0a0a 0%, #3d1a1a 100%)", label: "Warm Dark" },
  { type: "image", value: "/backgrounds/mosque-silhouette.svg", label: "Mosque Silhouette" },
  { type: "image", value: "/backgrounds/desert-dunes.svg", label: "Desert Dunes" },
  { type: "image", value: "/backgrounds/night-stars.svg", label: "Night Stars" },
  { type: "image", value: "/backgrounds/lanterns.svg", label: "Lanterns" },
  { type: "image", value: "/backgrounds/geometric-pattern.svg", label: "Geometric" },
];
