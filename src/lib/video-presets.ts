export interface VideoPreset {
  id: string;
  name: string;
  category: "nature" | "islamic" | "abstract" | "night";
  videoUrl: string;
  thumbnailUrl: string;
}

export const VIDEO_PRESETS: VideoPreset[] = [
  { id: "rain", name: "Rain on Window", category: "nature", videoUrl: "/videos/presets/rain.mp4", thumbnailUrl: "/videos/thumbnails/rain.jpg" },
  { id: "clouds", name: "Clouds", category: "nature", videoUrl: "/videos/presets/clouds.mp4", thumbnailUrl: "/videos/thumbnails/clouds.jpg" },
  { id: "ocean", name: "Ocean Waves", category: "nature", videoUrl: "/videos/presets/ocean.mp4", thumbnailUrl: "/videos/thumbnails/ocean.jpg" },
  { id: "forest", name: "Forest Canopy", category: "nature", videoUrl: "/videos/presets/forest.mp4", thumbnailUrl: "/videos/thumbnails/forest.jpg" },
  { id: "mosque", name: "Mosque Interior", category: "islamic", videoUrl: "/videos/presets/mosque.mp4", thumbnailUrl: "/videos/thumbnails/mosque.jpg" },
  { id: "lanterns", name: "Lanterns", category: "islamic", videoUrl: "/videos/presets/lanterns.mp4", thumbnailUrl: "/videos/thumbnails/lanterns.jpg" },
  { id: "geometric", name: "Geometric Patterns", category: "islamic", videoUrl: "/videos/presets/geometric.mp4", thumbnailUrl: "/videos/thumbnails/geometric.jpg" },
  { id: "bokeh", name: "Bokeh Lights", category: "abstract", videoUrl: "/videos/presets/bokeh.mp4", thumbnailUrl: "/videos/thumbnails/bokeh.jpg" },
  { id: "particles", name: "Slow Particles", category: "abstract", videoUrl: "/videos/presets/particles.mp4", thumbnailUrl: "/videos/thumbnails/particles.jpg" },
  { id: "aurora", name: "Aurora", category: "abstract", videoUrl: "/videos/presets/aurora.mp4", thumbnailUrl: "/videos/thumbnails/aurora.jpg" },
  { id: "starfield", name: "Starfield", category: "night", videoUrl: "/videos/presets/starfield.mp4", thumbnailUrl: "/videos/thumbnails/starfield.jpg" },
  { id: "moonlight", name: "Moonlit Sky", category: "night", videoUrl: "/videos/presets/moonlight.mp4", thumbnailUrl: "/videos/thumbnails/moonlight.jpg" },
];

export const VIDEO_CATEGORIES = ["nature", "islamic", "abstract", "night"] as const;
