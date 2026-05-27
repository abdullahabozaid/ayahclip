export interface VideoPreset {
  id: string;
  name: string;
  category: "nature" | "islamic" | "abstract" | "night";
  videoUrl: string;
  thumbnailUrl: string | null;
}

export const VIDEO_PRESETS: VideoPreset[] = [
  {
    id: "rain",
    name: "Rain on Window",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/5197762/5197762-uhd_2560_1440_25fps.mp4",
    thumbnailUrl: null,
  },
  {
    id: "ocean",
    name: "Ocean Waves",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/1093652/1093652-uhd_2560_1440_30fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/1093652/free-video-1093652.jpg?auto=compress&cs=tinysrgb&w=280",
  },
  {
    id: "clouds",
    name: "Cloud Timelapse",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/856171/856171-hd_1920_1080_30fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/856171/free-video-856171.jpg?auto=compress&cs=tinysrgb&w=280",
  },
  {
    id: "forest-1",
    name: "Sunlit Forest",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/852335/852335-hd_1920_1080_24fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/852335/free-video-852335.jpg?auto=compress&cs=tinysrgb&w=280",
  },
  {
    id: "forest-2",
    name: "Forest Canopy",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/1448735/1448735-uhd_2732_1440_24fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/1448735/free-video-1448735.jpg?auto=compress&cs=tinysrgb&w=280",
  },
  {
    id: "mosque",
    name: "Prophet's Mosque",
    category: "islamic",
    videoUrl: "https://videos.pexels.com/video-files/3687764/3687764-hd_1920_1080_30fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/3687764/pexels-photo-3687764.jpeg?auto=compress&cs=tinysrgb&w=280",
  },
  {
    id: "islamic-bg",
    name: "Islamic Domes",
    category: "islamic",
    videoUrl: "https://videos.pexels.com/video-files/15399236/15399236-uhd_1440_2160_30fps.mp4",
    thumbnailUrl: null,
  },
  {
    id: "bokeh",
    name: "Bokeh Lights",
    category: "abstract",
    videoUrl: "https://videos.pexels.com/video-files/5926164/5926164-hd_1920_1080_30fps.mp4",
    thumbnailUrl: null,
  },
  {
    id: "misty-mountains",
    name: "Misty Mountains",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/2169880/2169880-uhd_2560_1440_30fps.mp4",
    thumbnailUrl: null,
  },
  {
    id: "sunset-sky",
    name: "Sunset Sky",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/3214448/3214448-uhd_2560_1440_25fps.mp4",
    thumbnailUrl: null,
  },
  {
    id: "calm-lake",
    name: "Calm Lake",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/4763824/4763824-uhd_2560_1440_24fps.mp4",
    thumbnailUrl: null,
  },
  {
    id: "desert-dunes",
    name: "Desert Dunes",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/5752729/5752729-hd_1920_1080_30fps.mp4",
    thumbnailUrl: null,
  },
  {
    id: "starry-night",
    name: "Starry Night",
    category: "night",
    videoUrl: "https://videos.pexels.com/video-files/7710243/7710243-uhd_2560_1440_30fps.mp4",
    thumbnailUrl: null,
  },
];

export const VIDEO_CATEGORIES = ["nature", "islamic", "night", "abstract"] as const;
