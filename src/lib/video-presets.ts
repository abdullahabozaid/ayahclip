export interface VideoPreset {
  id: string;
  name: string;
  category: "nature" | "islamic" | "abstract" | "night";
  videoUrl: string;
  thumbnailUrl: string | null;
  /** Manually reviewed to contain no visible people. */
  peopleFree: true;
}

export const VIDEO_PRESETS: VideoPreset[] = [
  {
    id: "rain",
    name: "Rain on Window",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/5197762/5197762-uhd_2560_1440_25fps.mp4",
    thumbnailUrl: null,
    peopleFree: true,
  },
  {
    id: "ocean",
    name: "Ocean Waves",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/1093652/1093652-uhd_2560_1440_30fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/1093652/free-video-1093652.jpg?auto=compress&cs=tinysrgb&w=280",
    peopleFree: true,
  },
  {
    id: "clouds",
    name: "Cloud Timelapse",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/856171/856171-hd_1920_1080_30fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/856171/free-video-856171.jpg?auto=compress&cs=tinysrgb&w=280",
    peopleFree: true,
  },
  {
    id: "forest-1",
    name: "Sunlit Forest",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/852335/852335-hd_1920_1080_24fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/852335/free-video-852335.jpg?auto=compress&cs=tinysrgb&w=280",
    peopleFree: true,
  },
  {
    id: "forest-2",
    name: "Forest Canopy",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/1448735/1448735-uhd_2732_1440_24fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/1448735/free-video-1448735.jpg?auto=compress&cs=tinysrgb&w=280",
    peopleFree: true,
  },
  {
    id: "islamic-bg",
    name: "Islamic Domes",
    category: "islamic",
    videoUrl: "https://videos.pexels.com/video-files/15399236/15399236-uhd_1440_2160_30fps.mp4",
    thumbnailUrl: null,
    peopleFree: true,
  },
  {
    id: "bokeh",
    name: "Bokeh Lights",
    category: "abstract",
    videoUrl: "https://videos.pexels.com/video-files/5926164/5926164-hd_1920_1080_30fps.mp4",
    thumbnailUrl: null,
    peopleFree: true,
  },
  {
    id: "misty-mountains",
    name: "Tropical Coast",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/2169880/2169880-uhd_2560_1440_30fps.mp4",
    thumbnailUrl: null,
    peopleFree: true,
  },
  {
    id: "sunset-sky",
    name: "Alpine Valley",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/3214448/3214448-uhd_2560_1440_25fps.mp4",
    thumbnailUrl: null,
    peopleFree: true,
  },
  {
    id: "calm-lake",
    name: "Misty Ridge",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/4763824/4763824-uhd_2560_1440_24fps.mp4",
    thumbnailUrl: null,
    peopleFree: true,
  },
  {
    id: "starry-night",
    name: "Floating Moss",
    category: "abstract",
    videoUrl: "https://videos.pexels.com/video-files/7710243/7710243-uhd_2560_1440_30fps.mp4",
    thumbnailUrl: null,
    peopleFree: true,
  },
];

export const VIDEO_CATEGORIES = ["nature", "islamic", "night", "abstract"] as const;
