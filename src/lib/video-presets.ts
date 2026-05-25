export interface VideoPreset {
  id: string;
  name: string;
  category: "nature" | "islamic" | "abstract";
  videoUrl: string;
  thumbnailUrl: string;
}

const pexelsThumb = (id: number) =>
  `https://images.pexels.com/videos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=280`;

export const VIDEO_PRESETS: VideoPreset[] = [
  {
    id: "rain",
    name: "Rain on Window",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/5197762/5197762-uhd_2560_1440_25fps.mp4",
    thumbnailUrl: pexelsThumb(5197762),
  },
  {
    id: "ocean",
    name: "Ocean Waves",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/1093652/1093652-uhd_2560_1440_30fps.mp4",
    thumbnailUrl: pexelsThumb(1093652),
  },
  {
    id: "clouds",
    name: "Cloud Timelapse",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/856171/856171-hd_1920_1080_30fps.mp4",
    thumbnailUrl: pexelsThumb(856171),
  },
  {
    id: "forest-1",
    name: "Sunlit Forest",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/852335/852335-hd_1920_1080_24fps.mp4",
    thumbnailUrl: pexelsThumb(852335),
  },
  {
    id: "forest-2",
    name: "Forest Canopy",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/1448735/1448735-uhd_2732_1440_24fps.mp4",
    thumbnailUrl: pexelsThumb(1448735),
  },
  {
    id: "mosque",
    name: "Prophet's Mosque",
    category: "islamic",
    videoUrl: "https://videos.pexels.com/video-files/3687764/3687764-hd_1920_1080_30fps.mp4",
    thumbnailUrl: pexelsThumb(3687764),
  },
  {
    id: "islamic-bg",
    name: "Islamic Domes",
    category: "islamic",
    videoUrl: "https://videos.pexels.com/video-files/15399236/15399236-uhd_1440_2160_30fps.mp4",
    thumbnailUrl: pexelsThumb(15399236),
  },
  {
    id: "bokeh",
    name: "Bokeh Lights",
    category: "abstract",
    videoUrl: "https://videos.pexels.com/video-files/5926164/5926164-hd_1920_1080_30fps.mp4",
    thumbnailUrl: pexelsThumb(5926164),
  },
];

export const VIDEO_CATEGORIES = ["nature", "islamic", "abstract"] as const;
